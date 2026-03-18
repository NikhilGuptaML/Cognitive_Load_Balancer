/* This component renders a webcam preview and live facial metrics (EAR, blinks/min, brow furrow)
   in a glass-panel card consistent with the existing Typing Signal card design. */

import type { FaceMetrics } from '../hooks/useFaceAnalyzer';

type FaceSignalCardProps = {
  metrics: FaceMetrics;
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
  error: string | null;
};

export function FaceSignalCard({ metrics, videoRef, isActive, error }: FaceSignalCardProps) {
  return (
    <div className="glass-panel rounded-[2rem] p-6 float-in stagger-3">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
        Face Signal
      </p>

      {/* Webcam preview */}
      <div className="mt-4 flex justify-center">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-100/50 shadow-sm"
             style={{ width: 160, height: 120 }}>
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{
              transform: 'scaleX(-1)',
              display: isActive ? 'block' : 'none',
            }}
          />
          {!isActive && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center">
              {error ? (
                <p className="text-xs text-red-500/80">{error}</p>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                       strokeLinejoin="round" className="h-6 w-6 animate-pulse text-slate-400">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <p className="text-xs text-slate-400">Starting camera…</p>
                </>
              )}
            </div>
          )}
          {/* Active indicator dot */}
          {isActive && (
            <span className="absolute right-2 top-2 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
          )}
        </div>
      </div>

      {/* Metric tiles */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.5rem] bg-white/70 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">EAR</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {isActive ? metrics.ear.toFixed(3) : '—'}
          </p>
        </div>
        <div className="rounded-[1.5rem] bg-white/70 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Blinks/min</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {isActive ? metrics.blinksPerMin.toFixed(1) : '—'}
          </p>
        </div>
        <div className="rounded-[1.5rem] bg-white/70 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Brow</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {isActive ? metrics.rawScore.toFixed(1) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
