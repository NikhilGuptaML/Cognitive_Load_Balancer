/* This context owns the live load-score subscription so components can read the current score, band, and active signals without each creating their own WebSocket connection. */

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

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
  const websocketUrl = useMemo(() => `ws://localhost:8000/ws/load/${sessionId}`, [sessionId]);

  const { status, lastMessage } = useWebSocket<LoadPayload>(websocketUrl, {
    enabled: Boolean(sessionId),
    onMessage: (payload) => setState(payload)
  });

  useEffect(() => {
    if (lastMessage) {
      setState(lastMessage);
    }
  }, [lastMessage]);

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
