/* This page manages research participants for multi-user pilot studies. Left panel handles
   participant CRUD and activation; right panel renders per-participant charts from exported data. */

import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ---------- Types ----------

type Participant = {
  id: number;
  label: string;
  created_at: string | null;
  is_active: boolean;
  notes: string | null;
  session_count: number;
  event_count: number;
  band_distribution: Record<string, number>;
};

type SessionBreakdown = {
  session_id: string;
  event_count: number;
  avg_score: number;
  dominant_band: string;
};

type ExportData = {
  participant: string;
  score_series: number[];
  band_series: string[];
  band_distribution: Record<string, number>;
  transitions: number;
  session_count: number;
  sessions_breakdown: SessionBreakdown[];
};

// ---------- Palette ----------

const BAND_COLORS: Record<string, string> = {
  FLOW: '#14b8a6',
  OPTIMAL: '#22c55e',
  ELEVATED: '#f59e0b',
  OVERLOADED: '#f97316',
  CRISIS: '#ef4444',
};

// ---------- Component ----------

export function ParticipantDashboard() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await fetch('/participants');
      if (!res.ok) throw new Error('Failed to load participants.');
      const data: Participant[] = await res.json();
      setParticipants(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchParticipants();
  }, [fetchParticipants]);

  const handleViewCharts = async (id: number) => {
    setSelectedId(id);
    setChartLoading(true);
    setExportData(null);
    try {
      const res = await fetch(`/participants/${id}/export`);
      if (!res.ok) throw new Error('Failed to export participant data.');
      const data: ExportData = await res.json();
      setExportData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setChartLoading(false);
    }
  };

  const handleActivate = async (id: number) => {
    await fetch(`/participants/${id}/activate`, { method: 'POST' });
    await fetchParticipants();
  };

  const handleAddParticipant = async () => {
    if (!newLabel.trim()) return;
    await fetch('/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    setNewLabel('');
    setShowAddModal(false);
    await fetchParticipants();
  };

  const handleResetData = async (id: number) => {
    await fetch(`/participants/${id}/data`, { method: 'DELETE' });
    setShowResetModal(null);
    if (selectedId === id) {
      setExportData(null);
      setSelectedId(null);
    }
    await fetchParticipants();
  };

  // Active participant reference
  const activeParticipant = participants.find((p) => p.is_active);
  const selectedParticipant = participants.find((p) => p.id === selectedId);

  // Compute charts
  const scoreTimeData = exportData?.score_series.map((s, i) => ({ step: i, score: s })) ?? [];
  const bandPieData = exportData
    ? Object.entries(exportData.band_distribution)
        .filter(([, count]) => count > 0)
        .map(([band, count]) => ({ name: band, value: count }))
    : [];
  const sessionBarData = exportData?.sessions_breakdown.map((s, i) => ({
    name: `S${i + 1}`,
    avg_score: s.avg_score,
    dominant_band: s.dominant_band,
  })) ?? [];

  // Most common band
  const mostCommonBand = exportData
    ? Object.entries(exportData.band_distribution).reduce((a, b) => (b[1] > a[1] ? b : a), ['OPTIMAL', 0])[0]
    : null;

  if (loading) {
    return (
      <div className="app-shell">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-6 w-64 rounded bg-slate-200/60" />
          <div className="h-96 rounded-[2rem] bg-slate-200/40" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Title */}
        <div className="float-in">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">
            Multi-User Pilot Study
          </p>
          <h1 className="headline mt-2 text-4xl text-slate-900">Research Participants</h1>
        </div>

        {/* Active participant banner */}
        {activeParticipant && (
          <div className="float-in rounded-[1.5rem] border border-emerald-300 bg-emerald-50/90 px-6 py-3 text-sm font-medium text-emerald-900">
            🟢 Active Participant: <span className="font-bold">{activeParticipant.label}</span> —
            all new load events will be tagged to this participant.
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        )}

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* ===== LEFT PANEL ===== */}
          <div className="space-y-4">
            {participants.map((p) => (
              <div
                key={p.id}
                className={`glass-panel rounded-[1.75rem] p-5 transition ${
                  p.is_active ? 'ring-2 ring-emerald-400' : ''
                } ${selectedId === p.id ? 'border-l-4 border-l-indigo-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{p.label}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {p.session_count} session{p.session_count !== 1 ? 's' : ''} ·{' '}
                      {p.event_count} events
                    </p>
                  </div>
                  {p.is_active && (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!p.is_active && (
                    <button
                      onClick={() => void handleActivate(p.id)}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => void handleViewCharts(p.id)}
                    className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
                  >
                    View Charts
                  </button>
                  <button
                    onClick={() => setShowResetModal(p.id)}
                    className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-500"
                  >
                    Reset Data
                  </button>
                </div>
              </div>
            ))}

            {/* Add participant button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full rounded-[1.75rem] border-2 border-dashed border-slate-300 py-4 text-sm font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
            >
              + Add Participant
            </button>
          </div>

          {/* ===== RIGHT PANEL ===== */}
          <div className="space-y-6">
            {chartLoading && (
              <div className="glass-panel rounded-[2rem] p-10 text-center animate-pulse">
                <div className="h-6 w-48 rounded bg-slate-200/60 mx-auto mb-4" />
                <div className="h-64 rounded-xl bg-slate-200/40" />
              </div>
            )}

            {!chartLoading && !exportData && !selectedId && (
              <div className="glass-panel rounded-[2rem] p-10 text-center">
                <p className="text-sm text-slate-500">
                  Select a participant and click <span className="font-semibold">"View Charts"</span> to
                  see their data.
                </p>
              </div>
            )}

            {!chartLoading && exportData && selectedParticipant && (
              <>
                {/* Stats header */}
                <div className="float-in glass-panel rounded-[2rem] p-6">
                  <div className="grid gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Participant</p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">{exportData.participant}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sessions</p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">{exportData.session_count}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Events</p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">{exportData.score_series.length}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Common Band</p>
                      <p
                        className="mt-1 text-xl font-semibold"
                        style={{ color: mostCommonBand ? BAND_COLORS[mostCommonBand] : '#334155' }}
                      >
                        {mostCommonBand ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {exportData.score_series.length === 0 ? (
                  <div className="glass-panel rounded-[2rem] p-10 text-center">
                    <p className="text-sm text-slate-500">
                      No data recorded yet for this participant. Activate them and run a session.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Chart A: Score over time */}
                    <div className="float-in glass-panel rounded-[2rem] p-8">
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 mb-6">
                        Load Score Over Time
                      </p>
                      <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={scoreTimeData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                          <XAxis dataKey="step" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                          <Tooltip
                            contentStyle={{
                              background: 'rgba(255,252,246,0.95)',
                              border: '1px solid rgba(0,0,0,0.08)',
                              borderRadius: '1rem',
                              fontSize: '13px',
                            }}
                          />
                          <ReferenceLine y={25} stroke="#14b8a6" strokeDasharray="4 4" />
                          <ReferenceLine y={50} stroke="#22c55e" strokeDasharray="4 4" />
                          <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" />
                          <ReferenceLine y={90} stroke="#f97316" strokeDasharray="4 4" />
                          <Line dataKey="score" stroke="#6366f1" dot={false} strokeWidth={2} name="Composite Score" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Chart B: Band distribution pie */}
                    <div className="float-in glass-panel rounded-[2rem] p-8">
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 mb-6">
                        Band Distribution
                      </p>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={bandPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={110}
                            label={({ name, percent }: { name: string; percent: number }) =>
                              `${name} ${(percent * 100).toFixed(0)}%`
                            }
                          >
                            {bandPieData.map((entry) => (
                              <Cell key={entry.name} fill={BAND_COLORS[entry.name] ?? '#94a3b8'} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Chart C: Per-session breakdown */}
                    {sessionBarData.length > 0 && (
                      <div className="float-in glass-panel rounded-[2rem] p-8">
                        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 mb-6">
                          Per-Session Breakdown
                        </p>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={sessionBarData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
                            <Tooltip
                              contentStyle={{
                                background: 'rgba(255,252,246,0.95)',
                                border: '1px solid rgba(0,0,0,0.08)',
                                borderRadius: '1rem',
                                fontSize: '13px',
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Bar dataKey="avg_score" name="Avg Score" radius={[6, 6, 0, 0]}>
                              {sessionBarData.map((s, i) => (
                                <Cell key={i} fill={BAND_COLORS[s.dominant_band] ?? '#94a3b8'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ===== ADD MODAL ===== */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="glass-panel rounded-[2rem] p-8 w-full max-w-md mx-4 space-y-5">
              <h2 className="text-lg font-semibold text-slate-900">Add Participant</h2>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. User 3"
                className="w-full rounded-[1.25rem] border border-white/50 bg-white/85 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAddParticipant(); }}
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setShowAddModal(false); setNewLabel(''); }}
                  className="rounded-full bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleAddParticipant()}
                  disabled={!newLabel.trim()}
                  className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-400"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== RESET CONFIRMATION MODAL ===== */}
        {showResetModal !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="glass-panel rounded-[2rem] p-8 w-full max-w-md mx-4 space-y-5">
              <h2 className="text-lg font-semibold text-slate-900">Reset Participant Data</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                This will permanently delete all session data for{' '}
                <span className="font-bold">
                  {participants.find((p) => p.id === showResetModal)?.label ?? 'this participant'}
                </span>
                . Their participant record will remain so you can re-run their session.
                This does <span className="font-bold">NOT</span> affect other participants.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowResetModal(null)}
                  className="rounded-full bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleResetData(showResetModal)}
                  className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500"
                >
                  Yes, Reset Data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
