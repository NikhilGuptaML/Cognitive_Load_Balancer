"""This route handles local PDF uploads, stores the file on disk, indexes its text for retrieval, and persists the document metadata needed by later study sessions."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from core.document_processor import index_document
from db.database import get_db
from db.models import Document


router = APIRouter(prefix="/document", tags=["document"])

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    namespace: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")

    doc_id = str(uuid4())
    safe_filename = f"{doc_id}_{Path(file.filename).name}"
    destination = UPLOAD_DIR / safe_filename
    content = await file.read()
    destination.write_bytes(content)

    try:
        index = index_document(destination, namespace or doc_id)
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

    return {"doc_id": doc_id, "chunk_count": index.chunk_count}
