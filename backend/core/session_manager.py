"""This module provides lightweight session orchestration so the API can consistently start sessions, compute Pomodoro timing, and assemble end-of-session reports from persisted activity."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core.difficulty_controller import BAND_CONFIGS
from db.models import Answer, BandChange, LoadEvent, Question, Session as StudySession


def create_session(db: Session, user_id: str, doc_id: str, pomodoro_length: int | None = None) -> StudySession:
    session = StudySession(
        id=str(uuid4()),
        user_id=user_id,
        doc_id=doc_id,
        pomodoro_length=pomodoro_length or 25,
        status="active",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def end_session(db: Session, session: StudySession) -> StudySession:
    session.status = "completed"
    session.ended_at = datetime.utcnow()
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def pomodoro_snapshot(session: StudySession) -> dict[str, Any]:
    started_at = session.started_at or datetime.utcnow()
    elapsed = int((datetime.utcnow() - started_at).total_seconds())
    configured_seconds = max(0, int(session.pomodoro_length) * 60)
    remaining = max(0, configured_seconds - elapsed)
    return {
        "elapsed_seconds": elapsed,
        "remaining_seconds": remaining,
        "should_pause": remaining == 0,
        "recommended_seconds": BAND_CONFIGS.get("OPTIMAL").session_duration_seconds,
    }


def build_session_report(db: Session, session_id: str) -> dict[str, Any]:
    session = db.get(StudySession, session_id)
    if session is None:
        raise LookupError("Session not found.")

    avg_load = db.scalar(select(func.avg(LoadEvent.composite_score)).where(LoadEvent.session_id == session_id)) or 0.0
    answer_count = db.scalar(select(func.count(Answer.id)).where(Answer.session_id == session_id)) or 0
    correct_count = db.scalar(select(func.count(Answer.id)).where(Answer.session_id == session_id, Answer.correct.is_(True))) or 0

    load_events = db.scalars(
        select(LoadEvent).where(LoadEvent.session_id == session_id).order_by(LoadEvent.timestamp.asc())
    ).all()
    band_changes = db.scalars(
        select(BandChange).where(BandChange.session_id == session_id).order_by(BandChange.timestamp.asc())
    ).all()
    recent_questions = db.scalars(
        select(Question).where(Question.session_id == session_id).order_by(Question.asked_at.desc()).limit(5)
    ).all()

    return {
        "session_id": session.id,
        "status": session.status,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "pomodoro": pomodoro_snapshot(session),
        "avg_load": round(float(avg_load), 2),
        "accuracy": round((correct_count / answer_count) * 100, 2) if answer_count else 0.0,
        "answer_count": answer_count,
        "correct_count": correct_count,
        "load_series": [
            {"timestamp": event.timestamp.isoformat(), "score": event.composite_score, "band": event.band}
            for event in load_events
        ],
        "band_changes": [
            {
                "timestamp": change.timestamp.isoformat(),
                "from_band": change.from_band,
                "to_band": change.to_band,
                "trigger_score": change.trigger_score,
                "reason": change.reason,
            }
            for change in band_changes
        ],
        "recent_questions": [
            {"id": question.id, "text": question.text, "band": question.band, "hint": question.hint}
            for question in recent_questions
        ],
    }
