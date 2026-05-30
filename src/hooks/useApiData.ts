// ─── 统一 API 数据获取 Hooks ───
import { useState, useEffect, useCallback, useMemo } from 'react';
import * as api from '@/api/client';
import type { Agent, Workspace } from '@/types';
import { normalizeWidgets } from '@/lib/widget-normalizer';

function normalizeWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    widgets: normalizeWidgets(workspace.widgets),
  };
}

// ─── useAgents ───
export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAgents();
      setAgents(data.agents);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return useMemo(() => ({ agents, loading, error, refresh }), [agents, loading, error, refresh]);
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getWorkspaces();
      setWorkspaces(data.workspaces.map(normalizeWorkspace));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return useMemo(() => ({ workspaces, loading, error, refresh }), [workspaces, loading, error, refresh]);
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
