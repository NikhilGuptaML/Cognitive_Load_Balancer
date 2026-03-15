"""This route creates study sessions and returns session summaries so the frontend can move cleanly from setup into the live adaptive study loop and later into the report view."""

from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.session_manager import build_session_report, create_session
from db.database import get_db
from db.models import Document


router = APIRouter(prefix="/session", tags=["session"])


class StartSessionRequest(BaseModel):
    user_id: str = Field(min_length=1)
    doc_id: str = Field(min_length=1)
    pomodoro_length: int = Field(default=25, ge=1, le=120)


@router.post("/start")
def start_session(payload: StartSessionRequest, db: Session = Depends(get_db)):
    document = db.get(Document, payload.doc_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    session = create_session(db, user_id=payload.user_id, doc_id=payload.doc_id, pomodoro_length=payload.pomodoro_length)
    return {
        "session_id": session.id,
        "status": session.status,
        "doc_id": session.doc_id,
        "pomodoro_length": session.pomodoro_length,
        "started_at": session.started_at.isoformat() if session.started_at else None,
    }


@router.get("/report")
def get_session_report(session_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        return build_session_report(db, session_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
