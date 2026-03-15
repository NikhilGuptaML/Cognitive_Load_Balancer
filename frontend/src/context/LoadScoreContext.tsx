/* This context owns the live load-score subscription so components can read the current score, band, and active signals without each creating their own WebSocket connection. */

import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { useWebSocket } from '../hooks/useWebSocket';

type LoadPayload = {
  score: number;
  band: string;
  signalsActive: string[];
  updatedAt?: string;
};

type LoadScoreContextValue = {
  score: number;
  band: string;
  signalsActive: string[];
  updatedAt?: string;
  socketStatus: string;
};

const LoadScoreContext = createContext<LoadScoreContextValue | undefined>(undefined);

export function LoadScoreProvider({ children, sessionId }: PropsWithChildren<{ sessionId: string }>) {
  const [state, setState] = useState<LoadPayload>({ score: 0, band: 'FLOW', signalsActive: [] });
  const websocketUrl = useMemo(() => {
    // FIXED: Build websocket URL from runtime host/protocol so non-localhost demos work.
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const backendHost = `${window.location.hostname}:8000`;
    return `${protocol}://${backendHost}/ws/load/${sessionId}`;
  }, [sessionId]);

  const { status, lastMessage } = useWebSocket<LoadPayload>(websocketUrl, {
    enabled: Boolean(sessionId),
    onMessage: (payload) => setState(payload)
  });

  // FIXED: Removed redundant useEffect on lastMessage — onMessage callback handles updates.

  const value = useMemo(
    () => ({
      score: state.score ?? 0,
      band: state.band ?? 'FLOW',
      signalsActive: state.signalsActive ?? [],
      updatedAt: state.updatedAt,
      socketStatus: status
    }),
    [state, status]
  );

  return <LoadScoreContext.Provider value={value}>{children}</LoadScoreContext.Provider>;
}

export function useLoadScore() {
  const context = useContext(LoadScoreContext);
  if (!context) {
    throw new Error('useLoadScore must be used inside LoadScoreProvider');
  }
  return context;
}
