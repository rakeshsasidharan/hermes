'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { WebSocketManager, type WsNewMessageEvent } from '@/lib/ws';

type Handler = (event: WsNewMessageEvent) => void;

interface WsContextValue {
  subscribe: (handler: Handler) => () => void;
}

const WsContext = createContext<WsContextValue | null>(null);

export function useWs() {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error('useWs must be used within WebSocketProvider');
  return ctx;
}

interface WebSocketProviderProps {
  children: ReactNode;
  token: string;
  wsEndpoint: string;
}

export function WebSocketProvider({ children, token, wsEndpoint }: WebSocketProviderProps) {
  const handlersRef = useRef<Set<Handler>>(new Set());

  useEffect(() => {
    if (!token || !wsEndpoint) return;

    const getToken = async () => {
      try {
        const res = await fetch('/api/auth/token');
        if (res.ok) {
          const data = await res.json() as { token: string };
          return data.token;
        }
      } catch {
        // fall through to initial token on network error
      }
      return token;
    };

    const manager = new WebSocketManager(wsEndpoint, getToken, (event) => {
      handlersRef.current.forEach((h) => h(event));
    });
    manager.connect();

    return () => manager.disconnect();
  }, [token, wsEndpoint]);

  const subscribe = useCallback((handler: Handler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return <WsContext.Provider value={{ subscribe }}>{children}</WsContext.Provider>;
}
