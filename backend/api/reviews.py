"""This route returns the review queue — all questions with scheduled reviews, sorted by due date. Supports filtering by doc_id and returns earliest revision times for correct/incorrect categories."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Answer, Question


router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("")
def get_review_queue(
    session_id: str = Query(...),
    doc_id: str = Query(default=None),
    db: Session = Depends(get_db),
):
    """Returns upcoming reviews. Optionally filtered by doc_id. Includes earliest revision times per category."""
    now = int(time.time())

    # Base query for scheduled questions
    base_filter = [Question.next_review_at != None]  # noqa: E711
    if doc_id:
        base_filter.append(Question.doc_id == doc_id)

    scheduled_questions = (
        db.query(Question)
        .filter(*base_filter)
        .order_by(Question.next_review_at.asc())
        .all()
    )

    result = []
    for q in scheduled_questions:
        question_text = q.text
        if len(question_text) > 80:
            question_text = question_text[:80] + "..."

        result.append({
            "question_id": q.id,
            "question_text": question_text,
            "next_review_at": q.next_review_at,
            "seconds_until": max(0, q.next_review_at - now),
            "is_overdue": q.next_review_at <= now,
            "was_correct": q.was_correct,
            "review_count": q.review_count or 0,
        })

    # Calculate earliest revision times for correct/incorrect categories
    filter_with_doc = [Question.next_review_at != None]  # noqa: E711
    if doc_id:
        filter_with_doc.append(Question.doc_id == doc_id)

    earliest_correct_q = (
        db.query(Question)
        .filter(*filter_with_doc, Question.was_correct == True)  # noqa: E712
        .order_by(Question.next_review_at.asc())
        .first()
    )

    earliest_incorrect_q = (
        db.query(Question)
        .filter(*filter_with_doc, Question.was_correct == False)  # noqa: E712
        .order_by(Question.next_review_at.asc())
        .first()
    )

    return {
        "reviews": result,
        "earliest_correct_review": earliest_correct_q.next_review_at if earliest_correct_q else None,
        "earliest_incorrect_review": earliest_incorrect_q.next_review_at if earliest_incorrect_q else None,
    }
