// ─── useEventStream ───
// WebSocket 客户端：连接 /api/events，接收实时事件

import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = (() => {
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';
  return base.replace(/^http/, 'ws').replace('/api', '/api/events');
})();

export interface StreamEvent {
  id: string;
  type: string;
  source: string;
  sourceType: string;
  payload: Record<string, unknown>;
  timestamp: string;
  /** 历史事件标记（重连后拉取的历史记录，不应触发 toast） */
  _isHistory?: boolean;
}

export function useEventStream() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
        // 请求历史事件
        ws.send(JSON.stringify({ action: 'history' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'history') {
            const historyEvents = (data.payload?.events || []).map((e: Record<string, unknown>) =>({
              id: e.id || `evt-${Date.now()}`,
              type: e.type || 'unknown',
              source: e.source || 'unknown',
              sourceType: e.sourceType || 'unknown',
              payload: e.payload || {},
              timestamp: e.timestamp || new Date().toISOString(),
              _isHistory: true,
            }));
            setEvents((prev) => [...historyEvents, ...prev].slice(-200));
          } else if (data.type === 'system') {
            // 系统消息，可选处理
          } else if (data.type === 'pong') {
            // 心跳响应
          } else {
            setEvents((prev) =>
              [...prev, {
                id: data.id || `evt-${Date.now()}`,
                type: data.type || 'unknown',
                source: data.source || 'unknown',
                sourceType: data.sourceType || 'unknown',
                payload: data.payload || {},
                timestamp: data.timestamp || new Date().toISOString(),
              }].slice(-200)
            );
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // 自动重连
        reconnectAttempts.current++;
        if (reconnectAttempts.current <= 5) {
          const delay = Math.min(3000 * reconnectAttempts.current, 15000);
          reconnectTimer.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        setError('WebSocket 连接错误');
      };
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '连接失败');
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }
    reconnectAttempts.current = 999; // 阻止自动重连
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, []);

  const subscribe = useCallback((filter?: { source?: string; sourceType?: string; type?: string }) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe', filter }));
    }
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // 心跳
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [connected]);

  return {
    events,
    connected,
    error,
    connect,
    disconnect,
    subscribe,
    clearEvents,
  };
}
