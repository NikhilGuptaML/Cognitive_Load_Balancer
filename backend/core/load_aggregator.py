"""This module maintains each session's latest signal state, computes the renormalized composite load score, and pushes snapshots to connected WebSocket clients so the UI stays in sync with the local feedback loop."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from fastapi import WebSocket


ALPHA = 0.3
WEIGHTS = {"keystroke": 0.50, "facial": 0.35, "latency": 0.15}

BANDS = {
    (0, 25): "FLOW",
    (26, 50): "OPTIMAL",
    (51, 75): "ELEVATED",
    (76, 90): "OVERLOADED",
    (91, 100): "CRISIS",
}


def band_for_score(score: float) -> str:
    rounded = int(round(max(0.0, min(100.0, score))))
    for (lower, upper), band in BANDS.items():
        if lower <= rounded <= upper:
            return band
    return "CRISIS"


def compute_load_score(signals: dict[str, float | None]) -> dict[str, Any]:
    active_scores = {
        name: max(0.0, min(100.0, float(value)))
        for name, value in signals.items()
        if value is not None and name in WEIGHTS
    }
    if not active_scores:
        return {"score": 0.0, "band": band_for_score(0.0), "signals_active": []}

    active_weight_total = sum(WEIGHTS[name] for name in active_scores)
    composite = 0.0
    for name, score in active_scores.items():
        renormalized_weight = WEIGHTS[name] / active_weight_total
        composite += score * renormalized_weight

    score = round(composite, 2)
    return {
        "score": score,
        "band": band_for_score(score),
        "signals_active": sorted(active_scores.keys()),
    }


@dataclass
class SessionSignalState:
    keystroke: float | None = None
    facial: float | None = None
    latency: float | None = None
    band: str = "FLOW"
    score: float = 0.0
    smoothed_score: float = 50.0  # FIXED: Per-session EWMA instead of global
    updated_at: datetime = field(default_factory=datetime.utcnow)

    def as_payload(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "band": self.band,
            "signalsActive": [
                name
                for name, value in {
                    "keystroke": self.keystroke,
                    "facial": self.facial,
                    "latency": self.latency,
                }.items()
                if value is not None
            ],
            "updatedAt": self.updated_at.isoformat(),
            "subscores": {
                "keystroke": self.keystroke,
                "facial": self.facial,
                "latency": self.latency,
            },
        }


class LoadAggregator:
    def __init__(self) -> None:
        self._states: dict[str, SessionSignalState] = {}
        self._connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    # FIXED: smooth() now operates on per-session state instead of a single global float.
    def smooth(self, state: SessionSignalState, new_score: float) -> float:
        state.smoothed_score = ALPHA * new_score + (1 - ALPHA) * state.smoothed_score
        return round(state.smoothed_score, 1)

    async def register(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(session_id, set()).add(websocket)

    async def unregister(self, session_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(session_id)
            if not sockets:
                return
            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(session_id, None)

    async def update_signal(self, session_id: str, signal_name: str, value: float | None) -> dict[str, Any]:
        async with self._lock:
            state = self._states.setdefault(session_id, SessionSignalState())
            if signal_name == "keystroke":
                state.keystroke = value
            elif signal_name in {"face", "facial"}:
                state.facial = value
            elif signal_name == "latency":
                state.latency = value

            snapshot = compute_load_score(
                {
                    "keystroke": state.keystroke,
                    "facial": state.facial,
                    "latency": state.latency,
                }
            )
            # Apply EWMA smoothing before setting the state's composite score
            snapshot["score"] = self.smooth(state, snapshot["score"])
            
            state.score = snapshot["score"]
            state.band = snapshot["band"]
            state.updated_at = datetime.utcnow()
            payload = state.as_payload()

        await self.broadcast_snapshot(session_id, payload)
        return payload

    def get_state(self, session_id: str) -> dict[str, Any]:
        state = self._states.get(session_id)
        if state is None:
            return SessionSignalState().as_payload()
        return state.as_payload()

    async def broadcast_snapshot(self, session_id: str, payload: dict[str, Any] | None = None) -> None:
        payload = payload or self.get_state(session_id)
        sockets = list(self._connections.get(session_id, set()))
        disconnected: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                disconnected.append(socket)

        if disconnected:
            async with self._lock:
                active = self._connections.get(session_id, set())
                for socket in disconnected:
                    active.discard(socket)


load_aggregator = LoadAggregator()
