"""This route selects the current difficulty band, retrieves the most relevant local document context, and generates the next question through Ollama with a deterministic fallback when the model is unavailable."""

from __future__ import annotations

import time
import os
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from llm.prompt_builder import build_messages
from core.difficulty_controller import get_band
from core.document_processor import get_all_chunks
from core.load_aggregator import load_aggregator
from core.chunk_manager import ChunkSessionManager
from db.database import get_db
from db.models import Document, Question, Session as StudySession
from llm.groq_client import GroqUnavailableError, groq_client
from signals.latency_tracker import latency_tracker


router = APIRouter(prefix="/question", tags=["question"])


def _document_collection_name(document: Document) -> str:
    try:
        return document.chroma_path.split("::", 1)[1]
    except Exception as exc:
        raise LookupError("Document index metadata is invalid.") from exc

SESSION_MANAGERS: dict[str, ChunkSessionManager] = {}

def _get_session_manager(session_id: str, document: Document) -> ChunkSessionManager:
    if session_id not in SESSION_MANAGERS:
        chunks = get_all_chunks(_document_collection_name(document))
        SESSION_MANAGERS[session_id] = ChunkSessionManager(chunks)
    return SESSION_MANAGERS[session_id]

def _fallback_question(band: str) -> dict:
    return {
        "question": f"[{band}] What is the primary theme of the uploaded material?",
        "options": {
            "A": "Core concept application",
            "B": "Theoretical framework",
            "C": "Historical context",
            "D": "Technical implementation"
        },
        "correct_answer": "Core concept application",
        "explanation": "This is a fallback generated question because the model service is unavailable."
    }


@router.get("")
async def get_question(session_id: str = Query(...), topic: str = Query(default=""), db: Session = Depends(get_db)):
    session = db.get(StudySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    document = db.get(Document, session.doc_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    # --- Check for overdue review questions for this document ---
    now = int(time.time())
    due_question = db.query(Question).filter(
        Question.doc_id == session.doc_id,
        Question.next_review_at <= now,
        Question.next_review_at != None,  # noqa: E711
    ).order_by(Question.next_review_at.asc()).first()

    if due_question:
        snapshot = load_aggregator.get_state(session_id)
        band = get_band(snapshot["score"])
        # FIXED: Include options so the frontend can render MCQ choices for review questions.
        return {
            "question_id": due_question.id,
            "question_text": due_question.text,
            "band": band,
            "hint": due_question.hint,
            "options": due_question.options,
            "is_review": True,
        }

    snapshot = load_aggregator.get_state(session_id)
    band = get_band(snapshot["score"])
    question_history = db.scalars(
        select(Question).where(Question.session_id == session_id).order_by(Question.asked_at.desc()).limit(5)
    ).all()
    history_payload = [{"question": item.text, "band": item.band, "hint": item.hint} for item in question_history]

    try:
        manager = await run_in_threadpool(_get_session_manager, session_id, document)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    max_q = int(os.environ.get("MAX_QUESTIONS_PER_CHUNK", 5))
    if manager.is_chunk_exhausted(max_q):
        # FIXED: Check return value — False means all chunks are exhausted.
        if not manager.advance_to_next_chunk():
            return {"session_complete": True, "message": "All chunks have been covered."}

    try:
        messages = build_messages(manager, band)
        
        # Use json_object response format — no tools (Groq rejects response_format + tools together)
        llm_response = await run_in_threadpool(groq_client.generate_json, "llama-3.3-70b-versatile", messages)
        
        question_text = str(llm_response.get("question", "")).strip()
        options = llm_response.get("options", {})
        correct_answer = str(llm_response.get("correct_answer", "")).strip()
        explanation = str(llm_response.get("explanation", "")).strip()
        
        if not question_text or not options or not correct_answer:
            raise ValueError("Incomplete MCQ returned.")
            
        manager.record_question(llm_response)
        
    except (GroqUnavailableError, ValueError, Exception) as exc:
        import logging
        logging.getLogger(__name__).error("LLM question generation failed, using fallback: %s", exc, exc_info=True)
        fallback = _fallback_question(band)
        question_text = fallback["question"]
        options = fallback["options"]
        correct_answer = fallback["correct_answer"]
        explanation = fallback["explanation"]

    question = Question(
        id=str(uuid4()),
        session_id=session_id,
        doc_id=session.doc_id,
        text=question_text,
        band=band,
        load_at_time=snapshot["score"],
        options=options,
        correct_answer=correct_answer,
        explanation=explanation,
        chunk_index=manager.current_chunk_index,
    )
    db.add(question)
    db.commit()
    latency_tracker.mark_question_presented(session_id)

    return {
        "question_id": question.id,
        "question_text": question.text,
        "band": question.band,
        "options": question.options,
        "session_complete": False,
    }
