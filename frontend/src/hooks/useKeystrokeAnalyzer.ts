/* This hook watches typing behavior in a rolling five-second window, converts the signal into a normalized cognitive-load subscore, and posts it back to the backend at a fixed cadence during the active session. */

import { useEffect, useMemo, useRef, useState } from 'react';

type KeyEventPoint = {
  timestamp: number;
  key: string;
};

export type KeystrokeMetrics = {
  ikiVariance: number;
  wpm: number;
  backspaceRate: number;
  rawScore: number;
};

const WINDOW_MS = 5000;

type StoredBaseline = { ikiVariance: number; wpm: number; backspaceRate: number } | null;

function readBaseline(): StoredBaseline {
  try {
    const raw = window.localStorage.getItem('clb.typingBaseline');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ikiVariance: number; wpm: number; backspaceRate: number };
    if (typeof parsed.ikiVariance === 'number' && typeof parsed.wpm === 'number' && typeof parsed.backspaceRate === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function variance(values: number[]) {
  if (values.length <= 1) {
    return 0;
  }
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
}

export function useKeystrokeAnalyzer(sessionId: string | null, enabled = true) {
  const baseline = useRef<StoredBaseline>(readBaseline());
  const eventsRef = useRef<KeyEventPoint[]>([]);
  const [metrics, setMetrics] = useState<KeystrokeMetrics>({
    ikiVariance: 0,
    wpm: 0,
    backspaceRate: 0,
    rawScore: 0
  });

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      eventsRef.current = [...eventsRef.current, { timestamp: now, key: event.key }].filter(
        (entry) => now - entry.timestamp <= WINDOW_MS
      );

      const points = eventsRef.current;
      const intervals = points.slice(1).map((entry, index) => entry.timestamp - points[index].timestamp);
      const ikiVariance = variance(intervals);
      const nonControlKeys = points.filter((entry) => entry.key.length === 1 || entry.key === 'Backspace');
      const charactersTyped = nonControlKeys.filter((entry) => entry.key !== 'Backspace').length;
      const minutesObserved = WINDOW_MS / 60000;
      const wpm = charactersTyped / 5 / minutesObserved;
      const backspaces = nonControlKeys.filter((entry) => entry.key === 'Backspace').length;
      const backspaceRate = nonControlKeys.length ? backspaces / nonControlKeys.length : 0;

      const bl = baseline.current;
      const ikiCeiling = bl ? bl.ikiVariance * 4 : 30000;
      const ikiContribution = clamp((ikiVariance / Math.max(ikiCeiling, 1)) * 40, 0, 40);
      const wpmFloor = bl ? bl.wpm : 45;
      const wpmContribution = clamp(((wpmFloor - Math.min(wpm, wpmFloor)) / Math.max(wpmFloor, 1)) * 40, 0, 40);
      const bsNorm = bl ? Math.max(bl.backspaceRate, 0.01) : 0.05;
      const backspaceContribution = clamp((backspaceRate / bsNorm) * 20, 0, 20);
      const rawScore = clamp(ikiContribution + wpmContribution + backspaceContribution, 0, 100);

      setMetrics({
        ikiVariance: Number(ikiVariance.toFixed(2)),
        wpm: Number(wpm.toFixed(2)),
        backspaceRate: Number(backspaceRate.toFixed(3)),
        rawScore: Number(rawScore.toFixed(2))
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  // FIXED: Use a ref so the POST interval reads current metrics without restarting on every keystroke.
  const metricsRef = useRef(metrics);
  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    if (!enabled || !sessionId) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      const current = metricsRef.current;
      try {
        await fetch('/signal/keystroke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            ikiVariance: current.ikiVariance,
            wpm: current.wpm,
            backspaceRate: current.backspaceRate,
            rawScore: current.rawScore
          })
        });
      } catch {
        // Silent failure keeps the typing UI responsive when the backend is restarting.
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [enabled, sessionId]);

  return useMemo(() => ({ metrics }), [metrics]);
}
