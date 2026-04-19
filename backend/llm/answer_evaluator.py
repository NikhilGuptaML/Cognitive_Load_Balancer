"""This module builds an evaluation prompt and calls Groq to semantically grade
the user's free-text answer against the expected correct answer and source context.

Returns a structured verdict with score, reasoning, and study suggestions so the
adaptive pipeline can steer difficulty based on actual comprehension — not just
string matching.
"""

from __future__ import annotations

import logging
from typing import Any

from starlette.concurrency import run_in_threadpool

from llm.groq_client import GroqUnavailableError, groq_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are a precise academic answer evaluator. You will be given:\n"
    "1. A question\n"
    "2. The expected correct answer\n"
    "3. The student's submitted answer\n"
    "4. (Optionally) source material context\n\n"
    "Your job is to evaluate the student's answer for conceptual correctness.\n"
    "RULES:\n"
    "- Focus on whether the student demonstrates understanding, not whether they used the exact same words.\n"
    "- Synonyms, paraphrasing, and differently-structured explanations are acceptable if conceptually correct.\n"
    "- Partial credit is appropriate when the answer is on the right track but incomplete or slightly inaccurate.\n"
    "- A score of 0 means completely wrong or irrelevant. A score of 100 means perfect understanding.\n\n"
    "Respond ONLY with valid JSON matching this schema:\n"
    '{"score": <0-100 integer>, '
    '"verdict": "<correct|partially_correct|incorrect>", '
    '"reasoning": "<1-2 sentences explaining your grading decision>", '
    '"suggestions": "<1 sentence study suggestion for the student>"}\n'
    "No preamble, no markdown, no extra text."
)


def _build_eval_messages(
    question_text: str,
    correct_answer: str,
    user_answer: str,
    explanation: str | None = None,
    source_context: str | None = None,
    difficulty_band: str | None = None,
) -> list[dict[str, str]]:
    """Build the chat messages for the evaluation call."""
    system_msg = {"role": "system", "content": _SYSTEM_PROMPT}

    user_parts = [
        f"**Question:** {question_text}",
        f"**Expected correct answer:** {correct_answer}",
        f"**Student's answer:** {user_answer}",
    ]
    if explanation:
        user_parts.append(f"**Explanation / context:** {explanation}")
    if source_context:
        # Truncate to avoid exceeding context window
        truncated = source_context[:2000]
        user_parts.append(f"**Source material excerpt:**\n{truncated}")
    if difficulty_band:
        user_parts.append(f"**Difficulty band:** {difficulty_band}")

    user_msg = {"role": "user", "content": "\n\n".join(user_parts)}
    return [system_msg, user_msg]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def evaluate_answer(
    question_text: str,
    correct_answer: str,
    user_answer: str,
    explanation: str | None = None,
    source_context: str | None = None,
    difficulty_band: str | None = None,
) -> dict[str, Any]:
    """Call the LLM to evaluate a student answer. Returns structured grading.

    On LLM failure, falls back to basic string matching so the pipeline never
    blocks.
    """
    try:
        messages = _build_eval_messages(
            question_text=question_text,
            correct_answer=correct_answer,
            user_answer=user_answer,
            explanation=explanation,
            source_context=source_context,
            difficulty_band=difficulty_band,
        )
        result = await run_in_threadpool(
            groq_client.generate_json, "llama-3.3-70b-versatile", messages
        )

        # Validate and sanitize the response
        score = max(0, min(100, int(result.get("score", 0))))
        verdict = result.get("verdict", "incorrect")
        if verdict not in ("correct", "partially_correct", "incorrect"):
            verdict = "incorrect" if score < 50 else ("partially_correct" if score < 75 else "correct")

        return {
            "score": float(score),
            "verdict": verdict,
            "reasoning": str(result.get("reasoning", "")).strip() or "No reasoning provided.",
            "suggestions": str(result.get("suggestions", "")).strip() or "Review the relevant material.",
            "llm_evaluated": True,
        }

    except (GroqUnavailableError, ValueError, Exception) as exc:
        logger.warning("LLM answer evaluation failed, using string-match fallback: %s", exc)
        return _fallback_evaluate(user_answer, correct_answer)


def _fallback_evaluate(user_answer: str, correct_answer: str) -> dict[str, Any]:
    """Deterministic string-matching fallback when the LLM is unavailable."""
    typed_text = user_answer.strip().lower()
    correct_text = correct_answer.strip().lower()

    if typed_text == correct_text:
        score = 100.0
        verdict = "correct"
        reasoning = "Exact match with the expected answer."
    elif typed_text in correct_text or correct_text in typed_text:
        score = 50.0
        verdict = "partially_correct"
        reasoning = "Partial match — your answer overlaps with the expected answer."
    else:
        score = 0.0
        verdict = "incorrect"
        reasoning = "Your answer does not match the expected answer."

    return {
        "score": score,
        "verdict": verdict,
        "reasoning": reasoning,
        "suggestions": "Review the source material for this topic.",
        "llm_evaluated": False,
    }
