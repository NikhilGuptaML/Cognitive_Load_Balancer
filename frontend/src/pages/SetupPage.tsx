/* This page handles document upload and session creation so the learner can move from a blank state into a fully initialized local study session in one flow. */

import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type UploadState = {
  docId: string | null;
  chunkCount: number;
};

export function SetupPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState('local-student');
  const [pomodoroLength, setPomodoroLength] = useState(25);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({ docId: null, chunkCount: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      setError('Choose a PDF before uploading.');
      return;
    }

    setError(null);
    setIsBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/document/upload', {
        method: 'POST',
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? 'Upload failed.');
      }
      setUploadState({ docId: payload.doc_id, chunkCount: payload.chunk_count });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const startSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!uploadState.docId) {
      setError('Upload a document before starting a session.');
      return;
    }

    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch('/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, doc_id: uploadState.docId, pomodoro_length: pomodoroLength })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? 'Session start failed.');
      }

      window.localStorage.setItem(
        'clb.activeSession',
        JSON.stringify({
          sessionId: payload.session_id,
          docId: uploadState.docId,
          pomodoroLength,
          chunkCount: uploadState.chunkCount
        })
      );
      navigate(`/session/${payload.session_id}`);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : 'Session start failed.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="float-in glass-panel rounded-[2.5rem] p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">Offline-first study engine</p>
          <h1 className="headline mt-4 text-5xl leading-tight text-slate-900">Cognitive Load Balancer</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            CLB adapts every question locally by blending typing rhythm, facial tension, and response latency into a live cognitive-load estimate. No cloud APIs. No remote scoring. No data leaves the device.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.75rem] bg-white/65 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Signal mix</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">50 / 35 / 15</p>
            </div>
            <div className="rounded-[1.75rem] bg-white/65 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Model</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">Phi-3 Mini</p>
            </div>
            <div className="rounded-[1.75rem] bg-white/65 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Loop rate</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">2 sec</p>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2.5rem] p-8">
          <form onSubmit={startSession} className="space-y-6">
            <div>
              <label className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Learner ID</label>
              <input
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                className="mt-3 w-full rounded-[1.25rem] border border-white/50 bg-white/85 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Pomodoro length (minutes)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={pomodoroLength}
                onChange={(event) => setPomodoroLength(Number(event.target.value) || 25)}
                className="mt-3 w-full rounded-[1.25rem] border border-white/50 bg-white/85 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Study document (PDF)</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-3 block w-full rounded-[1.25rem] border border-dashed border-slate-300 bg-white/75 p-4 text-sm text-slate-700"
              />
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={isBusy || !file}
                className="mt-4 rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
              >
                {isBusy ? 'Working...' : 'Upload and Index PDF'}
              </button>
              {uploadState.docId ? (
                <p className="mt-3 text-sm text-emerald-700">Indexed successfully: {uploadState.chunkCount} chunks ready.</p>
              ) : null}
            </div>

            {error ? <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}

            <button
              type="submit"
              disabled={isBusy || !uploadState.docId}
              className="w-full rounded-full bg-slate-900 px-6 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Start Adaptive Session
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
