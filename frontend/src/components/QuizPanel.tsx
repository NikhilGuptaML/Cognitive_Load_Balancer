/* This component runs the question-answer loop entirely locally: generates questions via on-device LLM, evaluates answers, and tracks latency — all in the browser. */

import { useEffect, useMemo, useRef, useState } from 'react';

import { buildQuestionPrompt, getBand } from '../engine/difficultyController';
import { retrieveContext } from '../engine/documentProcessor';
import { generateJSON, simpleGrade, LLMUnavailableError } from '../engine/llmClient';
import { latencyTracker } from '../engine/latencyTracker';
import { loadAggregator } from '../engine/loadAggregator';
import { renderAnswerEvaluationPrompt } from '../engine/promptBuilder';
import { sessionStore } from '../engine/sessionStore';
import { useLoadScore } from '../context/LoadScoreContext';

type QuestionData = {
  questionId: string;
  questionText: string;
  band: string;
  hint?: string | null;
};

type FeedbackState = {
  correct: boolean;
  score: number;
  explanation: string;
} | null;

const BAND_BADGES: Record<string, string> = {
  FLOW: 'bg-emerald-100 text-emerald-900',
  OPTIMAL: 'bg-blue-100 text-blue-900',
  ELEVATED: 'bg-amber-100 text-amber-900',
  OVERLOADED: 'bg-orange-100 text-orange-900',
  CRISIS: 'bg-rose-100 text-rose-900',
};

function FeedbackModal({ feedback }: { feedback: NonNullable<FeedbackState> }) {
  return (
    <div className="absolute inset-0 rounded-[2rem] bg-slate-950/55 p-5 text-white backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center rounded-[1.75rem] bg-slate-900/90 p-6 text-center">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-300">Feedback</p>
        <h4 className="mt-3 text-3xl font-semibold">
          {feedback.correct ? 'Correct' : feedback.score >= 50 ? 'Partial' : 'Incorrect'}
        </h4>
        <p className="mt-2 text-lg text-slate-200">Score: {Math.round(feedback.score)}</p>
        <p className="mt-4 text-sm leading-6 text-slate-300">{feedback.explanation}</p>
      </div>
    </div>
  );
}

function fallbackQuestion(contextChunks: string[], band: string): { questionText: string; hint: string } {
  const source = contextChunks[0] ?? 'the uploaded material';
  const excerpt = source.substring(0, 220).trim();
  return {
    questionText: `[${band}] Summarize the key idea from this excerpt and explain why it matters: ${excerpt}`,
    hint: 'Anchor your answer in one concrete detail from the passage.',
  };
}

export function QuizPanel({ sessionId }: { sessionId: string }) {
  const { score } = useLoadScore();
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const appearedAtRef = useRef<number>(Date.now());

  const fetchQuestion = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const band = getBand(score);
      const session = sessionStore.getSession(sessionId);
      const docId = session?.docId ?? sessionId;

      // Retrieve document context
      let contextChunks: string[] = [];
      try {
        contextChunks = retrieveContext(docId, '');
      } catch {
        // No document indexed — will use fallback
      }

      // Get question history
      const recentQuestions = sessionStore.getRecentQuestions(sessionId, 5);
      const historyPayload = recentQuestions.map((q) => ({
        question: q.text,
        band: q.band,
        hint: q.hint,
      }));

      // Try LLM generation
      const prompt = buildQuestionPrompt(band, contextChunks, historyPayload);
      let questionText: string;
      let hint: string | null;

      try {
        const result = await generateJSON<{ question_text?: string; hint?: string }>(prompt);
        questionText = (result.question_text ?? '').trim();
        hint = (result.hint ?? '').trim() || null;
        if (!questionText) throw new Error('Empty question text.');
      } catch {
        const fb = fallbackQuestion(contextChunks, band);
        questionText = fb.questionText;
        hint = fb.hint;
      }

      const questionId = crypto.randomUUID();

      // Store the question
      sessionStore.recordQuestion({
        id: questionId,
        sessionId,
        text: questionText,
        band,
        loadAtTime: score,
        askedAt: new Date().toISOString(),
        hint,
      });

      latencyTracker.markQuestionPresented(sessionId);

      setQuestion({ questionId, questionText, band, hint });
      setAnswer('');
      setShowHint(false);
      appearedAtRef.current = Date.now();
    } catch (err) {
      setError('Unable to generate a question. Please try again.');
      console.error('Question generation failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchQuestion();
  }, [sessionId]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => {
      setFeedback(null);
      void fetchQuestion();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [feedback, sessionId]);

  const badgeClass = useMemo(
    () => BAND_BADGES[question?.band ?? 'OPTIMAL'] ?? BAND_BADGES.OPTIMAL,
    [question?.band]
  );

  const submitAnswer = async () => {
    if (!question || !answer.trim()) return;

    const latencyMs = Date.now() - appearedAtRef.current;
    setIsLoading(true);
    setError(null);

    try {
      // Record latency and update load signal
      const latencyMetrics = latencyTracker.recordLatency(sessionId, latencyMs);
      loadAggregator.updateSignal('latency', latencyMetrics.rawScore);

      // Retrieve context for grading
      const session = sessionStore.getSession(sessionId);
      const docId = session?.docId ?? sessionId;
      let contextChunks: string[] = [];
      try {
        contextChunks = retrieveContext(docId, question.questionText);
      } catch {
        // No context available
      }

      let correct: boolean;
      let gradeScore: number;
      let explanation: string;

      try {
        const prompt = renderAnswerEvaluationPrompt(question.questionText, answer, contextChunks);
        const result = await generateJSON<{ correct?: boolean; score?: number; explanation?: string }>(prompt);
        correct = Boolean(result.correct ?? false);
        gradeScore = Math.max(0, Math.min(100, Number(result.score ?? 0)));
        explanation = (result.explanation ?? '').trim() || 'No explanation provided.';
      } catch {
        const fb = simpleGrade(answer, contextChunks);
        correct = fb.correct;
        gradeScore = fb.score;
        explanation = fb.explanation;
      }

      // Store the answer
      sessionStore.recordAnswer({
        questionId: question.questionId,
        sessionId,
        answerText: answer,
        latencyMs,
        correct,
        score: gradeScore,
      });

      setFeedback({ correct, score: gradeScore, explanation });
    } catch {
      setError('Answer evaluation failed. Please retry.');
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
        {question ? (
          <span className={`rounded-full px-4 py-2 text-sm font-semibold ${badgeClass}`}>
            {question.band}
          </span>
        ) : null}
      </div>

      <div className="mt-6 rounded-[1.75rem] bg-white/70 p-5">
        <p className="min-h-24 text-lg leading-8 text-slate-800">
          {isLoading && !question
            ? 'Generating a question with on-device AI...'
            : question?.questionText ?? 'No question loaded yet.'}
        </p>
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
            {showHint ? (
              <p className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{question.hint}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <label className="mt-6 block text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        Your answer
      </label>
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
          {isLoading ? 'Processing...' : 'Submit Answer'}
        </button>
      </div>
      {feedback ? <FeedbackModal feedback={feedback} /> : null}
    </div>
  );
}
