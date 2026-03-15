/* This page handles document upload and session creation using local processing and the RunAnywhere SDK model. */

import { FormEvent, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { indexDocument } from '../engine/documentProcessor';
import { ensureModelReady } from '../engine/llmClient';
import { sessionStore } from '../engine/sessionStore';

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
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [statusText, setStatusText] = useState('');

  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Choose a PDF before uploading.');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF uploads are supported.');
      return;
    }

    setError(null);
    setIsBusy(true);
    setStatusText('Extracting and indexing PDF...');

    try {
      // Use a temporary session ID for the document index (will be replaced on session start)
      const tempId = crypto.randomUUID();
      const index = await indexDocument(file, tempId);
      setUploadState({ docId: tempId, chunkCount: index.chunks.length });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Document processing failed.');
    } finally {
      setIsBusy(false);
      setStatusText('');
    }
  }, [file]);

  const startSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!uploadState.docId) {
      setError('Upload a document before starting a session.');
      return;
    }

    setError(null);
    setIsBusy(true);

    try {
      // Ensure the AI model is downloaded and loaded
      setStatusText('Downloading AI model...');
      setModelProgress(0);
      await ensureModelReady((progress) => {
        setModelProgress(progress);
      });
      setModelProgress(null);
      setStatusText('Loading model into WASM engine...');

      // Create session locally
      const session = sessionStore.createSession(userId, uploadState.docId, pomodoroLength);

      window.localStorage.setItem(
        'clb.activeSession',
        JSON.stringify({
          sessionId: session.id,
          docId: uploadState.docId,
          pomodoroLength,
          chunkCount: uploadState.chunkCount,
        })
      );

      navigate(`/session/${session.id}`);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : 'Session start failed.');
      setModelProgress(null);
    } finally {
      setIsBusy(false);
      setStatusText('');
    }
  };

  return (
    <div className="app-shell">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="float-in glass-panel rounded-[2.5rem] p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-slate-500">
            100% browser-based AI study engine
          </p>
          <h1 className="headline mt-4 text-5xl leading-tight text-slate-900">Cognitive Load Balancer</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            CLB adapts every question locally by blending typing rhythm, facial tension, and response
            latency into a live cognitive-load estimate. Powered by RunAnywhere SDK — all AI runs
            on-device via WebAssembly. No cloud APIs. No data leaves the browser.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.75rem] bg-white/65 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Signal mix</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">50 / 35 / 15</p>
            </div>
            <div className="rounded-[1.75rem] bg-white/65 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Model</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">LFM2 350M</p>
            </div>
            <div className="rounded-[1.75rem] bg-white/65 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Runtime</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">WASM</p>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2.5rem] p-8">
          <form onSubmit={startSession} className="space-y-6">
            <div>
              <label className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                Learner ID
              </label>
              <input
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                className="mt-3 w-full rounded-[1.25rem] border border-white/50 bg-white/85 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                Pomodoro length (minutes)
              </label>
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
              <label className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                Study document (PDF)
              </label>
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
                {isBusy && !modelProgress ? 'Processing...' : 'Upload and Index PDF'}
              </button>
              {uploadState.docId ? (
                <p className="mt-3 text-sm text-emerald-700">
                  Indexed successfully: {uploadState.chunkCount} chunks ready.
                </p>
              ) : null}
            </div>

            {modelProgress !== null ? (
              <div className="rounded-2xl bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-800">
                  Downloading AI model: {Math.round(modelProgress * 100)}%
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-blue-200">
                  <div
                    className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${Math.round(modelProgress * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}

            {statusText && modelProgress === null ? (
              <p className="text-sm text-slate-500">{statusText}</p>
            ) : null}

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
