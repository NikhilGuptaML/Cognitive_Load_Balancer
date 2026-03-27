/* This page presents the persisted session summary so the learner can inspect performance, load trends, and adaptation history after the active study loop. */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getApiUrl } from '../apiConfig';

type SessionReport = {
  avg_load: number;
  accuracy: number;
  answer_count: number;
  correct_count: number;
  band_changes: Array<{ to_band: string; timestamp: string; reason: string }>;
};

export function ReportPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [report, setReport] = useState<SessionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      return;
    }
    const loadReport = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(getApiUrl(`/session/report?session_id=${sessionId}`));
        if (!response.ok) {
          throw new Error('Report request failed');
        }
        setReport(await response.json());
        setError(null);
      } catch {
        // FIXED: Surface report fetch failures instead of silently rendering empty values.
        setError('Unable to load the session report right now.');
      } finally {
        setIsLoading(false);
      }
    };
    void loadReport();
  }, [sessionId]);

  return (
    <div className="app-shell">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Session Report</p>
            <h1 className="headline mt-2 text-4xl text-slate-900">Outcome Snapshot</h1>
          </div>
          {sessionId ? (
            <button
              type="button"
              onClick={() => navigate(`/session/${sessionId}`)}
              className="rounded-full bg-white/80 px-5 py-3 text-sm font-semibold text-slate-800 shadow-panel"
            >
              Back to Session
            </button>
          ) : null}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="glass-panel rounded-[2rem] p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Average Load</p>
            <p className="mt-3 text-4xl font-semibold text-slate-900">{report ? Math.round(report.avg_load) : '--'}</p>
          </div>
          <div className="glass-panel rounded-[2rem] p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Accuracy</p>
            <p className="mt-3 text-4xl font-semibold text-slate-900">{report ? `${Math.round(report.accuracy)}%` : '--'}</p>
          </div>
          <div className="glass-panel rounded-[2rem] p-6">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Answers</p>
            <p className="mt-3 text-4xl font-semibold text-slate-900">{report ? report.answer_count : '--'}</p>
          </div>
        </div>

        {isLoading ? <p className="text-slate-600">Loading report...</p> : null}
        {error ? <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}

        <div className="glass-panel rounded-[2rem] p-8">
          <h2 className="text-2xl font-semibold text-slate-900">Band Transitions</h2>
          <div className="mt-5 space-y-4">
            {report?.band_changes?.length ? (
              report.band_changes.map((change) => (
                <div key={`${change.timestamp}-${change.to_band}`} className="rounded-[1.5rem] bg-white/70 p-4">
                  <p className="text-base font-semibold text-slate-900">{change.to_band}</p>
                  <p className="mt-1 text-sm text-slate-500">{change.reason}</p>
                </div>
              ))
            ) : (
              <p className="text-slate-500">No transitions recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
