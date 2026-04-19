"""This route sends the user's answer to the LLM for semantic evaluation, records
the graded result, pushes an accuracy signal into the load aggregator so the
adaptive pipeline steers difficulty in real-time, and schedules spaced repetition.

Falls back to deterministic string matching if the LLM is unavailable.
"""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.load_aggregator import load_aggregator
from db.database import get_db
from db.models import Answer, Document, Question, Session as StudySession
from llm.answer_evaluator import evaluate_answer
from signals.latency_tracker import latency_tracker
from core.chunk_manager import ChunkSessionManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/answer", tags=["answer"])

CORRECT_INTERVAL_DAYS = 7   # 1 week for correct answers
INCORRECT_INTERVAL_DAYS = 1  # 1 day for incorrect answers


class AnswerRequest(BaseModel):
    session_id: str = Field(min_length=1)
    question_id: str = Field(min_length=1)
    answer_text: str = Field(min_length=1)
    latency_ms: int = Field(ge=0)


def _get_source_chunk(question: Question, db: Session) -> str | None:
    """Retrieve the source chunk text for the question if available."""
    if question.chunk_index is None or not question.doc_id:
        return None
    try:
        from api.question import SESSION_MANAGERS
        # Try to find a session manager that has this chunk
        for manager in SESSION_MANAGERS.values():
            if question.chunk_index in manager.chunks:
                return manager.chunks[question.chunk_index]["text"]
    except Exception:
        pass
    return None


@router.post("")
async def submit_answer(payload: AnswerRequest, db: Session = Depends(get_db)):
    question = db.get(Question, payload.question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")

    # Retrieve source context for richer evaluation
    source_context = _get_source_chunk(question, db)

    # --- LLM-based semantic evaluation ---
    eval_result = await evaluate_answer(
        question_text=question.text,
        correct_answer=question.correct_answer or "",
        user_answer=payload.answer_text,
        explanation=question.explanation,
        source_context=source_context,
        difficulty_band=question.band,
    )

    score = eval_result["score"]
    verdict = eval_result["verdict"]
    correct = verdict == "correct"
    reasoning = eval_result["reasoning"]
    suggestions = eval_result["suggestions"]
    explanation = question.explanation or "No explanation provided for this question."

    answer = Answer(
        question_id=payload.question_id,
        session_id=payload.session_id,
        answer_text=payload.answer_text,
        latency_ms=payload.latency_ms,
        correct=correct,
        score=score,
        verdict=verdict,
        reasoning=reasoning,
        suggestions=suggestions,
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

    # --- Push accuracy signal into the load pipeline ---
    # Invert: high answer score → low load contribution (student comfortable)
    #         low answer score  → high load contribution (student struggling)
    accuracy_load_signal = 100.0 - score
    asyncio.create_task(
        load_aggregator.update_signal(payload.session_id, "accuracy", accuracy_load_signal)
    )

    return {
        "correct": correct,
        "score": score,
        "verdict": verdict,
        "reasoning": reasoning,
        "suggestions": suggestions,
        "explanation": explanation,
        "next_review_in_days": interval_days,
        "llm_evaluated": eval_result.get("llm_evaluated", False),
    }
