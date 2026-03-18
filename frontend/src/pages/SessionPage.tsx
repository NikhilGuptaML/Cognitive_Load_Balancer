/* This page composes the live load context, passive keystroke analysis, and adaptive quiz components into the main study experience. */

import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { AdaptationLog } from '../components/AdaptationLog';
import { BandIndicator } from '../components/BandIndicator';
import { FaceSignalCard } from '../components/FaceSignalCard';
import { LoadGauge } from '../components/LoadGauge';
import { PomodoroTimer } from '../components/PomodoroTimer';
import { QuizPanel } from '../components/QuizPanel';
import { ReviewQueue } from '../components/ReviewQueue';
import { LoadScoreProvider } from '../context/LoadScoreContext';
import { useFaceAnalyzer } from '../hooks/useFaceAnalyzer';
import { useKeystrokeAnalyzer } from '../hooks/useKeystrokeAnalyzer';

export function SessionPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const stored = window.localStorage.getItem('clb.activeSession');
  let parsed: { pomodoroLength?: number } | null = null;
  try {
    // FIXED: Prevent runtime crash when stored session payload is malformed.
    parsed = stored ? (JSON.parse(stored) as { pomodoroLength?: number }) : null;
  } catch {
    parsed = null;
  }
  const durationMinutes = parsed?.pomodoroLength ?? 25;

  const safeSessionId = useMemo(() => sessionId ?? '', [sessionId]);
  const { metrics } = useKeystrokeAnalyzer(safeSessionId || null, Boolean(safeSessionId));
  const face = useFaceAnalyzer(safeSessionId || null, Boolean(safeSessionId));

  if (!safeSessionId) {
    return (
      <div className="app-shell">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-white/80 p-10 text-center shadow-panel">
          <p className="text-lg text-slate-700">Missing session ID.</p>
        </div>
      </div>
    );
  }

  return (
    <LoadScoreProvider sessionId={safeSessionId}>
      <div className="app-shell">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Active Session</p>
              <h1 className="headline mt-2 text-4xl text-slate-900">Local Adaptive Study Loop</h1>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/report/${safeSessionId}`)}
              className="rounded-full bg-white/75 px-5 py-3 text-sm font-semibold text-slate-800 shadow-panel transition hover:bg-white"
            >
              Open Report
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] xl:grid-cols-[0.85fr_0.85fr_1.3fr]">
            <LoadGauge />
            <BandIndicator />
            <PomodoroTimer durationMinutes={durationMinutes} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <QuizPanel sessionId={safeSessionId} />
            <div className="space-y-6">
              <FaceSignalCard
                metrics={face.metrics}
                videoRef={face.videoRef}
                isActive={face.isActive}
                error={face.error}
              />
              <div className="glass-panel rounded-[2rem] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Typing Signal</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[1.5rem] bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">IKI Var</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.ikiVariance}</p>
                  </div>
                  <div className="rounded-[1.5rem] bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">WPM</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.wpm}</p>
                  </div>
                  <div className="rounded-[1.5rem] bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Backspace</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metrics.backspaceRate}</p>
                  </div>
                </div>
              </div>
              <AdaptationLog sessionId={safeSessionId} />
            </div>
          </div>

          <ReviewQueue sessionId={safeSessionId} />
        </div>
      </div>
    </LoadScoreProvider>
  );
}
