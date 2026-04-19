/* This component runs the question-answer loop: fetch a question, collect the
   learner's response, submit it for LLM evaluation, show rich graded feedback
   with reasoning and study suggestions, and then automatically request the
   next question. */

import { useEffect, useMemo, useRef, useState } from 'react';

type QuestionResponse = {
  question_id: string;
  question_text: string;
  band: string;
  hint?: string | null;
  options?: Record<string, string> | null;
};

type FeedbackState = {
  correct: boolean;
  score: number;
  verdict: string;
  reasoning: string;
  suggestions: string;
  explanation: string;
  llm_evaluated?: boolean;
} | null;

const BAND_BADGES: Record<string, string> = {
  FLOW: 'bg-emerald-100 text-emerald-900',
  OPTIMAL: 'bg-blue-100 text-blue-900',
  ELEVATED: 'bg-amber-100 text-amber-900',
  OVERLOADED: 'bg-orange-100 text-orange-900',
  CRISIS: 'bg-rose-100 text-rose-900'
};

const VERDICT_STYLES: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  correct: {
    bg: 'bg-emerald-950/90',
    border: 'border-emerald-500/40',
    icon: '✓',
    label: 'Correct',
  },
  partially_correct: {
    bg: 'bg-amber-950/90',
    border: 'border-amber-500/40',
    icon: '◐',
    label: 'Partially Correct',
  },
  incorrect: {
    bg: 'bg-rose-950/90',
    border: 'border-rose-500/40',
    icon: '✗',
    label: 'Incorrect',
  },
};

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 75 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171';

  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="drop-shadow-lg">
      <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
      <circle
        cx="44"
        cy="44"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
      <text x="44" y="44" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="20" fontWeight="700">
        {Math.round(score)}
      </text>
    </svg>
  );
}

