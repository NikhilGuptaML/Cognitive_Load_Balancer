/* This component renders the live composite load score as an animated semicircular gauge so the learner can see adaptation pressure change in real time without interpreting raw numbers. */

import { useMemo } from 'react';

import { useLoadScore } from '../context/LoadScoreContext';

const BAND_COLORS: Record<string, string> = {
  FLOW: '#2E7D32',
  OPTIMAL: '#1565C0',
  ELEVATED: '#F57F17',
  OVERLOADED: '#E65100',
  CRISIS: '#B71C1C'
};

export function LoadGauge() {
  const { score, band } = useLoadScore();
  const stroke = BAND_COLORS[band] ?? BAND_COLORS.OPTIMAL;
  const progress = Math.max(0, Math.min(100, score));

  const arcPath = useMemo(() => 'M 20 100 A 80 80 0 0 1 180 100', []);

  return (
    <div className="glass-panel rounded-[2rem] p-6 float-in stagger-1">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Live Load</span>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-600">Composite</span>
      </div>
      <svg viewBox="0 0 200 110" className="mx-auto w-full max-w-[320px] overflow-visible">
        <path d={arcPath} fill="none" stroke="rgba(19,34,56,0.12)" strokeWidth="14" strokeLinecap="round" />
        <path
          d={arcPath}
          fill="none"
          stroke={stroke}
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${progress} 100`}
          style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.8s ease' }}
        />
        <text x="100" y="94" textAnchor="middle" className="fill-slate-900 text-[1.4rem] font-bold">
          {Math.round(score)}
        </text>
      </svg>
      <div className="mt-2 text-center">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Band</div>
        <div className="mt-1 text-lg font-semibold" style={{ color: stroke, transition: 'color 0.8s ease' }}>
          {band}
        </div>
      </div>
    </div>
  );
}
