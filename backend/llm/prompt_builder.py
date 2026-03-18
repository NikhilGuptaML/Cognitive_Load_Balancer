"""This module renders structured prompts for local question generation and answer evaluation so the API can ask the small local model for predictable JSON outputs."""

from __future__ import annotations

import json
from core.chunk_manager import ChunkSessionManager

def build_messages(session: ChunkSessionManager, difficulty: str) -> list:
    system_msg = {
        "role": "system",
        "content": (
            "You are a quiz generator. You will be given a passage of text. "
            "Generate MCQ questions strictly based on that passage. "
            "Respond ONLY with valid JSON matching this schema: "
            '{"question": "...", "options": {"A":"...","B":"...","C":"...","D":"..."}, '
            '"correct_answer": "A|B|C|D", "explanation": "..."}. '
            "No preamble, no markdown, no extra text. "
            f"Difficulty level: {difficulty}."
        )
    }
    chunk_inject = {
        "role": "user",
        "content": f"Here is the passage:\n\n{session.get_active_chunk()}\n\nGenerate a question."
    }
    
    # After first question, subsequent requests use history
    if not session.llm_history:
        return [system_msg, chunk_inject]
    else:
        # History format: [{"role": "assistant", "content": "..."}]
        messages = [system_msg, chunk_inject]
        for history_item in session.llm_history:
            messages.append(history_item)
        messages.append({"role": "user", "content": "Generate the next question from the same passage."})
        return messages

def get_chunk_tool() -> dict:
    return {
        "type": "function",
        "function": {
            "name": "retrieve_next_chunk",
            "description": (
                "Call this when you have generated all possible questions from the current passage "
                "and need new source material. Returns the next passage chunk."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    }
