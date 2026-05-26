// ─── 通用 HTTP 代理适配器 ───
// 通过 REST API 对接任意智能体平台
// 配置项：AGENT_PLATFORM_URL, AGENT_PLATFORM_API_KEY

import type { AgentPlatformAdapter, ChatChunk, ChatResponse } from './types';

export class HttpAdapter implements AgentPlatformAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(options?.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json() as T;
  }

  async getAgents(): Promise<any[]> {
    return this.fetchJson<{ agents: any[] }>('/agents').then((r) => r.agents);
  }

  async getAgent(id: string): Promise<any> {
    return this.fetchJson<{ agent: any }>(`/agents/${id}`).then((r) => r.agent);
  }

  async getAgentStats(id: string): Promise<any> {
    return this.fetchJson<any>(`/agents/${id}/stats`);
  }

  async getWorkspaces(): Promise<any[]> {
    return this.fetchJson<{ workspaces: any[] }>('/workspaces').then((r) => r.workspaces);
  }

  async getWorkspace(id: string): Promise<any> {
    return this.fetchJson<{ workspace: any }>(`/workspaces/${id}`).then((r) => r.workspace);
  }

  async chat(workspaceId: string, command: string, agentId?: string, sessionId?: string): Promise<ChatResponse> {
    return this.fetchJson<ChatResponse>(`/workspaces/${workspaceId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ command, agentId, sessionId }),
    });
  }

  async *chatStream(
    workspaceId: string,
    command: string,
    agentId?: string,
    sessionId?: string
  ): AsyncGenerator<ChatChunk, ChatResponse, unknown> {
    const res = await fetch(`${this.baseUrl}/workspaces/${workspaceId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ command, agentId, sessionId, stream: true }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let finalResponse: ChatResponse | null = null;

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
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          if (data.done) {
            finalResponse = {
              message: data.message,
              card: data.card,
              suggestedCommands: data.suggestedCommands,
              sessionId: data.sessionId,
            };
          } else {
            yield { chunk: data.chunk, done: false };
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (!finalResponse) throw new Error('Stream ended without final response');
    return finalResponse;
  }
}
