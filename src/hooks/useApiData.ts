// ─── 统一 API 数据获取 Hooks ───
// 增强：自动重试、超时保护、错误分类

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as api from '@/api/client';
import type { Agent, Workspace } from '@/types';
import { normalizeWidgets } from '@/lib/widget-normalizer';

function normalizeWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    widgets: normalizeWidgets(workspace.widgets),
  };
}

function getWorkspaceCreatedTime(workspace: Workspace): number {
  const time = new Date(workspace.createdAt || '').getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortWorkspacesByCreatedDesc(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    const createdDelta = getWorkspaceCreatedTime(b) - getWorkspaceCreatedTime(a);
    if (createdDelta !== 0) return createdDelta;
    return String(b.id).localeCompare(String(a.id));
  });
}

/** 带重试的 fetch 包装器 */
async function fetchWithRetry<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: {
    retries?: number;
    retryDelay?: number;
    timeout?: number;
  } = {},
): Promise<T> {
  const { retries = 2, retryDelay = 1500, timeout = 15000 } = options;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const result = await fetcher(controller.signal);
      clearTimeout(timer);
      return result;
    } catch (err: unknown) {
      clearTimeout(timer);
      lastErr = err;
      const isRetryable =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.message.includes('fetch') ||
          err.message.includes('network') ||
          err.message.includes('ECONNREFUSED') ||
          err.message.includes('Failed to fetch'));
      if (!isRetryable || attempt >= retries) break;
      await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
    }
  }
  throw lastErr;
}

function classifyError(err: unknown): { message: string; isOffline: boolean } {
  const msg = err instanceof Error ? err.message : String(err);
  const isOffline =
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Failed to fetch') ||
    msg.includes('AbortError');
  return {
    message: isOffline ? '无法连接到服务端，请检查服务是否启动' : msg,
    isOffline,
  };
}

// ─── useAgents ───
export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsOffline(false);
    try {
      const data = await fetchWithRetry(
        (signal) => api.getAgents(signal),
        { retries: 2, retryDelay: 1500, timeout: 15000 },
      );
      if (!mountedRef.current) return;
      setAgents(data.agents);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const classified = classifyError(err);
      setError(classified.message);
      setIsOffline(classified.isOffline);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  return useMemo(
    () => ({ agents, loading, error, isOffline, refresh }),
    [agents, loading, error, isOffline, refresh],
  );
}

// ─── useAgentDetail ───
export function useAgentDetail(id: string | null) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setAgent(null); setStats(null); return; }
    setLoading(true);
    setError(null);
    Promise.all([
      api.getAgent(id),
      api.getAgentStats(id).catch(() => null),
    ])
      .then(([agentRes, statsRes]) => {
        setAgent(agentRes.agent);
        setStats(statsRes);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  return useMemo(() => ({ agent, stats, loading, error }), [agent, stats, loading, error]);
}

// ─── useWorkspaces ───
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsOffline(false);
    try {
      const data = await fetchWithRetry(
        (signal) => api.getWorkspaces(signal),
        { retries: 2, retryDelay: 1500, timeout: 15000 },
      );
      if (!mountedRef.current) return;
      setWorkspaces(sortWorkspacesByCreatedDesc(data.workspaces.map(normalizeWorkspace)));
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const classified = classifyError(err);
      setError(classified.message);
      setIsOffline(classified.isOffline);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  return useMemo(
    () => ({ workspaces, loading, error, isOffline, refresh }),
    [workspaces, loading, error, isOffline, refresh],
  );
}

// ─── useWorkspaceDetail ───
export function useWorkspaceDetail(id: string | null) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!id) { setWorkspace(null); return; }
    setLoading(true);
    setError(null);
    api.getWorkspace(id)
      .then((data) => setWorkspace(normalizeWorkspace(data.workspace)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return useMemo(() => ({ workspace, loading, error, refresh }), [workspace, loading, error, refresh]);
}
