/* This component renders the current Pomodoro countdown so the learner can pace effort while the backend adapts question complexity from the live load score. */

import { useEffect, useMemo, useState } from 'react';

export function PomodoroTimer({ durationMinutes }: { durationMinutes: number }) {
  const initialSeconds = Math.max(1, durationMinutes) * 60;
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);

  useEffect(() => {
    setRemainingSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const label = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (remainingSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [remainingSeconds]);

  return (
    <div className="glass-panel rounded-[2rem] p-6 float-in stagger-3">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Pomodoro</p>
      <div className="mt-3 text-4xl font-semibold text-slate-900">{label}</div>
      <p className="mt-2 text-sm text-slate-500">
        {remainingSeconds === 0 ? 'Cycle complete. Consider a short break.' : 'The timer reflects the session cadence selected at startup.'}
      </p>
    </div>
  );
}
