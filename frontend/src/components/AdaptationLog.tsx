/* This component polls the session report and visualizes recent load history plus band transitions so the learner can inspect how the adaptive system responded over time. */

import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type ReportPoint = {
  timestamp: string;
  score: number;
  band: string;
};

type BandChange = {
  timestamp: string;
  from_band: string | null;
  to_band: string;
  trigger_score: number;
  reason: string;
};

export function AdaptationLog({ sessionId }: { sessionId: string }) {
  const [loadSeries, setLoadSeries] = useState<ReportPoint[]>([]);
  const [changes, setChanges] = useState<BandChange[]>([]);

  useEffect(() => {
    let mounted = true;

    const fetchReport = async () => {
      try {
        const response = await fetch(`/session/report?session_id=${sessionId}`);
        if (!response.ok) {
          return;
        }
        const report = await response.json();
        if (!mounted) {
          return;
        }
        setLoadSeries(report.load_series ?? []);
        setChanges(report.band_changes ?? []);
      } catch {
        // Silent retries are enough for a passive log panel.
      }
    };

    fetchReport();
    const interval = window.setInterval(fetchReport, 8000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [sessionId]);

  return (
    <div className="glass-panel rounded-[2rem] p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Adaptation Log</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">Recent Load Dynamics</h3>
        </div>
      </div>
      <div className="mt-6 h-56 rounded-3xl bg-white/60 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={loadSeries}>
            <XAxis dataKey="timestamp" hide />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Line type="monotone" dataKey="score" stroke="#1565C0" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-5 max-h-48 space-y-3 overflow-auto pr-2">
        {changes.length === 0 ? (
          <p className="text-sm text-slate-500">Band changes will appear here as the session adapts.</p>
        ) : (
          changes
            .slice()
            .reverse()
            .map((change) => (
              <div key={`${change.timestamp}-${change.to_band}`} className="rounded-2xl bg-white/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">
                    {change.from_band ?? 'START'} to {change.to_band}
                  </span>
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{Math.round(change.trigger_score)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{change.reason}</p>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
