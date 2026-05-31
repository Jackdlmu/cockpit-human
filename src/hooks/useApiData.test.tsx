import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { useAgents, useAgentDetail, useWorkspaces, useWorkspaceDetail } from './useApiData';

// MSW lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// import.meta.env.VITE_API_BASE is defined in vitest.config.ts define

describe('useAgents', () => {
  it('fetches agents on mount and returns data', async () => {
    const { result } = renderHook(() => useAgents());

    // 初始状态
    expect(result.current.loading).toBe(true);
    expect(result.current.agents).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.agents).toHaveLength(2);
    expect(result.current.agents[0].name).toBe('Alpha');
    expect(result.current.error).toBeNull();
  });

  it('refresh re-fetches agents', async () => {
    const { result } = renderHook(() => useAgents());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agents).toHaveLength(2);

    // 可以再次调用 refresh
    await result.current.refresh();
    expect(result.current.agents).toHaveLength(2);
  });
});

describe('useAgentDetail', () => {
  it('fetches agent detail when id is provided', async () => {
    const { result } = renderHook(() => useAgentDetail('agent-1'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.agent).not.toBeNull();
    expect(result.current.agent?.id).toBe('agent-1');
    expect(result.current.stats).not.toBeNull();
  });

  it('returns null when id is null', async () => {
    const { result } = renderHook(() => useAgentDetail(null));

    expect(result.current.agent).toBeNull();
    expect(result.current.stats).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useWorkspaces', () => {
  it('fetches workspaces on mount', async () => {
    const { result } = renderHook(() => useWorkspaces());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.workspaces[0].name).toBe('Test Cockpit');
  });

  it('sorts workspaces by created time descending', async () => {
    server.use(
      http.get('http://localhost:3001/api/workspaces', () => HttpResponse.json({
        workspaces: [
          { id: 'ws-old', name: '旧驾驶舱', createdAt: '2026-05-28T10:00:00.000Z', status: 'running', agentIds: [], widgets: [] },
          { id: 'ws-new', name: '新驾驶舱', createdAt: '2026-05-31T10:00:00.000Z', status: 'running', agentIds: [], widgets: [] },
          { id: 'ws-mid', name: '中间驾驶舱', createdAt: '2026-05-30T10:00:00.000Z', status: 'running', agentIds: [], widgets: [] },
        ],
      }))
    );
    const { result } = renderHook(() => useWorkspaces());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workspaces.map((workspace) => workspace.id)).toEqual(['ws-new', 'ws-mid', 'ws-old']);
  });
});

describe('useWorkspaceDetail', () => {
  it('fetches workspace detail when id is provided', async () => {
    const { result } = renderHook(() => useWorkspaceDetail('ws-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workspace).not.toBeNull();
    expect(result.current.workspace?.id).toBe('ws-1');
  });

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useWorkspaceDetail(null));

    expect(result.current.workspace).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
