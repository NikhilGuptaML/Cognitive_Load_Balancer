/* This component defines the app routes and initializes the RunAnywhere SDK on boot. */

import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ReportPage } from './pages/ReportPage';
import { SessionPage } from './pages/SessionPage';
import { SetupPage } from './pages/SetupPage';
import { initSDK } from './runanywhere';

export default function App() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    initSDK()
      .then(() => setSdkReady(true))
      .catch((err) => {
        console.error('SDK init failed:', err);
        setSdkError(err instanceof Error ? err.message : 'SDK initialization failed.');
      });
  }, []);

  if (sdkError) {
    return (
      <div className="app-shell">
        <div className="mx-auto max-w-xl rounded-[2rem] bg-rose-50 p-10 text-center">
          <h2 className="headline text-2xl text-rose-900">SDK Error</h2>
          <p className="mt-4 text-rose-700">{sdkError}</p>
          <p className="mt-2 text-sm text-rose-600">
            This app requires a browser with SharedArrayBuffer and WebAssembly support (Chrome, Edge, Firefox).
          </p>
        </div>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className="app-shell">
        <div className="mx-auto max-w-xl rounded-[2rem] glass-panel p-10 text-center float-in">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="mt-4 text-lg text-slate-700">Initializing on-device AI engine...</p>
          <p className="mt-2 text-sm text-slate-500">Loading WASM runtime</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<SetupPage />} />
      <Route path="/session/:sessionId" element={<SessionPage />} />
      <Route path="/report/:sessionId" element={<ReportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}