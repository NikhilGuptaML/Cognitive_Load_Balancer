/**
 * Latency Tracker — ported from backend/signals/latency_tracker.py
 * Tracks response timing and converts answer latency into a bounded load signal.
 */

export class LatencyTracker {
  private questionStartedAt: Map<string, number> = new Map();
  private history: Map<string, number[]> = new Map();
  private maxSamples: number;

  constructor(maxSamples = 20) {
    this.maxSamples = maxSamples;
  }

  markQuestionPresented(sessionId: string): void {
    this.questionStartedAt.set(sessionId, performance.now());
  }

  recordLatency(
    sessionId: string,
    latencyMs?: number | null
  ): { latencyMs: number; baselineMs: number; rawScore: number } {
    let measuredMs = latencyMs ?? null;

    if (measuredMs === null && this.questionStartedAt.has(sessionId)) {
      measuredMs = Math.round(performance.now() - this.questionStartedAt.get(sessionId)!);
    }
    measuredMs = Math.max(0, measuredMs ?? 0);

    let hist = this.history.get(sessionId);
    if (!hist) {
      hist = [];
      this.history.set(sessionId, hist);
    }
    hist.push(measuredMs);
    if (hist.length > this.maxSamples) {
      hist.shift();
    }

    const baseline = hist.length > 0 ? hist.reduce((a, b) => a + b, 0) / hist.length : measuredMs;

    const rawScore = Math.min(100, Math.max(0, (measuredMs / Math.max(baseline, 1)) * 35));

    return {
      latencyMs: measuredMs,
      baselineMs: Math.round(baseline * 100) / 100,
      rawScore: Math.round(rawScore * 100) / 100,
    };
  }
}

/** Singleton instance shared across the app. */
export const latencyTracker = new LatencyTracker();
