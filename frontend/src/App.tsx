/* App routes with resilient SDK init — allows degraded (fallback-grader) mode if WASM fails. */

import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ReportPage } from './pages/ReportPage';
import { SessionPage } from './pages/SessionPage';
import { SetupPage } from './pages/SetupPage';
import { initSDK } from './runanywhere';

type SDKState = 'loading' | 'ready' | 'degraded';

export default function App() {
  const [sdkState, setSdkState] = useState<SDKState>('loading');
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    initSDK()
      .then(() => setSdkState('ready'))
      .catch((err) => {
        console.error('[SDK] Init error (running in degraded/fallback mode):', err);
        setSdkError(err instanceof Error ? err.message : String(err));
        setSdkState('degraded'); // allow app to continue — fallback grader still works
      });
  }, []);

  // Only block for the brief moment the SDK is first loading
  if (sdkState === 'loading') {
    return (
      <div className="app-shell">
        <div className="mx-auto max-w-xl rounded-[2rem] glass-panel p-10 text-center float-in">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="mt-4 text-lg text-slate-700">Initializing on-device AI engine…</p>
          <p className="mt-2 text-sm text-slate-500">Loading WASM runtime</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Non-blocking degraded-mode banner — shown when WASM failed to load */}
      {sdkState === 'degraded' && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-4 bg-amber-600 px-6 py-3 text-sm font-medium text-white shadow-lg">
          <span>
            ⚠️ On-device AI unavailable (WASM error) — using keyword fallback grader.
            {sdkError ? ` Detail: ${sdkError}` : ''}
          </span>
          <a
            href="https://developer.chrome.com/blog/cross-origin-isolation-guide"
            target="_blank"
            rel="noopener noreferrer"
            className="underline opacity-80 hover:opacity-100"
          >
            Learn more
          </a>
        </div>
      )}

      <Routes>
        <Route path="/" element={<SetupPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/report/:sessionId" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}