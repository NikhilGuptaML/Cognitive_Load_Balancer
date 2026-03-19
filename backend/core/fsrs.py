"""
Minimal FSRS-4.5 implementation for CLB.
After each answer, computes when the question should be reviewed again
based on how well the student answered. Returns next_review_at (Unix timestamp).

No external dependencies — pure math.
"""

from __future__ import annotations

import math
import time

# FSRS constants (tuned defaults from the open-source FSRS paper)
DECAY = -0.5
FACTOR = 0.9 ** (1 / DECAY) - 1


def retrievability(stability: float, days_elapsed: float) -> float:
    """Probability of recall given stability and time since last review."""
    return (1 + FACTOR * days_elapsed / stability) ** DECAY


def next_interval(stability: float, target_retention: float = 0.9) -> int:
    """How many days until retention drops to target_retention."""
    interval = stability / FACTOR * (target_retention ** (1 / DECAY) - 1)
    return max(1, round(interval))


def update_stability(stability: float, difficulty: float, correct: int) -> float:
    """
    Update stability after a review.
    correct: 0 = wrong, 1 = partial, 2 = correct
    """
    if correct == 0:
        # Forgot — stability drops significantly
        return max(0.1, stability * 0.2)
    elif correct == 1:
        # Partial — small gain
        return stability * (1 + 0.1 * (11 - difficulty))
    else:
        # Correct — standard FSRS stability increase
        return stability * (1 + 0.4 * (11 - difficulty) * (stability ** -0.5))


def update_difficulty(difficulty: float, correct: int) -> float:
    """Difficulty drifts toward 5 over time; adjusts based on answer."""
    delta = {0: +0.8, 1: +0.2, 2: -0.15}.get(correct, 0)
    new_diff = difficulty + delta
    # Mean reversion — difficulty drifts back toward 5 slowly
    new_diff = new_diff * 0.9 + 5 * 0.1
    return max(1.0, min(10.0, new_diff))


def score_to_correct(score: float) -> int:
    """Map CLB's 0-100 score to FSRS 3-level scale.

    score < 50   → 0 (incorrect)
    50 <= score < 75 → 1 (partial)
    score >= 75  → 2 (correct)
    """
    if score < 50:
        return 0
    elif score < 75:
        return 1
    else:
        return 2


def schedule(
    stability: float, difficulty: float, correct: int, review_count: int
) -> tuple[float, float, int, int]:
    """
    Main function. Call this after every answer.
    Returns (new_stability, new_difficulty, next_review_at, interval_days)
    """
    new_stability = update_stability(stability, difficulty, correct)
    new_difficulty = update_difficulty(difficulty, correct)
    interval_days = next_interval(new_stability)
    next_review_at = int(time.time()) + interval_days * 86400  # convert to Unix timestamp
    return new_stability, new_difficulty, next_review_at, interval_days
