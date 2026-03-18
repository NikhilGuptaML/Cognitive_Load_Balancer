/* This component runs the question-answer loop: fetch a question, collect the learner's response, submit it with latency, show short feedback, and then automatically request the next question. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type QuestionResponse = {
  question_id: string;
  question_text: string;
  band: string;
  options?: Record<string, string>;
  is_review?: boolean;
  session_complete?: boolean;
};

type FeedbackState = {
  correct: boolean;
  score: number;
  explanation: string;
  next_review_in_days?: number;
} | null;

const BAND_BADGES: Record<string, string> = {
  FLOW: 'bg-emerald-100 text-emerald-900',
  OPTIMAL: 'bg-blue-100 text-blue-900',
  ELEVATED: 'bg-amber-100 text-amber-900',
  OVERLOADED: 'bg-orange-100 text-orange-900',
  CRISIS: 'bg-rose-100 text-rose-900'
};

function FeedbackModal({ feedback }: { feedback: NonNullable<FeedbackState> }) {
  return (
    <div className="absolute inset-0 rounded-[2rem] bg-slate-950/55 p-5 text-white backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center rounded-[1.75rem] bg-slate-900/90 p-6 text-center">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-300">Feedback</p>
        <h4 className="mt-3 text-3xl font-semibold">{feedback.correct ? 'Correct' : feedback.score >= 50 ? 'Partial' : 'Incorrect'}</h4>
        <p className="mt-2 text-lg text-slate-200">Score: {Math.round(feedback.score)}</p>
        {feedback.next_review_in_days != null && (
          <p className="mt-2 text-sm text-slate-400">
            Next review in {feedback.next_review_in_days} day{feedback.next_review_in_days > 1 ? 's' : ''}
          </p>
        )}
        <p className="mt-4 text-sm leading-6 text-slate-300">{feedback.explanation}</p>
      </div>
    </div>
  );
}

export function QuizPanel({ sessionId, onCorrect, onIncorrect }: { sessionId: string; onCorrect?: () => void; onIncorrect?: () => void }) {
  const navigate = useNavigate();
  const [question, setQuestion] = useState<QuestionResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
      // FIXED: Handle session_complete signal — navigate to report page.
      if (payload.session_complete) {
        navigate(`/report/${sessionId}`);
        return;
      }
      setQuestion(payload);
      setAnswer('');
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

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setFeedback(null);
      void fetchQuestion();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const badgeClass = useMemo(() => BAND_BADGES[question?.band ?? 'OPTIMAL'] ?? BAND_BADGES.OPTIMAL, [question?.band]);

  const submitAnswer = async () => {
    if (!question || !answer.trim()) {
      return;
    }
    const latencyMs = Date.now() - appearedAtRef.current;
    setIsLoading(true);
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
      if (payload.correct) {
        onCorrect?.();
      } else {
        onIncorrect?.();
      }
      setError(null);
    } catch {
      // FIXED: Provide actionable feedback when answer submission fails.
      setError('Answer submission failed. Your response was not graded. Please retry.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel relative rounded-[2rem] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Adaptive Quiz</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">Current Prompt</h3>
        </div>
        <div className="flex items-center gap-2">
          {question?.is_review && (
            <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700">Review</span>
          )}
          {question ? <span className={`rounded-full px-4 py-2 text-sm font-semibold ${badgeClass}`}>{question.band}</span> : null}
        </div>
      </div>

      <div className="mt-6 rounded-[1.75rem] bg-white/70 p-5">
        <p className="min-h-24 text-lg leading-8 text-slate-800">
          {isLoading && !question ? 'Generating a local question...' : question?.question_text ?? 'No question loaded yet.'}
        </p>
        {error ? <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}
        {question?.options && (
          <div className="mt-5 flex flex-col gap-2">
            {Object.entries(question.options).map(([letter, text]) => (
              <button
                key={letter}
                type="button"
                onClick={() => setAnswer(String(text))}
                className={`flex items-start gap-3 rounded-xl p-3 shadow-sm text-left transition ${
                  answer === String(text) ? 'bg-indigo-50 ring-2 ring-indigo-300' : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <span className="font-bold text-indigo-600">{letter}:</span>
                <span className="text-slate-800">{text}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="mt-6 block text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Your answer (type the option text)</label>
      <input
        type="text"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="Type the full option text or click an option above..."
        className="mt-3 w-full rounded-2xl border border-slate-300 bg-white p-4 text-lg font-medium text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        onKeyDown={(e) => { if (e.key === 'Enter' && answer.trim()) void submitAnswer(); }}
      />
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void fetchQuestion()}
          disabled={isLoading}
          className="mr-3 rounded-full border border-slate-300 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh Question
        </button>
        <button
          type="button"
          onClick={() => void submitAnswer()}
          disabled={isLoading || !question || !answer.trim()}
          className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? 'Submitting...' : 'Submit Answer'}
        </button>
      </div>
      {feedback ? <FeedbackModal feedback={feedback} /> : null}
    </div>
  );
}
