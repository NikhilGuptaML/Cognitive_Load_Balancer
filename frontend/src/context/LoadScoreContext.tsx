/* This context owns the live load-score state using the local loadAggregator instead of a WebSocket connection. */

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { loadAggregator, type LoadSnapshot } from '../engine/loadAggregator';
import { sessionStore } from '../engine/sessionStore';

type LoadScoreContextValue = {
  score: number;
  band: string;
  signalsActive: string[];
  updatedAt?: string;
};

const LoadScoreContext = createContext<LoadScoreContextValue | undefined>(undefined);

export function LoadScoreProvider({ children, sessionId }: PropsWithChildren<{ sessionId: string }>) {
  const [state, setState] = useState<LoadSnapshot>(loadAggregator.getState());

  useEffect(() => {
    const unsubscribe = loadAggregator.subscribe((snapshot) => {
      setState(snapshot);

      // Persist load event to session store
      sessionStore.recordLoadEvent(sessionId, {
        keystrokeScore: snapshot.subscores.keystroke,
        faceScore: snapshot.subscores.facial,
        latencyScore: snapshot.subscores.latency,
        compositeScore: snapshot.score,
        band: snapshot.band,
        signalsActive: snapshot.signalsActive,
      });
    });

    return unsubscribe;
  }, [sessionId]);

  const value = useMemo(
    () => ({
      score: state.score ?? 0,
      band: state.band ?? 'FLOW',
      signalsActive: state.signalsActive ?? [],
      updatedAt: state.updatedAt,
    }),
    [state]
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
