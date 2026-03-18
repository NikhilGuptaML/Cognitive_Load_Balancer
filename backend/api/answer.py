"""This route evaluates an answer against locally retrieved document context, updates the response-latency signal, and stores the graded result. Uses fixed revision timers: 1 week for correct, 1 day for incorrect."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from core.load_aggregator import load_aggregator
from db.database import get_db
from db.models import Answer, Document, Question, Session as StudySession
from signals.latency_tracker import latency_tracker


router = APIRouter(prefix="/answer", tags=["answer"])

CORRECT_INTERVAL_DAYS = 7   # 1 week for correct answers
INCORRECT_INTERVAL_DAYS = 1  # 1 day for incorrect answers


class AnswerRequest(BaseModel):
    session_id: str = Field(min_length=1)
    question_id: str = Field(min_length=1)
    answer_text: str = Field(min_length=1)
    latency_ms: int = Field(ge=0)


# FIXED: Route handler was at module level (outside any function), causing NameError on import.
# FIXED: Now accepts full option text typed by the user, matched against stored options.
@router.post("")
def submit_answer(payload: AnswerRequest, db: Session = Depends(get_db)):
    question = db.get(Question, payload.question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")

    # FIXED: User types the full option text — match against stored options to find the letter.
    typed_text = payload.answer_text.strip()
    matched_letter = None

    if question.options and isinstance(question.options, dict):
        # First try exact letter match (backwards compat)
        upper_text = typed_text.upper()
        if upper_text in question.options:
            matched_letter = upper_text
        else:
            # Match by typed option text (case-insensitive, trimmed)
            for letter, option_text in question.options.items():
                if typed_text.lower() == str(option_text).strip().lower():
                    matched_letter = letter
                    break

    if matched_letter is None:
        raise HTTPException(
            status_code=400,
            detail="Answer does not match any of the available options. Type the full option text."
        )

    correct = (matched_letter == question.correct_answer)
    score = 100.0 if correct else 0.0
    explanation = question.explanation or "No explanation provided for this question."

    answer = Answer(
        question_id=payload.question_id,
        session_id=payload.session_id,
        answer_text=payload.answer_text,
        latency_ms=payload.latency_ms,
        correct=correct,
        score=score,
    )
    db.add(answer)

    # --- Fixed-interval spaced-repetition scheduling ---
    now = int(time.time())
    if correct:
        interval_days = CORRECT_INTERVAL_DAYS
    else:
        interval_days = INCORRECT_INTERVAL_DAYS

    question.next_review_at = now + interval_days * 86400
    question.was_correct = correct
    question.review_count = (question.review_count or 0) + 1

    db.commit()

    # FIXED: Record latency for the load aggregator.
    latency_tracker.record_latency(payload.session_id, payload.latency_ms)

    return {"correct": correct, "score": score, "explanation": explanation, "next_review_in_days": interval_days}
