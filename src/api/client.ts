import type { Agent, Connection, CreateConnectionInput, Workspace, CockpitTemplate, WidgetCatalogItem } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';
export const API_BASE_ORIGIN = /^https?:\/\//i.test(API_BASE)
  ? new URL(API_BASE).origin
  : (typeof window !== 'undefined' ? window.location.origin : '');

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as T;
}

// ─── Health ───
export function getHealth() {
  return fetchJson<{ status: string; timestamp: string; version: string }>('/health');
}

// ─── Agents ───
export function getAgents() {
  return fetchJson<{ agents: Agent[] }>('/agents');
}

export function getAgent(id: string) {
  return fetchJson<{ agent: Agent }>(`/agents/${id}`);
}

export function getAgentStats(id: string) {
  return fetchJson<Record<string, unknown>>(`/agents/${id}/stats`);
}

// ─── Workspaces (Cockpits) ───
export function getWorkspaces() {
  return fetchJson<{ workspaces: Workspace[] }>('/workspaces');
}

export function getWorkspace(id: string) {
  return fetchJson<{ workspace: Workspace }>(`/workspaces/${id}`);
}

export function createWorkspace(data: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  agentIds?: string[];
  primaryAgentId?: string;
  widgets?: Workspace['widgets'];
}) {
  return fetchJson<{ workspace: Workspace }>('/workspaces', { method: 'POST', body: JSON.stringify(data) });
}

export function updateWorkspace(id: string, data: Partial<{ name: string; description: string; widgets: Workspace['widgets'] }>) {
  return fetchJson<{ workspace: Workspace }>(`/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function getWorkspaceOrchestration(id: string) {
  return fetchJson<{ orchestration: Record<string, unknown>; context: Record<string, unknown> }>(`/workspaces/${id}/orchestration`);
}

export function deleteWorkspace(id: string) {
  return fetchJson<{ success: boolean }>(`/workspaces/${id}`, { method: 'DELETE' });
}

// ─── Connections ───
export function getConnections() {
  return fetchJson<{ connections: Connection[] }>('/connections');
}

export function getConnectionAdminStatus() {
  return fetchJson<{ configured: boolean; localFallbackEnabled: boolean; requiresKey: boolean }>('/connections/admin-status');
}

export function createConnection(data: CreateConnectionInput) {
  return adminFetch<{ connection: Connection }>('/connections', { method: 'POST', body: JSON.stringify(data) });
}

export function updateConnection(id: string, data: Partial<CreateConnectionInput>) {
  return adminFetch<{ connection: Connection }>(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteConnection(id: string) {
  return adminFetch<{ success: boolean }>(`/connections/${id}`, { method: 'DELETE' });
}

export function testConnection(id: string) {
  return adminFetch<{ success: boolean; message: string }>(`/connections/${id}/test`, { method: 'POST' });
}

export function testConnectionConfig(data: { type: string; config: Connection['config'] }) {
  return adminFetch<{ success: boolean; message: string }>('/connections/test', { method: 'POST', body: JSON.stringify(data) });
}

export function connectConnection(id: string) {
  return adminFetch<{ success: boolean; connection: Connection }>(`/connections/${id}/connect`, { method: 'POST' });
}

export function disconnectConnection(id: string) {
  return adminFetch<{ success: boolean; connection: Connection }>(`/connections/${id}/disconnect`, { method: 'POST' });
}

// ─── CockpitAgent 智能对话 ───
export interface ChatDoneData {
  message: string;
  card?: Record<string, unknown>;
  suggestedCommands?: string[];
  plan?: Record<string, unknown>;
  results?: Record<string, unknown>[];
  usedLLM?: boolean;
  workspace?: Workspace;
  initializing?: boolean;
  initializationMode?: 'llm' | 'real-data';
}

export interface WorkspaceChatRequestContext {
  history?: Array<{ role: 'user' | 'agent'; content: string }>;
  runtimeWidgetData?: Array<{ widgetId?: string; title?: string; data?: Record<string, unknown> }>;
  viewContext?: {
    activeFilters?: Record<string, unknown>;
    focusedWidget?: Record<string, unknown>;
    drillContext?: Record<string, unknown>;
  };
}

export function cockpitAgentChatStream(
  command: string,
  workspaceId: string | undefined,
  sessionId: string | undefined,
  requestContext: WorkspaceChatRequestContext | undefined,
  onChunk: (chunk: string, stage?: string) => void,
  onDone: (data: ChatDoneData) => void,
  onError: (err: Error) => void
) {
  const body = JSON.stringify({
    command,
    workspaceId,
    sessionId,
    stream: true,
    history: requestContext?.history,
    runtimeWidgetData: requestContext?.runtimeWidgetData,
    viewContext: requestContext?.viewContext,
  });

  fetch(`${API_BASE}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let doneCalled = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const dataStr = trimmed.slice(6).trim();
        if (dataStr === '[DONE]') { doneCalled = true; return; }

        let parsed: unknown;
        try { parsed = JSON.parse(dataStr); } catch { continue; }
        if (parsed && typeof parsed === 'object') {
          const data = parsed as Record<string, unknown>;
          if (data.error) {
            onError(new Error(String(data.error)));
            return;
          }
          if (data.done === true) {
            doneCalled = true;
            onDone({
              message: String(data.message || ''),
              card: data.card as Record<string, unknown> | undefined,
              suggestedCommands: Array.isArray(data.suggestedCommands) ? data.suggestedCommands as string[] : undefined,
              results: Array.isArray(data.results) ? data.results as Record<string, unknown>[] : undefined,
              usedLLM: data.usedLLM as boolean | undefined,
              workspace: data.workspace as Workspace | undefined,
              initializing: data.initializing as boolean | undefined,
              initializationMode: data.initializationMode as 'llm' | 'real-data' | undefined,
            });
          } else if (typeof data.chunk === 'string') {
            onChunk(data.chunk, typeof data.stage === 'string' ? data.stage : undefined);
          }
        }
      }
    }
    if (!doneCalled) {
      onError(new Error('SSE stream ended unexpectedly without completion'));
    }
  }).catch(onError);
}

