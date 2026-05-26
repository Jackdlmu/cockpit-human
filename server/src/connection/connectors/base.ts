// ─── Connector 抽象基类 ───
// 提供通用 HTTP 请求、错误处理、重试等能力

import type { Connection, Connector, ConnectionType, ChatMessage, LLMOptions, AgentInvokeInput, AgentInvokeResult, CockpitPlanRequest, CockpitPlanResult, CockpitSpec, PlatformEvent } from '../types';

export abstract class BaseConnector implements Connector {
  readonly connectionId: string;
  readonly type: ConnectionType;

  protected connection: Connection;
  protected abortController?: AbortController;

  constructor(connection: Connection) {
    this.connection = connection;
    this.connectionId = connection.id;
    this.type = connection.type;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }>;

  // ── 通用 HTTP 工具 ──

  protected async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const timeout = (this.connection.config as any).timeout ?? 30000;
    this.abortController = new AbortController();
    const timer = setTimeout(() => this.abortController?.abort(), timeout);

    try {
      const res = await fetch(url, {
        ...options,
        signal: this.abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.getAuthHeader()),
          ...(options?.headers || {}),
        },
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = BaseConnector.extractErrorMessage(errBody, res.status);
        throw new Error(errMsg);
      }
      return res.json() as T;
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('Request timeout');
      throw err;
    }
  }

  /** 从 API 错误响应中提取可读的错误信息 */
  private static extractErrorMessage(body: any, status: number): string {
    if (typeof body?.error === 'string') return body.error;
    if (typeof body?.error?.message === 'string') return body.error.message;
    if (typeof body?.message === 'string') return body.message;
    if (typeof body?.error?.type === 'string') return `${body.error.type} (HTTP ${status})`;
    return `HTTP ${status}`;
  }

  protected async *fetchStream(url: string, body: unknown): AsyncGenerator<string> {
    const timeout = (this.connection.config as any).timeout ?? 30000;
    this.abortController = new AbortController();
    const timer = setTimeout(() => this.abortController?.abort(), timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.getAuthHeader()),
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
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
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') return;
          try {
            const data = JSON.parse(dataStr);
            if (data.chunk) yield data.chunk;
            else if (data.choices?.[0]?.delta?.content) yield data.choices[0].delta.content;
            else if (data.content) yield data.content;
          } catch {
            // 非 JSON 直接输出
            yield dataStr;
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('Request timeout');
      throw err;
    }
  }

  protected getAuthHeader(): Record<string, string> {
    const apiKey = (this.connection.config as any).apiKey;
    return apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};
  }

  protected getEndpoint(): string {
    let ep = (this.connection.config as any).endpoint || '';
    ep = ep.replace(/\/$/, '');
    // 自动将 WebSocket 协议转换为 HTTP，供 fetch 使用
    if (ep.startsWith('wss://')) return ep.replace('wss://', 'https://');
    if (ep.startsWith('ws://')) return ep.replace('ws://', 'http://');
    return ep;
  }

  // ── 可选能力默认抛出未实现 ──

  async listAgents?(): Promise<Array<Record<string, unknown>>> {
    throw new Error('listAgents not implemented');
  }

  async getAgent?(id: string): Promise<Record<string, unknown>> {
    throw new Error('getAgent not implemented');
  }

  async invokeAgent?(input: AgentInvokeInput): Promise<AgentInvokeResult> {
    throw new Error('invokeAgent not implemented');
  }

  async *streamAgent?(input: AgentInvokeInput): AsyncGenerator<string, AgentInvokeResult> {
    throw new Error('streamAgent not implemented');
    return { message: '' };
  }

  async chat?(messages: ChatMessage[], options?: LLMOptions): Promise<string> {
    throw new Error('chat not implemented');
  }

  async *streamChat?(messages: ChatMessage[], options?: LLMOptions): AsyncGenerator<string> {
    throw new Error('streamChat not implemented');
  }

  async planCockpit?(request: CockpitPlanRequest): Promise<CockpitPlanResult> {
    throw new Error('planCockpit not implemented');
  }

  async createCockpit?(spec: CockpitSpec): Promise<Record<string, unknown>> {
    throw new Error('createCockpit not implemented');
  }

  async executeOnCockpit?(workspaceId: string, command: string, params?: Record<string, unknown>): Promise<unknown> {
    throw new Error('executeOnCockpit not implemented');
  }

  async subscribeEvents?(handler: (event: PlatformEvent) => void): Promise<() => void> {
    throw new Error('subscribeEvents not implemented');
  }
}
