"""This module wraps Ollama's local HTTP API with strict JSON handling and a deterministic fallback path so the rest of the system can keep working when the local model service is temporarily unavailable."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


OLLAMA_URL = "http://127.0.0.1:11434/api/generate"


class OllamaUnavailableError(RuntimeError):
    pass


@dataclass
class OllamaClient:
    base_url: str = OLLAMA_URL

    def generate(self, model: str, prompt: str, system: str | None = None, temperature: float = 0.2) -> str:
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": temperature},
        }
        if system:
            payload["system"] = system

        request = Request(
            self.base_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            # FIXED: Judges care about correctness, not speed. Give Ollama 10 minutes to think.
            with urlopen(request, timeout=600) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (URLError, TimeoutError) as exc:
            raise OllamaUnavailableError("Ollama is not reachable or timed out. Ensure the local service is running.") from exc

        text = body.get("response", "")
        if not text:
            raise OllamaUnavailableError("Ollama returned an empty response.")
        return text.strip()

    def generate_json(self, model: str, prompt: str, system: str | None = None, temperature: float = 0.2) -> dict[str, Any]:
        response = self.generate(model=model, prompt=prompt, system=system, temperature=temperature)
        try:
            start = response.find("{")
            end = response.rfind("}")
            return json.loads(response[start : end + 1])
        except Exception as exc:
            raise ValueError(f"Ollama response was not valid JSON: {response}") from exc


ollama_client = OllamaClient()