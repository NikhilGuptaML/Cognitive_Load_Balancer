"""This module tracks response timing so answer latency can be turned into a bounded load signal without introducing any extra external dependencies."""

from __future__ import annotations

from collections import deque
from statistics import mean
from time import monotonic


class LatencyTracker:
    def __init__(self, max_samples: int = 20) -> None:
        self._question_started_at: dict[str, float] = {}
        self._history: dict[str, deque[float]] = {}
        self._max_samples = max_samples

    def mark_question_presented(self, session_id: str) -> None:
        self._question_started_at[session_id] = monotonic()

    def record_latency(self, session_id: str, latency_ms: int | None = None) -> dict[str, float]:
        measured_ms = latency_ms
        if measured_ms is None and session_id in self._question_started_at:
            measured_ms = int((monotonic() - self._question_started_at[session_id]) * 1000)
        measured_ms = max(0, int(measured_ms or 0))

        history = self._history.setdefault(session_id, deque(maxlen=self._max_samples))
        history.append(float(measured_ms))
        baseline = mean(history) if history else float(measured_ms)

        # Longer-than-baseline responses indicate elevated effort, capped to 100.
        raw_score = min(100.0, max(0.0, (measured_ms / max(baseline, 1.0)) * 35.0))
        return {"latency_ms": float(measured_ms), "baseline_ms": round(baseline, 2), "raw_score": round(raw_score, 2)}


latency_tracker = LatencyTracker()
