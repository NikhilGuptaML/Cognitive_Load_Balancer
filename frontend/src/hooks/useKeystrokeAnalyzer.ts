/* This hook watches typing behavior in a rolling five-second window, converts the signal into a normalized cognitive-load subscore, and updates the local loadAggregator. */

import { useEffect, useMemo, useRef, useState } from 'react';

import { loadAggregator } from '../engine/loadAggregator';

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
  const eventsRef = useRef<KeyEventPoint[]>([]);
  const [metrics, setMetrics] = useState<KeystrokeMetrics>({
    ikiVariance: 0,
    wpm: 0,
    backspaceRate: 0,
    rawScore: 0,
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

      const ikiContribution = clamp((ikiVariance / 30000) * 40, 0, 40);
      const wpmContribution = clamp(((45 - Math.min(wpm, 45)) / 45) * 40, 0, 40);
      const backspaceContribution = clamp(backspaceRate * 20, 0, 20);
      const rawScore = clamp(ikiContribution + wpmContribution + backspaceContribution, 0, 100);

      setMetrics({
        ikiVariance: Number(ikiVariance.toFixed(2)),
        wpm: Number(wpm.toFixed(2)),
        backspaceRate: Number(backspaceRate.toFixed(3)),
        rawScore: Number(rawScore.toFixed(2)),
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  // Use a ref so the update interval reads current metrics without restarting on every keystroke.
  const metricsRef = useRef(metrics);
  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  // Update the local load aggregator periodically instead of POSTing to backend.
  useEffect(() => {
    if (!enabled || !sessionId) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const current = metricsRef.current;
      loadAggregator.updateSignal('keystroke', current.rawScore);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [enabled, sessionId]);

  return useMemo(() => ({ metrics }), [metrics]);
}
