// ─── YonCockpit API Client ───
// 封装所有后端 API 调用，统一错误处理和类型转换

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
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
  return fetchJson<{ agents: any[] }>('/agents');
}

export function getAgent(id: string) {
  return fetchJson<{ agent: any }>(`/agents/${id}`);
}

export function getAgentStats(id: string) {
  return fetchJson<any>(`/agents/${id}/stats`);
}

// ─── Workspaces (Cockpits) ───
export function getWorkspaces() {
  return fetchJson<{ workspaces: any[] }>('/workspaces');
}

export function getWorkspace(id: string) {
  return fetchJson<{ workspace: any }>(`/workspaces/${id}`);
}

export function createWorkspace(data: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  agentIds?: string[];
  primaryAgentId?: string;
  widgets?: any[];
}) {
  return fetchJson<{ workspace: any }>('/workspaces', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteWorkspace(id: string) {
  return fetchJson<{ success: boolean }>(`/workspaces/${id}`, { method: 'DELETE' });
}

// ─── Connections ───
export function getConnections() {
  return fetchJson<{ connections: any[] }>('/connections');
}

export function createConnection(data: { name: string; type: string; config: any; capabilities?: string[]; priority?: number; enabled?: boolean }) {
  return fetchJson<{ connection: any }>('/connections', { method: 'POST', body: JSON.stringify(data) });
}

export function updateConnection(id: string, data: Partial<{ name: string; config: any; capabilities: string[]; priority: number; enabled: boolean }>) {
  return fetchJson<{ connection: any }>(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteConnection(id: string) {
  return fetchJson<{ success: boolean }>(`/connections/${id}`, { method: 'DELETE' });
}

export function testConnection(id: string) {
  return fetchJson<{ success: boolean; message: string }>(`/connections/${id}/test`, { method: 'POST' });
}

export function testConnectionConfig(data: { type: string; config: any }) {
  return fetchJson<{ success: boolean; message: string }>('/connections/test', { method: 'POST', body: JSON.stringify(data) });
}

export function connectConnection(id: string) {
  return fetchJson<{ success: boolean; connection: any }>(`/connections/${id}/connect`, { method: 'POST' });
}

export function disconnectConnection(id: string) {
  return fetchJson<{ success: boolean; connection: any }>(`/connections/${id}/disconnect`, { method: 'POST' });
}

// ─── CockpitAgent 智能对话 ───
export function cockpitAgentChatStream(
  command: string,
  workspaceId: string | undefined,
  sessionId: string | undefined,
  onChunk: (chunk: string, stage?: string) => void,
  onDone: (data: { message: string; card?: any; suggestedCommands?: string[]; plan?: any; results?: any[]; usedLLM?: boolean }) => void,
  onError: (err: Error) => void
) {
  const body = JSON.stringify({ command, workspaceId, sessionId, stream: true });

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
        if (dataStr === '[DONE]') return;

        try {
          const data = JSON.parse(dataStr);
          if (data.error) throw new Error(data.error);
          if (data.done) {
            onDone({
              message: data.message,
              card: data.card,
              suggestedCommands: data.suggestedCommands,
              results: data.results,
              usedLLM: data.usedLLM,
            });
          } else {
            onChunk(data.chunk, data.stage);
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }).catch(onError);
}

// ─── Widget Data (Phase 4) ───
export function refreshWidgetData(workspaceId: string, widgetId: string, context?: Record<string, unknown>) {
  return fetchJson<{ data: unknown; source: string; latency: number }>(
    `/workspaces/${workspaceId}/widgets/${widgetId}/data`,
    { method: 'POST', body: JSON.stringify({ context }) }
  );
}

export function getWidgetData(workspaceId: string, widgetId: string) {
  return fetchJson<{ data: unknown; source: string; hasDataSource: boolean; dataSourceType: string | null }>(
    `/workspaces/${workspaceId}/widgets/${widgetId}/data`
  );
}

// ─── Templates (Admin) ───
const ADMIN_KEY = localStorage.getItem('adminKey') || '';

function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return fetchJson<T>(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_KEY,
      ...(options?.headers || {}),
    },
  });
}

export function getTemplates() {
  return fetchJson<{ templates: any[] }>('/templates');
}

export function getTemplate(id: string) {
  return fetchJson<{ template: any }>(`/templates/${id}`);
}

export function createCockpitFromTemplate(templateId: string, name?: string, initPrompt?: string) {
  return fetchJson<{ workspace: any; initializing: boolean }>(`/templates/${templateId}/create-cockpit`, {
    method: 'POST',
    body: JSON.stringify({ name, initPrompt }),
  });
}

export function createTemplate(data: any) {
  return adminFetch<{ template: any }>('/templates', { method: 'POST', body: JSON.stringify(data) });
}

export function updateTemplate(id: string, data: any) {
  return adminFetch<{ template: any }>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteTemplate(id: string) {
  return adminFetch<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' });
}

// SSE 流式对话（与驾驶舱主智能体）
export function workspaceCommandStream(
  workspaceId: string,
  command: string,
  agentId: string | undefined,
  sessionId: string | undefined,
  onChunk: (chunk: string) => void,
  onDone: (data: { message: string; card?: any; suggestedCommands?: string[] }) => void,
  onError: (err: Error) => void
) {
  const body = JSON.stringify({ command, agentId, sessionId });

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
        if (dataStr === '[DONE]') return;

        try {
          const data = JSON.parse(dataStr);
          if (data.done) {
            onDone({
              message: data.message,
              card: data.card,
              suggestedCommands: data.suggestedCommands,
            });
          } else {
            onChunk(data.chunk);
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }).catch(onError);
}
