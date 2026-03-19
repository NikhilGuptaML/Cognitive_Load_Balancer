/* A countdown timer that resets to full duration whenever resetSignal increments. Used for correct/incorrect revision timers. */

import { useEffect, useRef, useState } from 'react';

type RevisionTimerProps = {
  label: string;
  durationSeconds: number;
  resetSignal: number;
  accentClass: string;
};

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function RevisionTimer({ label, durationSeconds, resetSignal, accentClass }: RevisionTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const intervalRef = useRef<number>();

  // Reset to full duration whenever resetSignal changes
  useEffect(() => {
    setRemaining(durationSeconds);
  }, [resetSignal, durationSeconds]);

  // Countdown every second
  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(intervalRef.current);
  }, []);

  const isDue = remaining <= 0;

  return (
    <div className="glass-panel rounded-[2rem] p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-semibold tabular-nums ${isDue ? accentClass : 'text-slate-900'}`}>
        {isDue ? 'Due now' : formatTime(remaining)}
      </p>
    </div>
  );
}
