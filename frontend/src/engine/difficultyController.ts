/**
 * Difficulty Controller — ported from backend/core/difficulty_controller.py
 * Translates a load score into a pedagogical band and builds band-specific question instructions.
 */

import { bandForScore, type Band } from './loadAggregator';
import { renderQuestionPrompt } from './promptBuilder';

export interface BandConfig {
  levelDescriptor: string;
  questionTypes: string[];
  scaffolding: string;
  bloomLevel: string;
  sessionDurationSeconds: number;
}

export const BAND_CONFIGS: Record<Band, BandConfig> = {
  FLOW: {
    levelDescriptor: 'PhD-level synthesis',
    questionTypes: ['counterfactual analysis', 'multi-hop synthesis', 'concept transfer'],
    scaffolding: 'none',
    bloomLevel: 'Create',
    sessionDurationSeconds: 40 * 60,
  },
  OPTIMAL: {
    levelDescriptor: 'advanced application',
    questionTypes: ['scenario reasoning', 'compare-and-contrast', 'targeted explanation'],
    scaffolding: 'minimal',
    bloomLevel: 'Analyze',
    sessionDurationSeconds: 25 * 60,
  },
  ELEVATED: {
    levelDescriptor: 'guided competency building',
    questionTypes: ['worked-example continuation', 'short answer recall', 'structured explanation'],
    scaffolding: 'generous',
    bloomLevel: 'Apply',
    sessionDurationSeconds: 15 * 60,
  },
  OVERLOADED: {
    levelDescriptor: 'recovery-oriented simplification',
    questionTypes: ['step-by-step recall', 'definition check', 'single-concept check'],
    scaffolding: 'full',
    bloomLevel: 'Understand',
    sessionDurationSeconds: 10 * 60,
  },
  CRISIS: {
    levelDescriptor: 'stabilization and pause',
    questionTypes: ['micro-check-in', 'yes-no confidence check', 'single fact recall'],
    scaffolding: 'maximum',
    bloomLevel: 'Remember',
    sessionDurationSeconds: 0,
  },
};

export function getBand(score: number): Band {
  return bandForScore(score);
}

export function getBandConfig(band: Band): BandConfig {
  return BAND_CONFIGS[band] ?? BAND_CONFIGS.OPTIMAL;
}

export function buildQuestionPrompt(
  band: Band,
  contextChunks: string[],
  history: Array<{ question: string; band: string; hint: string | null }>
): string {
  const config = getBandConfig(band);
  return renderQuestionPrompt(band, config, contextChunks, history);
}
