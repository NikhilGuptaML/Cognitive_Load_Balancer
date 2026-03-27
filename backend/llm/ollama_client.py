"""This module wraps Ollama's local HTTP API using the /api/chat endpoint
with strict JSON handling and a deterministic fallback path so the rest of
the system can keep working when the local model service is temporarily
unavailable."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


OLLAMA_BASE = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


class OllamaUnavailableError(RuntimeError):
    pass


def _extract_json(raw: str) -> dict:
    """Strip markdown fences if present, then parse JSON."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise json.JSONDecodeError("No JSON object found", raw, 0)
    return json.loads(raw[start : end + 1])


@dataclass
class OllamaClient:
    base_url: str = field(default_factory=lambda: OLLAMA_BASE)
    model: str = field(default_factory=lambda: OLLAMA_MODEL)

    # ── Chat-style generation (matches prompt_builder output) ──────────

    def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.2,
        json_mode: bool = False,
    ) -> str:
        """Send a chat-style message list to Ollama and return the response text."""
        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if json_mode:
            payload["format"] = "json"

        request = Request(
            f"{self.base_url}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=600) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (URLError, TimeoutError) as exc:
            raise OllamaUnavailableError(
                "Ollama is not reachable or timed out. "
                "Ensure the local service is running (ollama serve)."
            ) from exc

        text = body.get("message", {}).get("content", "")
        if not text:
            raise OllamaUnavailableError("Ollama returned an empty response.")
        return text.strip()

    def generate_json(
        self,
        messages: list[dict],
        model: str | None = None,
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        """Generate a JSON response from Ollama with up to 3 retries."""
        last_error: Exception | None = None
        temp = temperature
        for _attempt in range(3):
            try:
                raw = self.chat(
                    messages=messages,
                    model=model,
                    temperature=temp,
                    json_mode=True,
                )
                return _extract_json(raw)
            except json.JSONDecodeError as exc:
                last_error = exc
                temp = min(temp + 0.1, 1.0)
                continue
            except OllamaUnavailableError:
                raise
        raise ValueError(
            f"Ollama returned invalid JSON after 3 attempts: {last_error}"
        ) from last_error

    # ── Legacy single-prompt generation (kept for backwards compat) ────

    def generate(
        self,
        model: str,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.2,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": temperature},
        }
        if system:
            payload["system"] = system

        request = Request(
            f"{self.base_url}/api/generate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=600) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (URLError, TimeoutError) as exc:
            raise OllamaUnavailableError(
                "Ollama is not reachable or timed out."
            ) from exc

        text = body.get("response", "")
        if not text:
            raise OllamaUnavailableError("Ollama returned an empty response.")
        return text.strip()


ollama_client = OllamaClient()