/* This hook wraps browser WebSocket behavior with reconnection and message parsing so the rest of the frontend can consume the live load stream as regular React state. */

import { useEffect, useRef, useState } from 'react';

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface UseWebSocketOptions<T> {
  enabled?: boolean;
  onMessage?: (payload: T) => void;
}

export function useWebSocket<T>(url: string | null, options: UseWebSocketOptions<T> = {}) {
  const { enabled = true, onMessage } = options;
  const reconnectDelayRef = useRef(1000);
  const timeoutRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<SocketStatus>('idle');
  const [lastMessage, setLastMessage] = useState<T | null>(null);

  useEffect(() => {
    if (!enabled || !url) {
      return undefined;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      setStatus('connecting');
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectDelayRef.current = 1000;
        setStatus('open');
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as T;
          setLastMessage(payload);
          onMessage?.(payload);
        } catch {
          setStatus('error');
        }
      };

      socket.onerror = () => {
        setStatus('error');
      };

      socket.onclose = () => {
        setStatus('closed');
        if (disposed) {
          return;
        }
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
        timeoutRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      socketRef.current?.close();
    };
  }, [enabled, onMessage, url]);

  return { status, lastMessage };
}
