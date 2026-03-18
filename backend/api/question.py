"""This route selects the current difficulty band, retrieves the most relevant local document context, and generates the next question through Ollama with a deterministic fallback when the model is unavailable."""

from __future__ import annotations

import time
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from core.difficulty_controller import build_question_prompt, get_band
from core.document_processor import retrieve_context
from core.load_aggregator import load_aggregator
from db.database import get_db
from db.models import Document, Question, Session as StudySession
from llm.ollama_client import OllamaUnavailableError, ollama_client
from signals.latency_tracker import latency_tracker


router = APIRouter(prefix="/question", tags=["question"])


def _document_collection_name(document: Document) -> str:
    try:
        return document.chroma_path.split("::", 1)[1]
    except Exception as exc:
        raise LookupError("Document index metadata is invalid.") from exc


def _fallback_question(context_chunks: list[str], band: str) -> dict[str, str]:
    source = context_chunks[0] if context_chunks else "the uploaded material"
    excerpt = source[:220].strip()
    return {
        "question_text": f"[{band}] Summarize the key idea from this excerpt and explain why it matters: {excerpt}",
        "hint": "Anchor your answer in one concrete detail from the passage.",
    }


@router.get("")
async def get_question(session_id: str = Query(...), topic: str = Query(default=""), db: Session = Depends(get_db)):
    session = db.get(StudySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    document = db.get(Document, session.doc_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    # --- FSRS: check for overdue review questions from previous sessions ---
    now = int(time.time())
    due_question = db.query(Question).filter(
        Question.session_id != session_id,
        Question.next_review_at <= now,
        Question.next_review_at != None,  # noqa: E711
    ).order_by(Question.next_review_at.asc()).first()

    if due_question:
        snapshot = load_aggregator.get_state(session_id)
        band = get_band(snapshot["score"])
        return {
            "question_id": due_question.id,
            "question_text": due_question.text,
            "band": band,
            "hint": due_question.hint,
            "is_review": True,
        }

    snapshot = load_aggregator.get_state(session_id)
    band = get_band(snapshot["score"])
    question_history = db.scalars(
        select(Question).where(Question.session_id == session_id).order_by(Question.asked_at.desc()).limit(5)
    ).all()
    history_payload = [{"question": item.text, "band": item.band, "hint": item.hint} for item in question_history]

    try:
        # FIXED: Offload blocking ChromaDB retrieval to avoid stalling the async event loop.
        context_chunks = await run_in_threadpool(retrieve_context, _document_collection_name(document), topic or document.filename, 3)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    prompt = build_question_prompt(band=band, context_chunks=context_chunks, history=history_payload)
    try:
        # FIXED: Run blocking local LLM call in a threadpool from async route context.
        llm_response = await run_in_threadpool(ollama_client.generate_json, "phi3:mini", prompt)
        question_text = str(llm_response.get("question_text", "")).strip()
        hint = str(llm_response.get("hint", "")).strip() or None
        if not question_text:
            raise ValueError("Question text was empty.")
    except (OllamaUnavailableError, ValueError):
        fallback = _fallback_question(context_chunks, band)
        question_text = fallback["question_text"]
        hint = fallback["hint"]

    question = Question(
        id=str(uuid4()),
        session_id=session_id,
        text=question_text,
        band=band,
        load_at_time=snapshot["score"],
        hint=hint,
    )
    db.add(question)
    db.commit()
    latency_tracker.mark_question_presented(session_id)

    return {
        "question_id": question.id,
        "question_text": question.text,
        "band": question.band,
        "hint": question.hint,
    }
