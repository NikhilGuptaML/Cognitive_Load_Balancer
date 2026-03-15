/**
 * Load Aggregator — ported from backend/core/load_aggregator.py
 * Maintains signal state, computes weighted composite load score, and notifies listeners.
 */

export type Band = 'FLOW' | 'OPTIMAL' | 'ELEVATED' | 'OVERLOADED' | 'CRISIS';

const WEIGHTS: Record<string, number> = {
  keystroke: 0.50,
  facial: 0.35,
  latency: 0.15,
};

const BANDS: Array<[number, number, Band]> = [
  [0, 25, 'FLOW'],
  [26, 50, 'OPTIMAL'],
  [51, 75, 'ELEVATED'],
  [76, 90, 'OVERLOADED'],
  [91, 100, 'CRISIS'],
];

export function bandForScore(score: number): Band {
  const rounded = Math.round(Math.max(0, Math.min(100, score)));
  for (const [lower, upper, band] of BANDS) {
    if (rounded >= lower && rounded <= upper) return band;
  }
  return 'CRISIS';
}

export interface LoadSnapshot {
  score: number;
  band: Band;
  signalsActive: string[];
  subscores: { keystroke: number | null; facial: number | null; latency: number | null };
  updatedAt: string;
}

function computeLoadScore(signals: Record<string, number | null>): {
  score: number;
  band: Band;
  signalsActive: string[];
} {
  const activeScores: Record<string, number> = {};
  for (const [name, value] of Object.entries(signals)) {
    if (value !== null && name in WEIGHTS) {
      activeScores[name] = Math.max(0, Math.min(100, value));
    }
  }

  if (Object.keys(activeScores).length === 0) {
    return { score: 0, band: bandForScore(0), signalsActive: [] };
  }

  const activeWeightTotal = Object.keys(activeScores).reduce(
    (sum, name) => sum + WEIGHTS[name],
    0
  );

  let composite = 0;
  for (const [name, score] of Object.entries(activeScores)) {
    const renormalizedWeight = WEIGHTS[name] / activeWeightTotal;
    composite += score * renormalizedWeight;
  }

  const score = Math.round(composite * 100) / 100;
  return {
    score,
    band: bandForScore(score),
    signalsActive: Object.keys(activeScores).sort(),
  };
}

export type LoadListener = (snapshot: LoadSnapshot) => void;

export class LoadAggregator {
  private keystroke: number | null = null;
  private facial: number | null = null;
  private latency: number | null = null;
  private _band: Band = 'FLOW';
  private _score = 0;
  private _updatedAt = new Date().toISOString();
  private listeners: Set<LoadListener> = new Set();

  subscribe(listener: LoadListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  updateSignal(signalName: string, value: number | null): LoadSnapshot {
    if (signalName === 'keystroke') this.keystroke = value;
    else if (signalName === 'face' || signalName === 'facial') this.facial = value;
    else if (signalName === 'latency') this.latency = value;

    const result = computeLoadScore({
      keystroke: this.keystroke,
      facial: this.facial,
      latency: this.latency,
    });

    this._score = result.score;
    this._band = result.band;
    this._updatedAt = new Date().toISOString();

    const snapshot = this.getState();
    this.notify();
    return snapshot;
  }

  getState(): LoadSnapshot {
    return {
      score: this._score,
      band: this._band,
      signalsActive: [
        ...(this.keystroke !== null ? ['keystroke'] : []),
        ...(this.facial !== null ? ['facial'] : []),
        ...(this.latency !== null ? ['latency'] : []),
      ].sort(),
      subscores: {
        keystroke: this.keystroke,
        facial: this.facial,
        latency: this.latency,
      },
      updatedAt: this._updatedAt,
    };
  }

  get score(): number {
    return this._score;
  }

  get band(): Band {
    return this._band;
  }
}

/** Singleton instance shared across the app. */
export const loadAggregator = new LoadAggregator();
