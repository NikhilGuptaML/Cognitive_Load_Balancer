/* This page visualises CLB's Monte Carlo pilot simulation and signal-fusion ablation results using
   recharts, fully self-contained and decoupled from the live adaptive-session flow. */

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ---------- Types ----------

type UserResult = {
  id: string;
  label: string;
  band_distribution: Record<string, number>;
  score_series: number[];
  band_series: string[];
  transitions: number;
};

type AblationConfig = {
  scores: number[];
  variance: number;
};

type PilotPayload = {
  users: UserResult[];
  ablation: Record<string, number[]>;
};

type AblationPayload = {
  profile: string;
  configs: Record<string, AblationConfig>;
};

// ---------- Palette ----------

const BAND_COLORS: Record<string, string> = {
  FLOW: '#14b8a6',
  OPTIMAL: '#22c55e',
  ELEVATED: '#f59e0b',
  OVERLOADED: '#f97316',
  CRISIS: '#ef4444',
};

const USER_COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6'];

const ABLATION_COLORS: Record<string, string> = {
  keystroke_only: '#f97316',
  keystroke_face: '#8b5cf6',
  all_channels: '#14b8a6',
};

const ABLATION_LABELS: Record<string, string> = {
  keystroke_only: 'Keystroke Only',
  keystroke_face: 'Keystroke + Face',
  all_channels: 'All Channels',
};

// ---------- Skeleton ----------

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-panel rounded-[2rem] p-8">
          <div className="h-5 w-48 rounded bg-slate-200/60 mb-4" />
          <div className="h-64 rounded-xl bg-slate-200/40" />
        </div>
      ))}
    </div>
  );
}

// ---------- Component ----------

export function SimulationDashboard() {
  const [pilot, setPilot] = useState<PilotPayload | null>(null);
  const [ablation, setAblation] = useState<AblationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [pRes, aRes] = await Promise.all([
          fetch('/simulation/pilot'),
          fetch('/simulation/ablation'),
        ]);
        if (!pRes.ok || !aRes.ok) throw new Error('Simulation API request failed.');
        const pData: PilotPayload = await pRes.json();
        const aData: AblationPayload = await aRes.json();
        if (!cancelled) {
          setPilot(pData);
          setAblation(aData);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="app-shell"><div className="mx-auto max-w-7xl"><Skeleton /></div></div>;
  if (error) return <div className="app-shell"><div className="mx-auto max-w-3xl glass-panel rounded-[2rem] p-10 text-center"><p className="text-rose-600">{error}</p></div></div>;
  if (!pilot || !ablation) return null;

  // ----- Band distribution grouped bar data -----
  const bandBars = pilot.users.map((u) => ({
    name: u.label,
    ...u.band_distribution,
  }));

  // ----- Score over time -----
  const maxLen = Math.max(...pilot.users.map((u) => u.score_series.length));
  const scoreOverTime = Array.from({ length: maxLen }, (_, i) => {
    const row: Record<string, number> = { step: i };
    pilot.users.forEach((u) => {
      row[u.id] = u.score_series[i] ?? 0;
    });
    return row;
  });

  // ----- Ablation data -----
  const ablationKeys = Object.keys(ablation.configs);
  const ablationLen = Math.max(...ablationKeys.map((k) => ablation.configs[k].scores.length));
  const ablationData = Array.from({ length: ablationLen }, (_, i) => {
    const row: Record<string, number> = { step: i };
    ablationKeys.forEach((k) => {
      row[k] = ablation.configs[k].scores[i] ?? 0;
    });
    return row;
  });

  return (
    <div className="app-shell">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="float-in">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">
            Research Analytics
          </p>
          <h1 className="headline mt-2 text-4xl text-slate-900">
            Pilot Simulation Results
          </h1>
        </div>

        {/* Disclaimer */}
        <div className="float-in rounded-[1.5rem] border border-amber-300 bg-amber-50/90 px-6 py-4 text-sm font-medium text-amber-900">
          ⚠️ Simulated Data — These results are derived from CLB's mathematical pipeline using synthetic
          inputs. Not from real users.
        </div>

        {/* Summary cards */}
        <div className="float-in grid gap-4 sm:grid-cols-5">
          {pilot.users.map((u, idx) => (
            <div
              key={u.id}
              className="glass-panel rounded-[1.75rem] p-5"
              style={{ borderLeft: `4px solid ${USER_COLORS[idx]}` }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{u.id}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{u.label}</p>
              <p className="mt-2 text-xs text-slate-500">{u.transitions} transitions</p>
            </div>
          ))}
        </div>

        {/* Chart 1: Band Distribution */}
        <div className="float-in glass-panel rounded-[2rem] p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 mb-6">
            Band Distribution by User (%)
          </p>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={bandBars} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,252,246,0.95)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '1rem',
                  fontSize: '13px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {Object.entries(BAND_COLORS).map(([band, color]) => (
                <Bar key={band} dataKey={band} fill={color} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Score Over Time */}
        <div className="float-in glass-panel rounded-[2rem] p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 mb-6">
            Composite Score Over Time (EWMA-smoothed)
          </p>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={scoreOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="step"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                label={{ value: 'Time Step (5s intervals)', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#94a3b8' }}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,252,246,0.95)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '1rem',
                  fontSize: '13px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <ReferenceLine y={25} stroke="#14b8a6" strokeDasharray="4 4" label={{ value: 'FLOW', position: 'right', fontSize: 10, fill: '#14b8a6' }} />
              <ReferenceLine y={50} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'OPTIMAL', position: 'right', fontSize: 10, fill: '#22c55e' }} />
              <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'ELEVATED', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
              <ReferenceLine y={90} stroke="#f97316" strokeDasharray="4 4" label={{ value: 'OVERLOADED', position: 'right', fontSize: 10, fill: '#f97316' }} />
              {pilot.users.map((u, idx) => (
                <Line
                  key={u.id}
                  dataKey={u.id}
                  name={u.label}
                  stroke={USER_COLORS[idx]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 3: Ablation */}
        <div className="float-in glass-panel rounded-[2rem] p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 mb-1">
            Component Ablation — {ablation.profile}
          </p>
          <p className="text-lg font-semibold text-slate-900 mb-6">
            Signal Fusion Reduces Score Variance
          </p>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={ablationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="step"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                label={{ value: 'Time Step (5s intervals)', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#94a3b8' }}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,252,246,0.95)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '1rem',
                  fontSize: '13px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <ReferenceLine y={25} stroke="#14b8a6" strokeDasharray="4 4" />
              <ReferenceLine y={50} stroke="#22c55e" strokeDasharray="4 4" />
              <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine y={90} stroke="#f97316" strokeDasharray="4 4" />
              {ablationKeys.map((k) => (
                <Line
                  key={k}
                  dataKey={k}
                  name={`${ABLATION_LABELS[k]} (σ = ${ablation.configs[k].variance})`}
                  stroke={ABLATION_COLORS[k]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