function FeedbackModal({
  feedback,
  onDismiss,
}: {
  feedback: NonNullable<FeedbackState>;
  onDismiss: () => void;
}) {
  const verdictStyle = VERDICT_STYLES[feedback.verdict] ?? VERDICT_STYLES.incorrect;

  return (
    <div
      className="absolute inset-0 z-10 rounded-[2rem] bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onDismiss}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Escape' && onDismiss()}
    >
      <div
        className={`mx-auto flex h-full max-w-lg flex-col items-center justify-center rounded-[1.75rem] border ${verdictStyle.border} ${verdictStyle.bg} p-6 text-center text-white`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Verdict header */}
        <div className="flex items-center gap-3">
          <span className="text-4xl">{verdictStyle.icon}</span>
          <h4 className="text-2xl font-bold tracking-wide">{verdictStyle.label}</h4>
        </div>

        {/* Score ring */}
        <div className="mt-4">
          <ScoreRing score={feedback.score} />
        </div>

        {/* LLM Reasoning */}
        <div className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Evaluation</p>
          <p className="mt-1 text-sm leading-6 text-white/90">{feedback.reasoning}</p>
        </div>

        {/* Suggestions */}
        {feedback.suggestions && (
          <div className="mt-3 w-full rounded-xl bg-white/10 px-4 py-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Suggestion</p>
            <p className="mt-1 text-sm leading-6 text-white/90">{feedback.suggestions}</p>
          </div>
        )}

        {/* Correct answer explanation */}
        {feedback.explanation && (
          <div className="mt-3 w-full rounded-xl bg-white/5 px-4 py-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Correct Answer Explanation</p>
            <p className="mt-1 text-sm leading-6 text-white/70">{feedback.explanation}</p>
          </div>
        )}

        {/* LLM badge */}
        {feedback.llm_evaluated && (
          <p className="mt-4 text-xs text-white/40">Evaluated by AI</p>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 rounded-full border border-white/20 px-6 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export function QuizPanel({ sessionId, onCorrect, onIncorrect }: { sessionId: string; onCorrect?: () => void; onIncorrect?: () => void }) {
  const [question, setQuestion] = useState<QuestionResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const appearedAtRef = useRef<number>(Date.now());

  const fetchQuestion = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/question?session_id=${sessionId}`);
      if (!response.ok) {
        throw new Error('Question request failed');
      }
      const payload = (await response.json()) as QuestionResponse;
      setQuestion(payload);
      setAnswer('');
      setShowHint(false);
      setError(null);
      appearedAtRef.current = Date.now();
    } catch {
      // FIXED: Expose fetch failures so quiz panel never fails silently.
      setError('Unable to load the next question. Check backend connectivity and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // FIXED: Keep async call contained to avoid unhandled promise rejections.
    void fetchQuestion();
  }, [sessionId]);

  // Auto-advance after feedback is shown — longer delay to let user read LLM reasoning
  useEffect(() => {
    if (!feedback) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setFeedback(null);
      void fetchQuestion();
    }, 10000); // 10s to read rich feedback
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const badgeClass = useMemo(() => BAND_BADGES[question?.band ?? 'OPTIMAL'] ?? BAND_BADGES.OPTIMAL, [question?.band]);

  const dismissFeedback = () => {
    setFeedback(null);
    void fetchQuestion();
  };

  const submitAnswer = async () => {
    if (!question || !answer.trim()) {
      return;
    }
    const latencyMs = Date.now() - appearedAtRef.current;
    setIsEvaluating(true);
    try {
      const response = await fetch('/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          question_id: question.question_id,
          answer_text: answer,
          latency_ms: latencyMs
        })
      });

      if (!response.ok) {
        throw new Error('Answer submission failed');
      }

      const payload = await response.json();
      setFeedback(payload);
      setError(null);

      // Notify parent about correct/incorrect for revision scheduling
      if (payload.correct && onCorrect) {
        onCorrect();
      } else if (!payload.correct && onIncorrect) {
        onIncorrect();
      }
    } catch {
      // FIXED: Provide actionable feedback when answer submission fails.
      setError('Answer submission failed. Your response was not graded. Please retry.');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="glass-panel relative rounded-[2rem] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Adaptive Quiz</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">Current Prompt</h3>
        </div>
        {question ? <span className={`rounded-full px-4 py-2 text-sm font-semibold ${badgeClass}`}>{question.band}</span> : null}
      </div>

      <div className="mt-6 rounded-[1.75rem] bg-white/70 p-5">
        <p className="min-h-24 text-lg leading-8 text-slate-800">
          {isLoading && !question ? 'Generating a local question...' : question?.question_text ?? 'No question loaded yet.'}
        </p>
        {/* MCQ options display */}
        {question?.options && (
          <div className="mt-4 grid gap-2">
            {Object.entries(question.options).map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => setAnswer(String(value))}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  answer === String(value)
                    ? 'border-amber-400 bg-amber-50 font-semibold text-amber-900'
                    : 'border-slate-200 bg-white/60 text-slate-700 hover:bg-white/90'
                }`}
              >
                <span className="mr-2 font-bold text-slate-400">{key}.</span>
                {String(value)}
              </button>
            ))}
          </div>
        )}
        {error ? <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}
        {question?.hint ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowHint((current) => !current)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {showHint ? 'Hide Hint' : 'Show Hint'}
            </button>
            {showHint ? <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{question.hint}</p> : null}
          </div>
        ) : null}
      </div>

      <label className="mt-6 block text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Your answer</label>
      <textarea
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="Type your answer here. Typing rhythm is part of the local load estimate."
        className="mt-3 min-h-40 w-full rounded-[1.75rem] border border-white/50 bg-white/85 p-5 text-base leading-7 text-slate-900 outline-none transition focus:border-amber-400"
      />
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void fetchQuestion()}
          disabled={isLoading || isEvaluating}
          className="mr-3 rounded-full border border-slate-300 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh Question
        </button>
        <button
          type="button"
          onClick={() => void submitAnswer()}
          disabled={isLoading || isEvaluating || !question || !answer.trim()}
          className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isEvaluating ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
              </svg>
              Evaluating…
            </span>
          ) : isLoading ? (
            'Loading…'
          ) : (
            'Submit Answer'
          )}
        </button>
      </div>
      {feedback ? <FeedbackModal feedback={feedback} onDismiss={dismissFeedback} /> : null}
    </div>
  );
}