// ─── Widget Data (Phase 4) ───
export function refreshWidgetData(
  workspaceId: string,
  widgetId: string,
  context?: Record<string, unknown>,
  options?: { persist?: boolean }
) {
  return fetchJson<{ data: unknown; source: string; latency: number }>(
    `/workspaces/${workspaceId}/widgets/${widgetId}/data`,
    { method: 'POST', body: JSON.stringify({ context, persist: options?.persist ?? false }) }
  );
}

export function getWidgetData(workspaceId: string, widgetId: string) {
  return fetchJson<{ data: unknown; source: string; hasDataSource: boolean; dataSourceType: string | null }>(
    `/workspaces/${workspaceId}/widgets/${widgetId}/data`
  );
}

// ─── Templates (Admin) ───
function getAdminKey() {
  try {
    return localStorage.getItem('adminKey') || '';
  } catch {
    return '';
  }
}

function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return fetchJson<T>(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': getAdminKey(),
      ...(options?.headers || {}),
    },
  });
}

export function getTemplates() {
  return fetchJson<{ templates: CockpitTemplate[] }>('/templates');
}

export function getTemplate(id: string) {
  return fetchJson<{ template: CockpitTemplate }>(`/templates/${id}`);
}

export function createCockpitFromTemplate(templateId: string, name?: string, initPrompt?: string) {
  return fetchJson<{ workspace: Workspace; initializing: boolean; initializationMode?: 'llm' | 'real-data' }>(`/templates/${templateId}/create-cockpit`, {
    method: 'POST',
    body: JSON.stringify({ name, initPrompt }),
  });
}

export function createTemplate(data: Partial<CockpitTemplate>) {
  return adminFetch<{ template: CockpitTemplate }>('/templates', { method: 'POST', body: JSON.stringify(data) });
}

export function updateTemplate(id: string, data: Partial<CockpitTemplate>) {
  return adminFetch<{ template: CockpitTemplate }>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteTemplate(id: string) {
  return adminFetch<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' });
}

export function getWidgetCatalog() {
  return fetchJson<{ widgets: WidgetCatalogItem[] }>('/widget-catalog');
}

export function getWidgetCatalogItem(id: string) {
  return fetchJson<{ widget: WidgetCatalogItem }>(`/widget-catalog/${id}`);
}

export function createWidgetCatalogItem(data: Partial<WidgetCatalogItem>) {
  return adminFetch<{ widget: WidgetCatalogItem }>('/widget-catalog', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateWidgetCatalogItem(id: string, data: Partial<WidgetCatalogItem>) {
  return adminFetch<{ widget: WidgetCatalogItem }>(`/widget-catalog/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteWidgetCatalogItem(id: string) {
  return adminFetch<{ success: boolean }>(`/widget-catalog/${id}`, {
    method: 'DELETE',
  });
}

// SSE 流式对话（与驾驶舱主智能体）
export interface WorkspaceChatDoneData {
  message: string;
  card?: Record<string, unknown>;
  suggestedCommands?: string[];
}

export function workspaceCommandStream(
  workspaceId: string,
  command: string,
  agentId: string | undefined,
  sessionId: string | undefined,
  requestContext: WorkspaceChatRequestContext | undefined,
  onChunk: (chunk: string) => void,
  onDone: (data: WorkspaceChatDoneData) => void,
  onError: (err: Error) => void
) {
  const body = JSON.stringify({
    command,
    agentId,
    sessionId,
    history: requestContext?.history,
    runtimeWidgetData: requestContext?.runtimeWidgetData,
    viewContext: requestContext?.viewContext,
  });

  fetch(`${API_BASE}/workspaces/${workspaceId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let doneCalled = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const dataStr = trimmed.slice(6).trim();
        if (dataStr === '[DONE]') { doneCalled = true; return; }

        let parsed: unknown;
        try { parsed = JSON.parse(dataStr); } catch { continue; }
        if (parsed && typeof parsed === 'object') {
          const data = parsed as Record<string, unknown>;
          if (data.error) {
            onError(new Error(String(data.error)));
            return;
          }
          if (data.done === true) {
            doneCalled = true;
            onDone({
              message: String(data.message || ''),
              card: data.card as Record<string, unknown> | undefined,
              suggestedCommands: Array.isArray(data.suggestedCommands) ? data.suggestedCommands as string[] : undefined,
            });
          } else if (typeof data.chunk === 'string') {
            onChunk(data.chunk);
          }
        }
      }
    }
    if (!doneCalled) {
      onError(new Error('SSE stream ended unexpectedly without completion'));
    }
  }).catch(onError);
}
