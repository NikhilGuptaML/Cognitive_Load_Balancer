"""This route accepts NASA-TLX self-report ratings submitted by the learner, snaps the current composite load score from the latest load event, and returns all historical ratings for a session so downstream analysis can compare ground truth against the CLB estimator."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import LoadEvent, SelfReportRating, Session as StudySession


router = APIRouter(prefix="/session", tags=["self-report"])


class SelfReportRequest(BaseModel):
    question_number: int = Field(ge=1, description="After which answered question this was triggered")
    mental_demand: int = Field(ge=0, le=100)
    physical_demand: int = Field(ge=0, le=100)
    temporal_demand: int = Field(ge=0, le=100)
    performance: int = Field(ge=0, le=100)
    effort: int = Field(ge=0, le=100)
    frustration: int = Field(ge=0, le=100)
    single_scale_overall: int = Field(ge=0, le=100)


@router.post("/{session_id}/self-report")
def submit_self_report(
    session_id: str,
    payload: SelfReportRequest,
    db: Session = Depends(get_db),
):
    """Accept a NASA-TLX self-report, snapshot the current composite load score, and persist the record."""
    session = db.get(StudySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    # Snapshot the most recent composite load score for this session.
    latest_event = db.scalar(
        select(LoadEvent)
        .where(LoadEvent.session_id == session_id)
        .order_by(LoadEvent.timestamp.desc())
        .limit(1)
    )
    composite_load_at_time = latest_event.composite_score if latest_event else 0.0

    rating = SelfReportRating(
        session_id=session_id,
        timestamp=datetime.utcnow(),
        question_number=payload.question_number,
        mental_demand=payload.mental_demand,
        physical_demand=payload.physical_demand,
        temporal_demand=payload.temporal_demand,
        performance=payload.performance,
        effort=payload.effort,
        frustration=payload.frustration,
        single_scale_overall=payload.single_scale_overall,
        composite_load_at_time=composite_load_at_time,
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)

    return {
        "id": rating.id,
        "session_id": rating.session_id,
        "timestamp": rating.timestamp.isoformat(),
        "question_number": rating.question_number,
        "mental_demand": rating.mental_demand,
        "physical_demand": rating.physical_demand,
        "temporal_demand": rating.temporal_demand,
        "performance": rating.performance,
        "effort": rating.effort,
        "frustration": rating.frustration,
        "single_scale_overall": rating.single_scale_overall,
        "composite_load_at_time": rating.composite_load_at_time,
    }


@router.get("/{session_id}/self-reports")
def list_self_reports(session_id: str, db: Session = Depends(get_db)):
    """Return all NASA-TLX ratings for a session, ordered by submission time ascending."""
    session = db.get(StudySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    ratings = (
        db.query(SelfReportRating)
        .filter(SelfReportRating.session_id == session_id)
        .order_by(SelfReportRating.timestamp.asc())
        .all()
    )

    return [
        {
            "id": r.id,
            "session_id": r.session_id,
            "timestamp": r.timestamp.isoformat(),
            "question_number": r.question_number,
            "mental_demand": r.mental_demand,
            "physical_demand": r.physical_demand,
            "temporal_demand": r.temporal_demand,
            "performance": r.performance,
            "effort": r.effort,
            "frustration": r.frustration,
            "single_scale_overall": r.single_scale_overall,
            "composite_load_at_time": r.composite_load_at_time,
        }
        for r in ratings
    ]
