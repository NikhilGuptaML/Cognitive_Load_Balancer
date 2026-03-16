"""This module renders structured prompts for local question generation and answer evaluation so the API can ask the small local model for predictable JSON outputs."""

from __future__ import annotations

import json


def render_question_prompt(band: str, config: dict, context_chunks: list[str], history: list[dict]) -> str:
    context_block = "\n\n".join(f"[{index + 1}] {chunk}" for index, chunk in enumerate(context_chunks)) or "No context available."
    history_block = "\n".join(f"- {h['question']}" for h in history[-3:]) if history else "None yet."

    return f"""
You are an expert tutor generating exactly ONE question about the text.
The student is currently in the {band} difficulty band.
Their level is: {config.get('level_descriptor', 'average')}.

CONTEXT:
{context_block}

PREVIOUS QUESTIONS ASKED (DO NOT REPEAT THESE):
{history_block}

RULES:
1. Generate exactly one question based ONLY on the CONTEXT above.
2. The question must be a '{config.get('question_types', ['concept check'])[0]}' type question.
3. Keep the question under 3 sentences.
4. Provide a very short, 1-sentence hint.
5. You must respond in STRICT JSON matching this format:
{{
  "question_text": "Write your question here",
  "hint": "Write the short hint here"
}}
""".strip()


def render_answer_evaluation_prompt(question_text: str, answer_text: str, context_chunks: list[str]) -> str:
    context_block = "\n\n".join(context_chunks) or "No context available."
    return f"""
You are an expert tutor grading a student's answer.

QUESTION:
{question_text}

STUDENT ANSWER:
{answer_text}

REFERENCE CONTEXT:
{context_block}

RULES:
1. Evaluate if the student's answer is correct based ONLY on the Reference Context.
2. Give a score from 0 to 100.
3. Write a 1-sentence explanation of why they got that score.
4. You must respond in STRICT JSON matching this format:
{{
  "correct": true or false,
  "score": 85,
  "explanation": "Your 1-sentence explanation here."
}}
""".strip()
