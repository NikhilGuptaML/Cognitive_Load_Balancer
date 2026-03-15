/* This component presents the active difficulty band and contributing signals so the learner can understand why the system is adjusting its behavior. */

import { useLoadScore } from '../context/LoadScoreContext';

const BAND_STYLES: Record<string, string> = {
  FLOW: 'bg-emerald-100 text-emerald-800',
  OPTIMAL: 'bg-blue-100 text-blue-800',
  ELEVATED: 'bg-amber-100 text-amber-800',
  OVERLOADED: 'bg-orange-100 text-orange-800',
  CRISIS: 'bg-rose-100 text-rose-800'
};

export function BandIndicator() {
  const { band, signalsActive, socketStatus } = useLoadScore();

  return (
    <div className="glass-panel rounded-[2rem] p-6 float-in stagger-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Adaptive Band</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">{band}</h3>
        </div>
        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${BAND_STYLES[band] ?? BAND_STYLES.OPTIMAL}`}>
          {band}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(signalsActive.length ? signalsActive : ['awaiting-signals']).map((signal) => (
          <span key={signal} className="rounded-full bg-slate-900/6 px-3 py-1 text-xs font-medium text-slate-700">
            {signal}
          </span>
        ))}
      </div>
      <p className="mt-4 text-sm text-slate-500">Socket status: {socketStatus}</p>
    </div>
  );
}
