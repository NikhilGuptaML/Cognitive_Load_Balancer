"""This module manages research participants for multi-user pilot studies, enabling per-participant data isolation, activation, export, and selective reset without touching other participants' records."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import (
    Answer,
    BandChange,
    LoadEvent,
    Question,
    ResearchParticipant,
    Session as StudySession,
)

router = APIRouter(tags=["participants"])

BAND_ORDER = ["FLOW", "OPTIMAL", "ELEVATED", "OVERLOADED", "CRISIS"]


class CreateParticipantRequest(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = None


# ---------- List all participants ----------

@router.get("")
def list_participants(db: Session = Depends(get_db)):
    participants = db.scalars(
        select(ResearchParticipant).order_by(ResearchParticipant.id)
    ).all()

    result: list[dict[str, Any]] = []
    for p in participants:
        # Count sessions that have at least one load_event tagged with this participant
        session_count = db.scalar(
            select(func.count(func.distinct(LoadEvent.session_id)))
            .where(LoadEvent.participant_id == p.id)
        ) or 0

        # Band distribution summary
        events = db.scalars(
            select(LoadEvent.band).where(LoadEvent.participant_id == p.id)
        ).all()
        band_dist = {b: 0 for b in BAND_ORDER}
        for b in events:
            if b in band_dist:
                band_dist[b] += 1
        total = len(events)
        band_pct = {b: round(100 * c / total) if total else 0 for b, c in band_dist.items()}

        result.append({
            "id": p.id,
            "label": p.label,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "is_active": p.is_active,
            "notes": p.notes,
            "session_count": session_count,
            "event_count": total,
            "band_distribution": band_pct,
        })
    return result


# ---------- Create participant ----------

@router.post("")
def create_participant(payload: CreateParticipantRequest, db: Session = Depends(get_db)):
    participant = ResearchParticipant(
        label=payload.label,
        notes=payload.notes,
        is_active=False,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return {
        "id": participant.id,
        "label": participant.label,
        "is_active": participant.is_active,
    }


# ---------- Activate participant ----------

@router.post("/{participant_id}/activate")
def activate_participant(participant_id: int, db: Session = Depends(get_db)):
    target = db.get(ResearchParticipant, participant_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Participant not found.")

    # Deactivate all
    all_participants = db.scalars(select(ResearchParticipant)).all()
    for p in all_participants:
        p.is_active = False
    target.is_active = True
    db.commit()
    return {"id": target.id, "label": target.label, "is_active": True}


# ---------- Reset (delete) participant data ----------

@router.delete("/{participant_id}/data")
def reset_participant_data(participant_id: int, db: Session = Depends(get_db)):
    target = db.get(ResearchParticipant, participant_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Participant not found.")

    # Find all sessions that have load_events tagged with this participant
    session_ids = list(db.scalars(
        select(func.distinct(LoadEvent.session_id))
        .where(LoadEvent.participant_id == participant_id)
    ).all())

    deleted_events = 0
    deleted_sessions = 0

    if session_ids:
        # Delete answers linked to these sessions
        db.execute(delete(Answer).where(Answer.session_id.in_(session_ids)))
        # Delete questions linked to these sessions
        db.execute(delete(Question).where(Question.session_id.in_(session_ids)))
        # Delete band_changes linked to these sessions
        db.execute(delete(BandChange).where(BandChange.session_id.in_(session_ids)))
        # Delete load_events for this participant
        result = db.execute(delete(LoadEvent).where(LoadEvent.participant_id == participant_id))
        deleted_events = result.rowcount  # type: ignore[union-attr]
        # Delete the sessions themselves
        result2 = db.execute(delete(StudySession).where(StudySession.id.in_(session_ids)))
        deleted_sessions = result2.rowcount  # type: ignore[union-attr]

    db.commit()
    return {"deleted_sessions": deleted_sessions, "deleted_events": deleted_events}


# ---------- Export participant data ----------

@router.get("/{participant_id}/export")
def export_participant_data(participant_id: int, db: Session = Depends(get_db)):
    target = db.get(ResearchParticipant, participant_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Participant not found.")

    events = db.scalars(
        select(LoadEvent)
        .where(LoadEvent.participant_id == participant_id)
        .order_by(LoadEvent.timestamp.asc())
    ).all()

    score_series = [e.composite_score for e in events]
    band_series = [e.band for e in events]

    band_dist = {b: 0 for b in BAND_ORDER}
    for b in band_series:
        if b in band_dist:
            band_dist[b] += 1

    transitions = 0
    for i in range(1, len(band_series)):
        if band_series[i] != band_series[i - 1]:
            transitions += 1

    session_count = db.scalar(
        select(func.count(func.distinct(LoadEvent.session_id)))
        .where(LoadEvent.participant_id == participant_id)
    ) or 0

    # Per-session breakdown
    session_ids = list(db.scalars(
        select(func.distinct(LoadEvent.session_id))
        .where(LoadEvent.participant_id == participant_id)
    ).all())

    sessions_breakdown: list[dict[str, Any]] = []
    for sid in session_ids:
        s_events = db.scalars(
            select(LoadEvent)
            .where(LoadEvent.session_id == sid, LoadEvent.participant_id == participant_id)
            .order_by(LoadEvent.timestamp.asc())
        ).all()
        s_bands = [e.band for e in s_events]
        s_scores = [e.composite_score for e in s_events]
        dominant = max(set(s_bands), key=s_bands.count) if s_bands else "OPTIMAL"
        sessions_breakdown.append({
            "session_id": sid,
            "event_count": len(s_events),
            "avg_score": round(sum(s_scores) / len(s_scores), 2) if s_scores else 0,
            "dominant_band": dominant,
        })

    return {
        "participant": target.label,
        "score_series": score_series,
        "band_series": band_series,
        "band_distribution": band_dist,
        "transitions": transitions,
        "session_count": session_count,
        "sessions_breakdown": sessions_breakdown,
    }
