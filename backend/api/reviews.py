"""This route returns the review queue — all questions with scheduled FSRS reviews, sorted by due date, so the frontend can display upcoming and overdue reviews."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Answer, Question


router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("")
def get_review_queue(session_id: str = Query(...), db: Session = Depends(get_db)):
    """Returns upcoming reviews — questions that have a next_review_at scheduled."""
    now = int(time.time())

    # Get all questions with a scheduled review, along with their most recent answer
    scheduled_questions = (
        db.query(Question)
        .filter(Question.next_review_at != None)  # noqa: E711
        .order_by(Question.next_review_at.asc())
        .all()
    )

    result = []
    for q in scheduled_questions:
        # Get the most recent answer for this question
        latest_answer = (
            db.query(Answer)
            .filter(Answer.question_id == q.id)
            .order_by(desc(Answer.id))
            .first()
        )

        was_correct = 2  # default
        if latest_answer:
            if not latest_answer.correct:
                was_correct = 0 if latest_answer.score < 50 else 1
            else:
                was_correct = 2

        question_text = q.text
        if len(question_text) > 80:
            question_text = question_text[:80] + "..."

        result.append({
            "question_id": q.id,
            "question_text": question_text,
            "next_review_at": q.next_review_at,
            "seconds_until": max(0, q.next_review_at - now),
            "was_correct": was_correct,
            "difficulty": round(q.review_difficulty or 5.0, 1),
            "review_count": q.review_count or 0,
        })

    return {"reviews": result}
