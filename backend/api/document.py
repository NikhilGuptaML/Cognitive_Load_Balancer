"""This route handles local PDF uploads, stores the file on disk, indexes its text for retrieval, and persists the document metadata. On re-upload of the same filename, reuses the existing document and surfaces overdue questions."""

from __future__ import annotations

import time
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from core.document_processor import index_document
from db.database import get_db
from db.models import Document, Question


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
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")

    # --- Re-upload detection: check if a document with the same filename exists ---
    existing_doc = db.query(Document).filter(Document.filename == file.filename).first()
    if existing_doc:
        now = int(time.time())
        overdue_data = _get_overdue_questions(db, existing_doc.id, now)
        return {
            "doc_id": existing_doc.id,
            "chunk_count": existing_doc.chunk_count,
            "is_reupload": True,
            **overdue_data,
        }

    # --- First-time upload: index and store ---
    doc_id = str(uuid4())
    safe_filename = f"{doc_id}_{Path(file.filename).name}"
    destination = UPLOAD_DIR / safe_filename
    content = await file.read()
    destination.write_bytes(content)

    try:
        # FIXED: Run CPU/IO-heavy indexing off the async event loop.
        index = await run_in_threadpool(index_document, destination, namespace or doc_id)
    except ValueError as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Document indexing failed: {exc}") from exc

    document = Document(
        id=doc_id,
        filename=file.filename,
        chunk_count=index.chunk_count,
        chroma_path=f"{index.chroma_path}::{index.collection_name}",
    )
    db.add(document)
    db.commit()

    return {"doc_id": doc_id, "chunk_count": index.chunk_count, "is_reupload": False}
