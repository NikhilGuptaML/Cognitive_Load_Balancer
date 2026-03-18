/* Full-screen calibration modal that captures the user's relaxed typing baseline before the session starts. Computes IKI variance, WPM, and backspace rate from a fixed prompt sentence. */

import { useCallback, useEffect, useRef, useState } from 'react';

export type TypingBaseline = {
  ikiVariance: number;
  wpm: number;
  backspaceRate: number;
};

const CALIBRATION_PROMPT =
  'The quick brown fox jumps over the lazy dog near the riverbank';

function variance(values: number[]) {
  if (values.length <= 1) return 0;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
}

export function CalibrationModal({ onComplete }: { onComplete: (baseline: TypingBaseline) => void }) {
  const [typed, setTyped] = useState('');
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const timestamps = useRef<number[]>([]);
  const backspaceCount = useRef(0);
  const totalKeyCount = useRef(0);
  const startTime = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const computeBaseline = useCallback((): TypingBaseline => {
    const ts = timestamps.current;
    const intervals = ts.slice(1).map((t, i) => t - ts[i]);
    const ikiVariance = variance(intervals);
    const elapsedMin = (Date.now() - startTime.current) / 60000;
    const charCount = typed.length;
    const wpm = elapsedMin > 0 ? charCount / 5 / elapsedMin : 0;
    const backspaceRate =
      totalKeyCount.current > 0 ? backspaceCount.current / totalKeyCount.current : 0;
    return {
      ikiVariance: Number(ikiVariance.toFixed(2)),
      wpm: Number(wpm.toFixed(2)),
      backspaceRate: Number(backspaceRate.toFixed(4)),
    };
  }, [typed]);

  const handleDone = useCallback(() => {
    if (typed.length < 10) return; // need a minimum amount of data
    setFinished(true);
    const baseline = computeBaseline();
    window.localStorage.setItem('clb.typingBaseline', JSON.stringify(baseline));
    onComplete(baseline);
  }, [typed, computeBaseline, onComplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (finished) return;

      const now = Date.now();
      if (!started) {
        setStarted(true);
        startTime.current = now;
      }

      totalKeyCount.current += 1;
      timestamps.current.push(now);

      if (e.key === 'Backspace') {
        backspaceCount.current += 1;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        handleDone();
      }
    },
    [started, finished, handleDone],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!finished) setTyped(e.target.value);
    },
    [finished],
  );

  const progress = Math.min((typed.length / CALIBRATION_PROMPT.length) * 100, 100);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          margin: '0 1.5rem',
          borderRadius: '2rem',
          background: 'rgba(255,255,255,0.88)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          padding: '3rem 2.5rem',
        }}
      >
        {/* Header */}
        <p
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.24em',
            color: '#64748b',
            marginBottom: '0.5rem',
          }}
        >
          Calibration
        </p>
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: '1.5rem',
            lineHeight: 1.3,
          }}
        >
          Type at your normal, comfortable pace
        </h2>

        {/* Prompt */}
        <div
          style={{
            borderRadius: '1.25rem',
            background: 'rgba(241,245,249,0.7)',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.25rem',
            fontFamily: 'monospace',
            fontSize: '1.05rem',
            lineHeight: 1.7,
            color: '#334155',
            letterSpacing: '0.01em',
          }}
        >
          {CALIBRATION_PROMPT}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={typed}
          onKeyDown={handleKeyDown}
          onChange={handleChange}
          disabled={finished}
          placeholder="Start typing here…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: '100%',
            padding: '0.9rem 1.25rem',
            borderRadius: '1rem',
            border: '2px solid #e2e8f0',
            fontSize: '1rem',
            fontFamily: 'inherit',
            color: '#0f172a',
            outline: 'none',
            transition: 'border-color 0.2s',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
        />

        {/* Progress bar */}
        <div
          style={{
            marginTop: '1rem',
            height: 6,
            borderRadius: 999,
            background: '#e2e8f0',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              borderRadius: 999,
              background: 'linear-gradient(90deg, #6366f1, #818cf8)',
              transition: 'width 0.15s ease',
            }}
          />
        </div>

        {/* Done button */}
        <button
          type="button"
          onClick={handleDone}
          disabled={typed.length < 10 || finished}
          style={{
            marginTop: '1.5rem',
            width: '100%',
            padding: '0.85rem 0',
            borderRadius: '1rem',
            border: 'none',
            background:
              typed.length >= 10 && !finished
                ? 'linear-gradient(135deg, #6366f1, #818cf8)'
                : '#cbd5e1',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: typed.length >= 10 && !finished ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s, transform 0.1s',
          }}
        >
          Done
        </button>

        <p
          style={{
            marginTop: '1rem',
            fontSize: '0.8rem',
            color: '#94a3b8',
            textAlign: 'center',
          }}
        >
          Press <strong>Enter</strong> or click Done when finished
        </p>
      </div>
    </div>
  );
}
