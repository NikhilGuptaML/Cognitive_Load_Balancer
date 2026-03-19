"""This module wraps the Groq API for generating completions and JSON outputs."""

from __future__ import annotations

import json
import re
import os
from dataclasses import dataclass
from typing import Any
from dotenv import load_dotenv
from groq import Groq


class GroqUnavailableError(RuntimeError):
    pass


# FIXED: Robust JSON extraction that strips markdown fences if present.
def extract_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


@dataclass
class GroqClient:
    def __post_init__(self):
        load_dotenv()
        # The Groq client automatically looks for the GROQ_API_KEY environment variable.
        # FIXED: Pass an explicit http_client to bypass Groq's internal wrapper which passes
        # the deprecated 'proxies' argument to httpx >= 0.28.0, causing a TypeError on startup.
        import httpx
        self.client = Groq(http_client=httpx.Client())

    def generate(self, model: str, prompt: str, system: str | None = None, temperature: float = 0.2) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        try:
            completion = self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                stream=False
            )
            return completion.choices[0].message.content or ""
        except Exception as exc:
            raise GroqUnavailableError(f"Groq API call failed: {exc}") from exc

    def generate_json(self, model: str, prompt: str | list, system: str | None = None, temperature: float = 0.2, tools: list | None = None) -> dict[str, Any]:
        if isinstance(prompt, str):
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})
        else:
            messages = prompt

        # FIXED: Retry up to 3 times if the model returns malformed JSON.
        last_error = None
        for attempt in range(3):
            try:
                kwargs = {
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "stream": False
                }
                # FIXED: Groq API rejects response_format + tools together.
                if tools:
                    kwargs["tools"] = tools
                else:
                    kwargs["response_format"] = {"type": "json_object"}

                completion = self.client.chat.completions.create(**kwargs)
                
                # Handle tool calls if any
                if completion.choices[0].message.tool_calls:
                    return {"tool_calls": completion.choices[0].message.tool_calls}
                    
                content = completion.choices[0].message.content or "{}"
                # FIXED: Use extract_json to strip markdown fences before parsing.
                return extract_json(content)
            except json.JSONDecodeError as exc:
                last_error = exc
                # Retry with slightly higher temperature to get different output
                temperature = min(temperature + 0.1, 1.0)
                continue
            except Exception as exc:
                raise GroqUnavailableError(f"Groq JSON generation failed: {exc}") from exc

        raise ValueError(f"Groq returned invalid JSON after 3 attempts: {last_error}") from last_error


groq_client = GroqClient()
