"""This route evaluates an answer against locally retrieved document context, updates the response-latency signal, and stores the graded result for reports and later adaptation decisions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.document_processor import retrieve_context
from core.load_aggregator import load_aggregator
from db.database import get_db
from db.models import Answer, Document, Question, Session as StudySession
from llm.ollama_client import OllamaUnavailableError, ollama_client
from llm.prompt_builder import render_answer_evaluation_prompt
from signals.latency_tracker import latency_tracker


router = APIRouter(prefix="/answer", tags=["answer"])


class AnswerRequest(BaseModel):
    session_id: str = Field(min_length=1)
    question_id: str = Field(min_length=1)
    answer_text: str = Field(min_length=1)
    latency_ms: int = Field(ge=0)


def _simple_grade(answer_text: str, context_chunks: list[str]) -> dict:
    answer_terms = {term.lower() for term in answer_text.split() if len(term) > 3}
    context_terms = {
        term.lower().strip('.,:;!?()[]{}"\'')
        for chunk in context_chunks
        for term in chunk.split()
        if len(term) > 3
    }
    overlap = len(answer_terms & context_terms)
    score = min(100.0, overlap * 12.5)
    return {
        "correct": score >= 50.0,
        "score": round(score, 2),
        "explanation": "Fallback grading was used because the local model was unavailable. Answers with more document-grounded concepts score higher.",
    }


def _document_collection_name(document: Document) -> str:
    try:
        return document.chroma_path.split("::", 1)[1]
    except Exception as exc:
        raise LookupError("Document index metadata is invalid.") from exc


@router.post("")
async def submit_answer(payload: AnswerRequest, db: Session = Depends(get_db)):
    session = db.get(StudySession, payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    question = db.get(Question, payload.question_id)
    if question is None or question.session_id != payload.session_id:
        raise HTTPException(status_code=404, detail="Question not found for this session.")

    document = db.get(Document, session.doc_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    latency_metrics = latency_tracker.record_latency(payload.session_id, payload.latency_ms)
    await load_aggregator.update_signal(payload.session_id, "latency", latency_metrics["raw_score"])

    context_chunks = retrieve_context(_document_collection_name(document), question.text, k=3)
    prompt = render_answer_evaluation_prompt(question.text, payload.answer_text, context_chunks)
    try:
        result = ollama_client.generate_json(model="phi3:mini", prompt=prompt)
        correct = bool(result.get("correct", False))
        score = max(0.0, min(100.0, float(result.get("score", 0.0))))
        explanation = str(result.get("explanation", "")).strip() or "No explanation provided."
    except (OllamaUnavailableError, ValueError):
        fallback = _simple_grade(payload.answer_text, context_chunks)
        correct = fallback["correct"]
        score = fallback["score"]
        explanation = fallback["explanation"]

    answer = Answer(
        question_id=payload.question_id,
        session_id=payload.session_id,
        answer_text=payload.answer_text,
        latency_ms=payload.latency_ms,
        correct=correct,
        score=score,
    )
    db.add(answer)
    db.commit()

    return {"correct": correct, "score": score, "explanation": explanation}
