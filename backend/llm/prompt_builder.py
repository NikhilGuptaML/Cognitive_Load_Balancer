"""This module renders structured prompts for local question generation and answer evaluation so the API can ask the small local model for predictable JSON outputs."""

from __future__ import annotations

import json


def render_question_prompt(band: str, config: dict, context_chunks: list[str], history: list[dict]) -> str:
    context_block = "\n\n".join(f"Chunk {index + 1}: {chunk}" for index, chunk in enumerate(context_chunks)) or "No context available."
    history_block = json.dumps(history[-3:], indent=2) if history else "[]"
    return f"""
You are the Cognitive Load Balancer's local tutor.
Return valid JSON only with keys: question_text, hint.

Current load band: {band}
Band configuration: {json.dumps(config)}
Recent question history: {history_block}

Context:
{context_block}

Requirements:
- Generate exactly one question.
- Match the difficulty to the band configuration.
- Prefer one of these question types: {', '.join(config.get('question_types', []))}.
- Use the Bloom level {config.get('bloom_level')}.
- Scaffolding level must be {config.get('scaffolding')}.
- Keep the hint short and actionable.
""".strip()


def render_answer_evaluation_prompt(question_text: str, answer_text: str, context_chunks: list[str]) -> str:
    context_block = "\n\n".join(context_chunks) or "No context available."
    return f"""
You are grading a student's answer offline.
Return valid JSON only with keys: correct, score, explanation.

Question:
{question_text}

Student answer:
{answer_text}

Reference context:
{context_block}

Scoring rules:
- score must be from 0 to 100.
- correct should be true when the answer is substantially correct.
- explanation should be 1-3 sentences.
""".strip()
