"""This route handles local PDF uploads, stores the file on disk, indexes its text for retrieval, and persists the document metadata. On re-upload of the same filename, reuses the existing document and surfaces overdue questions."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from core.document_processor import index_document
from db.database import get_db
from db.models import Document, Question, Session as StudySession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/document", tags=["document"])

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _get_overdue_questions(db: Session, doc_id: str, now: int) -> dict:
    """Query overdue questions for a document, split by correct/incorrect."""
    overdue_correct = (
        db.query(Question)
        .filter(
            Question.doc_id == doc_id,
            Question.was_correct == True,  # noqa: E712
            Question.next_review_at != None,  # noqa: E711
            Question.next_review_at <= now,
        )
        .order_by(Question.next_review_at.asc())
        .all()
    )

    overdue_incorrect = (
        db.query(Question)
        .filter(
            Question.doc_id == doc_id,
            Question.was_correct == False,  # noqa: E712
            Question.next_review_at != None,  # noqa: E711
            Question.next_review_at <= now,
        )
        .order_by(Question.next_review_at.asc())
        .all()
    )

    # Earliest scheduled review for each category (including non-overdue)
    earliest_correct_q = (
        db.query(Question)
        .filter(
            Question.doc_id == doc_id,
            Question.was_correct == True,  # noqa: E712
            Question.next_review_at != None,  # noqa: E711
        )
        .order_by(Question.next_review_at.asc())
        .first()
    )

    earliest_incorrect_q = (
        db.query(Question)
        .filter(
            Question.doc_id == doc_id,
            Question.was_correct == False,  # noqa: E712
            Question.next_review_at != None,  # noqa: E711
        )
        .order_by(Question.next_review_at.asc())
        .first()
    )

    return {
        "overdue_correct": [
            {"question_id": q.id, "question_text": q.text[:120], "next_review_at": q.next_review_at}
            for q in overdue_correct
        ],
        "overdue_incorrect": [
            {"question_id": q.id, "question_text": q.text[:120], "next_review_at": q.next_review_at}
            for q in overdue_incorrect
        ],
        "earliest_correct_review": earliest_correct_q.next_review_at if earliest_correct_q else None,
        "earliest_incorrect_review": earliest_incorrect_q.next_review_at if earliest_incorrect_q else None,
    }


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    namespace: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    logger.info("=== /document/upload called  file=%s ===", file.filename)
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")

    # --- Re-upload detection: check if a document with the same filename exists ---
    existing_doc = db.query(Document).filter(Document.filename == file.filename).first()
    if existing_doc:
        logger.info("Re-upload detected for '%s' (doc_id=%s)", file.filename, existing_doc.id)
        # Verify that the underlying Chroma collection still exists
        import chromadb
        from core.document_processor import CHROMA_DIR
        try:
            collection_name = existing_doc.chroma_path.split("::", 1)[1]
            # Bug 1 fix: get_collection can raise on stale/corrupt persisted
            # config (e.g. missing '_type' key after a ChromaDB upgrade).
            # Fall back to create_collection so the re-upload path still works.
            client = chromadb.PersistentClient(path=str(CHROMA_DIR))
            try:
                client.get_collection(collection_name)
            except Exception:
                logger.warning(
                    "get_collection('%s') failed; falling back to create_collection",
                    collection_name,
                )
                client.get_or_create_collection(collection_name)

            now = int(time.time())
            overdue_data = _get_overdue_questions(db, existing_doc.id, now)
            logger.info("Re-upload returning existing doc_id=%s", existing_doc.id)
            return {
                "doc_id": existing_doc.id,
                "chunk_count": existing_doc.chunk_count,
                "is_reupload": True,
                **overdue_data,
            }
        except Exception:
            logger.exception(
                "Re-upload check failed for '%s'; removing stale DB entry and re-indexing",
                file.filename,
            )
            # Stale DB entry (chroma folder was cleared), remove it so we re-index cleanly.
            # Must delete related sessions first — Session.doc_id is NOT NULL,
            # so SQLAlchemy cannot nullify the FK when the Document is deleted.
            # Delete via ORM (not bulk) so cascade to child tables fires.
            stale_sessions = db.query(StudySession).filter(StudySession.doc_id == existing_doc.id).all()
            for s in stale_sessions:
                db.delete(s)
            db.delete(existing_doc)
            db.commit()

    # --- First-time upload: index and store ---
    doc_id = str(uuid4())
    safe_filename = f"{doc_id}_{Path(file.filename).name}"
    destination = UPLOAD_DIR / safe_filename
    logger.info("Reading uploaded file bytes...")
    content = await file.read()
    destination.write_bytes(content)
    logger.info("Saved %d bytes to %s", len(content), destination)

    try:
        # Run CPU/IO-heavy indexing off the async event loop.
        logger.info("Starting index_document in threadpool...")
        index = await run_in_threadpool(index_document, destination, namespace or doc_id)
        logger.info("index_document returned: %d chunks", index.chunk_count)

        document = Document(
            id=doc_id,
            filename=file.filename,
            chunk_count=index.chunk_count,
            chroma_path=f"{index.chroma_path}::{index.collection_name}",
        )
        db.add(document)
        db.commit()
        logger.info("Document persisted to DB: doc_id=%s", doc_id)
    except ValueError as exc:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        destination.unlink(missing_ok=True)
        logger.exception("Document upload failed for '%s'", file.filename)
        raise HTTPException(
            status_code=500,
            detail=f"Document upload failed: {exc}",
        ) from exc

    return {"doc_id": doc_id, "chunk_count": index.chunk_count, "is_reupload": False}
