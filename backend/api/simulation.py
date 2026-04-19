"""This module provides deterministic Monte Carlo simulations of CLB's mathematical pipeline so researchers can visualize band transitions, score distributions, and signal-fusion ablation without requiring real user data."""

from __future__ import annotations

import math
import random
from typing import Any

from fastapi import APIRouter

router = APIRouter(tags=["simulation"])

# ---------- CLB constants (mirrored from core.load_aggregator) ----------
ALPHA = 0.3
WEIGHTS = {"keystroke": 0.50, "facial": 0.35, "latency": 0.15}
BANDS_MAP = {
    (0, 25): "FLOW",
    (26, 50): "OPTIMAL",
    (51, 75): "ELEVATED",
    (76, 90): "OVERLOADED",
    (91, 100): "CRISIS",
}
BAND_ORDER = ["FLOW", "OPTIMAL", "ELEVATED", "OVERLOADED", "CRISIS"]
STEPS = 360  # 30 minutes at 5-second intervals


def _band_for_score(score: float) -> str:
    rounded = int(round(max(0.0, min(100.0, score))))
    for (lo, hi), band in BANDS_MAP.items():
        if lo <= rounded <= hi:
            return band
    return "CRISIS"


def _composite(signals: dict[str, float | None]) -> float:
    active = {k: max(0.0, min(100.0, v)) for k, v in signals.items() if v is not None and k in WEIGHTS}
    if not active:
        return 0.0
    total_w = sum(WEIGHTS[k] for k in active)
    return sum(v * WEIGHTS[k] / total_w for k, v in active.items())


# ---------- User profile definitions ----------

_PROFILES: list[dict[str, Any]] = [
    {"id": "U1", "label": "Flow Learner",  "seed": 1, "gen": "low"},
    {"id": "U2", "label": "High-Load",     "seed": 2, "gen": "high"},
    {"id": "U3", "label": "Improving",     "seed": 3, "gen": "improving"},
    {"id": "U4", "label": "Average",       "seed": 4, "gen": "mid"},
    {"id": "U5", "label": "Erratic",       "seed": 5, "gen": "erratic"},
]


def _generate_raw(rng: random.Random, gen_type: str, step: int) -> dict[str, float]:
    """Generate raw keystroke, facial, and latency scores for one time step."""
    if gen_type == "low":
        base = rng.uniform(10, 35)
    elif gen_type == "high":
        base = rng.uniform(65, 95)
    elif gen_type == "improving":
        progress = step / STEPS
        lo = 70 - 40 * progress  # 70 → 30
        hi = 90 - 40 * progress  # 90 → 50
        base = rng.uniform(max(lo, 10), max(hi, 30))
    elif gen_type == "mid":
        base = rng.uniform(35, 65)
    else:  # erratic
        base = rng.uniform(0, 100)

    # Add per-channel jitter so the three signals are correlated but not identical
    return {
        "keystroke": max(0, min(100, base + rng.gauss(0, 5))),
        "facial": max(0, min(100, base + rng.gauss(0, 8))),
        "latency": max(0, min(100, base + rng.gauss(0, 6))),
    }


def _simulate_user(profile: dict[str, Any]) -> dict[str, Any]:
    rng = random.Random(profile["seed"])
    smoothed = 50.0
    score_series: list[float] = []
    band_series: list[str] = []
    transitions = 0
    prev_band: str | None = None

    for step in range(STEPS):
        raw = _generate_raw(rng, profile["gen"], step)
        raw_score = _composite(raw)
        smoothed = round(ALPHA * raw_score + (1 - ALPHA) * smoothed, 2)
        band = _band_for_score(smoothed)
        score_series.append(smoothed)
        band_series.append(band)
        if prev_band is not None and band != prev_band:
            transitions += 1
        prev_band = band

    band_dist = {b: 0 for b in BAND_ORDER}
    for b in band_series:
        band_dist[b] += 1
    # Convert to percentage (rounded)
    band_distribution = {b: round(100 * count / STEPS) for b, count in band_dist.items()}

    return {
        "id": profile["id"],
        "label": profile["label"],
        "band_distribution": band_distribution,
        "score_series": score_series,
        "band_series": band_series,
        "transitions": transitions,
    }


def _ablation_for_profile(profile: dict[str, Any]) -> dict[str, Any]:
    """Run one user profile through 3 signal configurations and return score series + variance."""
    rng_seed = profile["seed"]
    configs = {
        "keystroke_only": ["keystroke"],
        "keystroke_face": ["keystroke", "facial"],
        "all_channels": ["keystroke", "facial", "latency"],
    }
    result: dict[str, Any] = {}

    for config_name, active_channels in configs.items():
        rng = random.Random(rng_seed)
        smoothed = 50.0
        series: list[float] = []

        for step in range(STEPS):
            raw = _generate_raw(rng, profile["gen"], step)
            filtered = {k: v for k, v in raw.items() if k in active_channels}
            raw_score = _composite(filtered)
            smoothed = round(ALPHA * raw_score + (1 - ALPHA) * smoothed, 2)
            series.append(smoothed)

        mean = sum(series) / len(series)
        variance = round(math.sqrt(sum((s - mean) ** 2 for s in series) / len(series)), 2)
        result[config_name] = {"scores": series, "variance": variance}

    return result


# ---------- Endpoints ----------

@router.get("/pilot")
def run_pilot_simulation():
    users = [_simulate_user(p) for p in _PROFILES]
    # Ablation uses U2 (High-Load) by default
    ablation_data = _ablation_for_profile(_PROFILES[1])
    return {
        "users": users,
        "ablation": {
            key: ablation_data[key]["scores"] for key in ablation_data
        },
    }


@router.get("/ablation")
def run_ablation_analysis():
    ablation_data = _ablation_for_profile(_PROFILES[1])
    return {
        "profile": _PROFILES[1]["label"],
        "configs": {
            key: {
                "scores": ablation_data[key]["scores"],
                "variance": ablation_data[key]["variance"],
            }
            for key in ablation_data
        },
    }
