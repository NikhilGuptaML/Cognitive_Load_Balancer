/* NASA-TLX self-report modal. Appears every N answered questions, collects 7 dimension ratings (0–100), and POSTs them to the backend. The Submit button is locked until every slider has been touched at least once to prevent accidental skips. */

import { useCallback, useState } from 'react';

export interface NasaTlxModalProps {
  sessionId: string;
  questionNumber: number;
  onClose: () => void;
}

interface Dimension {
  key: keyof Ratings;
  label: string;
  description: string;
  color: string;
}

interface Ratings {
  mental_demand: number;
  physical_demand: number;
  temporal_demand: number;
  performance: number;
  effort: number;
  frustration: number;
  single_scale_overall: number;
}

const DIMENSIONS: Dimension[] = [
  {
    key: 'mental_demand',
    label: 'Mental Demand',
    description: 'How mentally demanding was the task?',
    color: '#6366f1',
  },
  {
    key: 'physical_demand',
    label: 'Physical Demand',
    description: 'How physically demanding was the task?',
    color: '#8b5cf6',
  },
  {
    key: 'temporal_demand',
    label: 'Temporal Demand',
    description: 'How hurried or rushed was the pace?',
    color: '#ec4899',
  },
  {
    key: 'performance',
    label: 'Performance',
    description: 'How successful were you in accomplishing what was asked?',
    color: '#10b981',
  },
  {
    key: 'effort',
    label: 'Effort',
    description: 'How hard did you have to work to attain your level of performance?',
    color: '#f59e0b',
  },
  {
    key: 'frustration',
    label: 'Frustration',
    description: 'How insecure, discouraged, irritated, stressed, or annoyed were you?',
    color: '#ef4444',
  },
  {
    key: 'single_scale_overall',
    label: 'Overall Load',
    description: 'Your overall subjective cognitive load right now (single-scale).',
    color: '#0ea5e9',
  },
];

const INITIAL_RATINGS: Ratings = {
  mental_demand: 50,
  physical_demand: 50,
  temporal_demand: 50,
  performance: 50,
  effort: 50,
  frustration: 50,
  single_scale_overall: 50,
};

export function NasaTlxModal({ sessionId, questionNumber, onClose }: NasaTlxModalProps) {
  const [ratings, setRatings] = useState<Ratings>(INITIAL_RATINGS);
  const [touched, setTouched] = useState<Set<keyof Ratings>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allTouched = touched.size === DIMENSIONS.length;

  const handleChange = useCallback((key: keyof Ratings, value: number) => {
    setRatings((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => new Set(prev).add(key));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!allTouched || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/session/${sessionId}/self-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_number: questionNumber, ...ratings }),
      });
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
      setIsSubmitting(false);
    }
  }, [allTouched, isSubmitting, sessionId, questionNumber, ratings, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          margin: '0 1.25rem',
          borderRadius: '2rem',
          background: 'rgba(255, 255, 255, 0.93)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.6) inset',
          padding: '2.5rem 2.25rem',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '0.25rem' }}>
          <p
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.28em',
              color: '#6366f1',
              marginBottom: '0.5rem',
            }}
          >
            NASA-TLX · After Question {questionNumber}
          </p>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#0f172a',
              lineHeight: 1.3,
              margin: 0,
            }}
          >
            How did that feel?
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.4rem' }}>
            Rate each dimension from <strong>0</strong> (very low) to <strong>100</strong> (very high).
            Move every slider before submitting.
          </p>
        </div>

        {/* Sliders */}
        <div style={{ marginTop: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {DIMENSIONS.map(({ key, label, description, color }) => {
            const value = ratings[key];
            const isTouched = touched.has(key);
            return (
              <div key={key}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: '0.35rem',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        color: '#1e293b',
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.76rem',
                        color: '#94a3b8',
                        marginTop: '0.05rem',
                      }}
                    >
                      {description}
                    </span>
                  </div>
                  <span
                    style={{
                      minWidth: 36,
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: isTouched ? color : '#cbd5e1',
                      transition: 'color 0.2s',
                    }}
                  >
                    {value}
                  </span>
                </div>
                {/* Track + slider wrapper */}
                <div style={{ position: 'relative', height: 28, display: 'flex', alignItems: 'center' }}>
                  {/* Filled track */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      height: 6,
                      width: `${value}%`,
                      borderRadius: 999,
                      background: isTouched
                        ? `linear-gradient(90deg, ${color}80, ${color})`
                        : '#e2e8f0',
                      transition: 'width 0.05s, background 0.2s',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Unfilled track */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      height: 6,
                      width: '100%',
                      borderRadius: 999,
                      background: '#f1f5f9',
                      zIndex: -1,
                    }}
                  />
                  <input
                    id={`tlx-slider-${key}`}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={value}
                    onChange={(e) => handleChange(key, Number(e.target.value))}
                    style={{
                      width: '100%',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      height: 28,
                      position: 'relative',
                      zIndex: 1,
                      outline: 'none',
                      accentColor: color,
                    }}
                  />
                </div>
                {/* Low / High labels */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.68rem',
                    color: '#94a3b8',
                    marginTop: '0.1rem',
                  }}
                >
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress indicator */}
        <div
          style={{
            marginTop: '1.5rem',
            padding: '0.6rem 1rem',
            borderRadius: '0.875rem',
            background: allTouched ? 'rgba(16, 185, 129, 0.08)' : 'rgba(99, 102, 241, 0.06)',
            border: `1px solid ${allTouched ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.15)'}`,
            fontSize: '0.78rem',
            color: allTouched ? '#059669' : '#6366f1',
            fontWeight: 600,
            textAlign: 'center',
            transition: 'background 0.3s, color 0.3s',
          }}
        >
          {allTouched
            ? '✓ All dimensions rated — ready to submit'
            : `${touched.size} / ${DIMENSIONS.length} dimensions rated — move each slider at least once`}
        </div>

        {error && (
          <p
            style={{
              marginTop: '0.75rem',
              padding: '0.6rem 1rem',
              borderRadius: '0.75rem',
              background: 'rgba(239,68,68,0.07)',
              color: '#dc2626',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          id="tlx-submit-btn"
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!allTouched || isSubmitting}
          style={{
            marginTop: '1.5rem',
            width: '100%',
            padding: '0.875rem 0',
            borderRadius: '1rem',
            border: 'none',
            background:
              allTouched && !isSubmitting
                ? 'linear-gradient(135deg, #6366f1, #818cf8)'
                : '#e2e8f0',
            color: allTouched && !isSubmitting ? '#fff' : '#94a3b8',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: allTouched && !isSubmitting ? 'pointer' : 'not-allowed',
            transition: 'background 0.25s, color 0.25s, transform 0.1s',
            transform: allTouched && !isSubmitting ? 'scale(1)' : 'scale(1)',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={(e) => {
            if (allTouched && !isSubmitting) {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.015)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          {isSubmitting ? 'Submitting…' : 'Submit & Continue'}
        </button>
      </div>
    </div>
  );
}
