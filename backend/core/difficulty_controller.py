"""This module translates a composite load score into a pedagogical band and then builds the band-specific question instructions that keep the local tutor challenging without overwhelming the learner."""

from __future__ import annotations

from dataclasses import dataclass

from core.load_aggregator import band_for_score
# FIXED: Removed dead import of nonexistent render_question_prompt.


@dataclass(frozen=True)
class BandConfig:
    level_descriptor: str
    question_types: list[str]
    scaffolding: str
    bloom_level: str
    session_duration_seconds: int


BAND_CONFIGS: dict[str, BandConfig] = {
    "FLOW": BandConfig(
        level_descriptor="PhD-level synthesis",
        question_types=["counterfactual analysis", "multi-hop synthesis", "concept transfer"],
        scaffolding="none",
        bloom_level="Create",
        session_duration_seconds=40 * 60,
    ),
    "OPTIMAL": BandConfig(
        level_descriptor="advanced application",
        question_types=["scenario reasoning", "compare-and-contrast", "targeted explanation"],
        scaffolding="minimal",
        bloom_level="Analyze",
        session_duration_seconds=25 * 60,
    ),
    "ELEVATED": BandConfig(
        level_descriptor="guided competency building",
        question_types=["worked-example continuation", "short answer recall", "structured explanation"],
        scaffolding="generous",
        bloom_level="Apply",
        session_duration_seconds=15 * 60,
    ),
    "OVERLOADED": BandConfig(
        level_descriptor="recovery-oriented simplification",
        question_types=["step-by-step recall", "definition check", "single-concept check"],
        scaffolding="full",
        bloom_level="Understand",
        session_duration_seconds=10 * 60,
    ),
    "CRISIS": BandConfig(
        level_descriptor="stabilization and pause",
        question_types=["micro-check-in", "yes-no confidence check", "single fact recall"],
        scaffolding="maximum",
        bloom_level="Remember",
        session_duration_seconds=0,
    ),
}


def get_band(score: float) -> str:
    return band_for_score(score)


def get_band_config(band: str) -> BandConfig:
    return BAND_CONFIGS.get(band, BAND_CONFIGS["OPTIMAL"])


# FIXED: Removed dead build_question_prompt function that called nonexistent render_question_prompt.
