"""This route ingests passive local signals, updates the live composite load state, and persists each snapshot so the UI and later reports stay consistent."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.load_aggregator import load_aggregator
from db.database import get_db
from db.models import BandChange, LoadEvent, Session as StudySession


router = APIRouter(prefix="/signal", tags=["signal"])


class KeystrokeSignalRequest(BaseModel):
    session_id: str = Field(min_length=1)
    ikiVariance: float = 0.0
    wpm: float = 0.0
    backspaceRate: float = 0.0
    rawScore: float = Field(ge=0, le=100)


class FaceSignalRequest(BaseModel):
    session_id: str = Field(min_length=1)
    ear: float | None = None
    blinks_per_min: float | None = None
    brow_distance: float | None = None
    raw_score: float = Field(ge=0, le=100)


def _persist_snapshot(db: Session, session_id: str, payload: dict, reason: str) -> None:
    session = db.get(StudySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    previous_event = db.scalar(
        select(LoadEvent).where(LoadEvent.session_id == session_id).order_by(LoadEvent.timestamp.desc()).limit(1)
    )
    previous_band = previous_event.band if previous_event else None

    event = LoadEvent(
        session_id=session_id,
        timestamp=datetime.utcnow(),
        keystroke_score=payload["subscores"]["keystroke"],
        face_score=payload["subscores"]["facial"],
        latency_score=payload["subscores"]["latency"],
        composite_score=payload["score"],
        band=payload["band"],
        signals_active=payload["signalsActive"],
    )
    db.add(event)

    if previous_band != payload["band"]:
        db.add(
            BandChange(
                session_id=session_id,
                from_band=previous_band,
                to_band=payload["band"],
                trigger_score=payload["score"],
                reason=reason,
            )
        )
    db.commit()


@router.post("/keystroke")
async def ingest_keystroke_signal(payload: KeystrokeSignalRequest, db: Session = Depends(get_db)):
    snapshot = await load_aggregator.update_signal(payload.session_id, "keystroke", payload.rawScore)
    _persist_snapshot(db, payload.session_id, snapshot, reason="keystroke_update")
    return snapshot


@router.post("/face")
async def ingest_face_signal(payload: FaceSignalRequest, db: Session = Depends(get_db)):
    snapshot = await load_aggregator.update_signal(payload.session_id, "facial", payload.raw_score)
    _persist_snapshot(db, payload.session_id, snapshot, reason="face_update")
    return snapshot
