// ─── OpenClaw Connector ───
// 对接 OpenClaw（开源智能体框架）
// 特性：智能体注册、工具调用（Tool Calling）、记忆管理
// 支持 WebSocket（/__openclaw__/ws）和 HTTP 双协议

import { BaseConnector } from './base';
import type { Connection, ChatMessage, AgentInvokeInput, AgentInvokeResult, CockpitPlanRequest, CockpitPlanResult, CockpitSpec, PlatformEvent } from '../types';

interface OpenClawAgent {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'idle' | 'error';
  tools: string[];
  memory_enabled: boolean;
}

interface OpenClawTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** OpenClaw WebSocket 消息格式 */
interface WSMessage {
  id: string;
  type: 'chat' | 'plan' | 'create' | 'invoke' | 'list_agents' | 'tool_call' | 'event' | 'ping' | 'pong';
  payload: Record<string, unknown>;
}

export class OpenClawConnector extends BaseConnector {
  private ws: WebSocket | null = null;
  private wsConnected = false;
  private wsConnecting = false;
  private wsMessageId = 0;
  private wsPending = new Map<string, { resolve: (val: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
  private wsReconnectTimer?: NodeJS.Timeout;
  private wsPingTimer?: NodeJS.Timeout;
  private wsReconnectAttempts = 0;
  private readonly wsMaxReconnectAttempts = 5;
  private readonly wsReconnectDelay = 3000;
  private wsUnsupported = false; // 标记服务器是否不支持 WebSocket

  constructor(connection: Connection) {
    if (connection.type !== 'openclaw') {
      throw new Error(`OpenClawConnector requires type 'openclaw', got '${connection.type}'`);
    }
    super(connection);
  }

  // ── WebSocket 连接 ──

  private getWsUrl(): string {
    let ep = (this.connection.config as any).endpoint || '';
    ep = ep.replace(/\/$/, '');
    // 确保是 wss:// 前缀
    if (ep.startsWith('https://')) ep = ep.replace('https://', 'wss://');
    if (ep.startsWith('http://')) ep = ep.replace('http://', 'ws://');
    if (!ep.startsWith('ws')) ep = 'wss://' + ep;
    // 如果 endpoint 已包含 /ws 或 /__openclaw__，保持原样；否则优先尝试标准 OpenClaw Gateway 根路径
    if (ep.includes('/ws') || ep.includes('/__openclaw__')) return ep;
    return ep; // 标准 OpenClaw Gateway 使用根路径
  }

  async connectWS(): Promise<void> {
    if (this.wsUnsupported) throw new Error('WebSocket not supported by server');
    if (this.wsConnected && this.ws) return;
    if (this.wsConnecting) {
      // 等待当前连接完成
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (this.wsConnected) { clearInterval(check); resolve(); }
          else if (!this.wsConnecting) { clearInterval(check); reject(new Error('WS connect failed')); }
        }, 100);
        setTimeout(() => { clearInterval(check); reject(new Error('WS connect wait timeout')); }, 15000);
      });
    }

    this.wsConnecting = true;
    this.wsReconnectAttempts++;

    let wsUrl = this.getWsUrl();
    const token = this.getAuthToken();
    // 认证通过 URL query param 传递（避免 subprotocol 不被服务器接受）
    if (token) {
      wsUrl += (wsUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`[OpenClaw] Connecting WebSocket: ${wsUrl.replace(/token=[^&]+/, 'token=***')}`);
        const WS = (globalThis as any).WebSocket;
        if (!WS) {
          this.wsConnecting = false;
          reject(new Error('WebSocket not available in this environment'));
          return;
        }

        this.ws = new WS(wsUrl);
        let openConfirmed = false;
        let connectErrored = false;

        const timeout = setTimeout(() => {
          if (!openConfirmed) {
            this.wsConnecting = false;
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

        // 给服务器一点时间确认连接稳定（某些服务器在收到不期望的消息后会立即断开）
        const confirmTimer = setTimeout(() => {
          if (openConfirmed) {
            this.wsConnecting = false;
            this.wsConnected = true;
            this.wsReconnectAttempts = 0;
            this.startWsHeartbeat();
            resolve();
          }
        }, 500);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          openConfirmed = true;
          console.log('[OpenClaw] WebSocket connected');
          // 发送 OpenClaw Gateway 标准的 connect handshake
          const token = this.getAuthToken();
          const connectMsg = {
            type: 'req',
            id: `connect-${Date.now()}`,
            method: 'connect',
            params: {
              minProtocol: 4,
              maxProtocol: 4,
              client: { id: 'yoncockpit', version: '1.0.0', platform: 'web', mode: 'operator' },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              caps: [],
              commands: [],
              permissions: {},
              auth: token ? { token } : {},
              locale: 'zh-CN',
              userAgent: 'yoncockpit/1.0.0',
            },
          };
          try {
            this.ws!.send(JSON.stringify(connectMsg));
          } catch {
            // 如果发送失败，让 onclose 处理
          }
        };

        this.ws.onmessage = (event: any) => {
          this.handleWsMessage(event.data);
        };

        this.ws.onclose = () => {
          this.wsConnected = false;
          this.wsConnecting = false;
          clearTimeout(confirmTimer);
          console.log('[OpenClaw] WebSocket closed');
          this.stopWsHeartbeat();
          // 如果还没 resolve，说明连接失败
          if (!openConfirmed) {
            reject(new Error('WebSocket closed before confirmed'));
          } else if (!connectErrored && !this.wsUnsupported) {
            // 只有正常关闭（非错误）且服务器支持 WS 时才重连
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (err: any) => {
          connectErrored = true;
          clearTimeout(timeout);
          clearTimeout(confirmTimer);
          this.wsConnecting = false;
          if (err.message?.includes('Invalid status code')) {
            this.wsUnsupported = true;
          }
          reject(new Error(`WebSocket error: ${err.message || 'Unknown'}`));
        };
      } catch (err: any) {
        this.wsConnecting = false;
        reject(err);
      }
    });
  }

  private startWsHeartbeat(): void {
    this.stopWsHeartbeat();
    // 每 20 秒发送一次 ping（如果服务器支持）
    this.wsPingTimer = setInterval(() => {
      if (this.ws && this.wsConnected) {
        try {
          // 发送空消息或 Coze 可能接受的 ping 格式
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          this.wsConnected = false;
        }
      }
    }, 20000);
  }

  private stopWsHeartbeat(): void {
    if (this.wsPingTimer) {
      clearInterval(this.wsPingTimer);
      this.wsPingTimer = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.wsReconnectAttempts >= this.wsMaxReconnectAttempts) {
      console.warn('[OpenClaw] Max reconnect attempts reached');
      return;
    }
    if (this.wsReconnectTimer) return; // 已有重连计划
    const delay = this.wsReconnectDelay * Math.min(this.wsReconnectAttempts, 3);
    console.log(`[OpenClaw] Reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts})`);
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = undefined;
      this.connectWS().catch(() => { /* ignore */ });
    }, delay);
  }

  private handleWsMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as any;
      // OpenClaw Gateway connect 响应
      if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
        console.log('[OpenClaw] Gateway handshake OK, protocol v' + msg.payload.protocol);
        return;
      }
      // OpenClaw Gateway 事件推送
      if (msg.type === 'event') {
        // TODO: 处理事件推送（heartbeat, chat 等）
        return;
      }
      // 匹配 pending RPC 请求
      const pending = this.wsPending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.wsPending.delete(msg.id);
        if (msg.ok === false) {
          pending.reject(new Error(msg.error?.message || 'Gateway RPC error'));
        } else {
          pending.resolve(msg.payload || msg.result || {});
        }
      }
    } catch {
      // 非 JSON 消息，忽略
    }
  }

  private async wsSend(type: WSMessage['type'], payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.wsConnected || !this.ws) {
      await this.connectWS();
    }
    const id = `msg-${++this.wsMessageId}-${Date.now()}`;
    const msg: WSMessage = { id, type, payload };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.wsPending.delete(id);
        reject(new Error('WebSocket request timeout'));
      }, 30000);

      this.wsPending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(msg));
    });
  }

  // ── 生命周期 ──

  async connect(): Promise<void> {
    // 优先尝试 WebSocket 连接
    try {
      await this.connectWS();
      return;
    } catch (err: any) {
      console.warn('[OpenClaw] WebSocket connect failed:', err.message, '→ trying HTTP health check');
    }

    // Fallback: HTTP health check
    const result = await this.healthCheck();
    if (!result.healthy) {
      throw new Error(`OpenClaw connection failed: ${result.error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.wsConnected = false;
    this.stopWsHeartbeat();
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = undefined;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.abortController?.abort();
  }

  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const start = Date.now();

    // 优先尝试 WebSocket 连接 + OpenClaw handshake（仅在未标记不支持时）
    if (!this.wsUnsupported) {
      try {
        await this.connectWS();
        // 等待 handshake 响应（如果服务器发送的话）
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Handshake timeout')), 5000);
          const check = setInterval(() => {
            if (this.wsConnected) { clearTimeout(timer); clearInterval(check); resolve(undefined); }
          }, 100);
        });
        const latency = Date.now() - start;
        return { healthy: true, latency };
      } catch (wsErr: any) {
        console.warn('[OpenClaw] WS health check failed:', wsErr.message);
      }
    }

    // Fallback: HTTP 探测
    try {
      const ep = this.getEndpoint();
      const probeUrls = [`${ep}/health`, `${ep}/`, `${ep}/__openclaw__/ws`];
      for (const url of probeUrls) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers: { ...(this.getAuthHeader()), 'Accept': '*/*' },
            signal: AbortSignal.timeout(5000),
          });
          const latency = Date.now() - start;
          // 200 或 401（端点存在但未授权）都算可用
          if (res.ok || res.status === 401 || res.status === 404) {
            console.log(`[OpenClaw] HTTP probe ${url}: ${res.status} (${latency}ms)`);
            return { healthy: true, latency };
          }
        } catch {
          // 继续探测下一个
        }
      }
      return { healthy: false, latency: Date.now() - start, error: 'All probe endpoints failed' };
    } catch (err: any) {
      return { healthy: false, latency: Date.now() - start, error: err.message };
    }
  }

  // ── 认证 ──

  private getAuthToken(): string {
    const config = this.connection.config as any;
    return config.apiKey || config.token || config.pat || '';
  }

  protected getAuthHeader(): Record<string, string> {
    const config = this.connection.config as any;
    const token = config.apiKey || config.token || config.pat || '';
    if (!token) return {};

    // 支持多种认证方式
    const authType = config.authType || 'bearer';
    switch (authType) {
      case 'pat':
        return { 'X-PAT-Token': token };
      case 'coze':
        return { 'Authorization': `Bearer ${token}` };
      case 'query':
        return {}; // token 通过 URL param 传递
      default:
        return { 'Authorization': `Bearer ${token}` };
    }
  }

  // ── 安全 HTTP 工具 ──

  /** 安全的 JSON fetch：如果返回 HTML 或非 JSON，返回 null 而不是抛出 */
  private async safeFetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
    try {
      return await this.fetchJson<T>(url, options);
    } catch (err: any) {
      if (err.message?.includes('Unexpected token') || err.message?.includes('is not valid JSON')) {
        console.warn(`[OpenClaw] Endpoint returned HTML instead of JSON: ${url}`);
        return null;
      }
      throw err;
    }
  }

  // ── 大模型能力（支持 Tool Calling）─

  async chat(messages: ChatMessage[], options?: any): Promise<string> {
    // 优先使用 WebSocket
    if (this.wsConnected) {
      try {
        const res = await this.wsSend('chat', { messages, options });
        return (res.message as string) || '';
      } catch (err: any) {
        console.warn('[OpenClaw] WS chat failed:', err.message, '→ fallback to HTTP');
      }
    }

    // Fallback HTTP
    const ep = this.getEndpoint();
    const res = await this.safeFetchJson<{ message: string; tool_calls?: any[] }>(`${ep}/chat`, {
      method: 'POST',
      body: JSON.stringify({ messages, options }),
    });

    if (!res) throw new Error('OpenClaw chat endpoint not available (returned HTML)');

    // 执行工具调用
    if (res.tool_calls) {
      for (const call of res.tool_calls) {
        try {
          await this.callTool(call.function?.name || call.name, call.function?.arguments || call.arguments || {});
        } catch (err: any) {
          console.warn('[OpenClaw] Tool call failed:', err.message);
        }
      }
    }

    return res.message;
  }

  async *streamChat(messages: ChatMessage[], options?: any): AsyncGenerator<string> {
    const ep = this.getEndpoint();
    try {
      yield* this.fetchStream(`${ep}/chat`, { messages, options, stream: true });
    } catch (err: any) {
      if (err.message?.includes('Unexpected token') || err.message?.includes('is not valid JSON')) {
        console.warn('[OpenClaw] Stream endpoint returned HTML instead of JSON');
        yield '[Error: OpenClaw streaming endpoint not available]';
      } else {
        throw err;
      }
    }
  }

  // ── 驾驶舱能力 ──

  async planCockpit(request: CockpitPlanRequest): Promise<CockpitPlanResult> {
    if (this.wsConnected) {
      try {
        const res = await this.wsSend('plan', { goal: request.goal, constraints: request.constraints });
        return res as CockpitPlanResult;
      } catch (err: any) {
        console.warn('[OpenClaw] WS plan failed:', err.message, '→ fallback to HTTP');
      }
    }

    const ep = this.getEndpoint();
    const res = await this.safeFetchJson<CockpitPlanResult>(`${ep}/cockpits/plan`, {
      method: 'POST',
      body: JSON.stringify({ goal: request.goal, constraints: request.constraints }),
    });
    if (!res) throw new Error('OpenClaw plan endpoint not available (returned HTML)');
    return res;
  }

  async createCockpit(spec: CockpitSpec): Promise<Record<string, unknown>> {
    if (this.wsConnected) {
      try {
        const res = await this.wsSend('create', { spec });
        return res;
      } catch (err: any) {
        console.warn('[OpenClaw] WS create failed:', err.message, '→ fallback to HTTP');
      }
    }

    const ep = this.getEndpoint();
    const res = await this.safeFetchJson<Record<string, unknown>>(`${ep}/cockpits`, {
      method: 'POST',
      body: JSON.stringify(spec),
    });
    if (!res) throw new Error('OpenClaw create endpoint not available (returned HTML)');
    return res;
  }

  // ── 智能体能力 ──

  async listAgents(): Promise<Array<Record<string, unknown>>> {
    if (this.wsConnected) {
      try {
        // OpenClaw Gateway 使用 agents.list 方法
        const res = await this.wsSend('agents.list', {});
        const agents = (res.agents as OpenClawAgent[]) || [];
        return agents.map((a) => ({
          id: a.id, name: a.name, description: a.description,
          status: a.status, tools: a.tools, memory_enabled: a.memory_enabled,
        }));
      } catch {
        // fallback to HTTP
      }
    }

    const ep = this.getEndpoint();
    const data = await this.safeFetchJson<{ agents: OpenClawAgent[] }>(`${ep}/agents`);
    if (!data) {
      console.warn('[OpenClaw] listAgents endpoint not available (returned HTML), returning empty list');
      return [];
    }
    return data.agents.map((a) => ({
      id: a.id, name: a.name, description: a.description,
      status: a.status, tools: a.tools, memory_enabled: a.memory_enabled,
    }));
  }

  async invokeAgent(input: AgentInvokeInput): Promise<AgentInvokeResult> {
    if (this.wsConnected) {
      try {
        const res = await this.wsSend('invoke', {
          agentId: input.agentId, command: input.command,
          context: input.context, sessionId: input.sessionId,
        });
        return {
          message: (res.message as string) || '',
          data: res.data,
          sessionId: input.sessionId || '',
        };
      } catch {
        // fallback to HTTP
      }
    }

    const ep = this.getEndpoint();
    const res = await this.fetchJson<{ message: string; tool_calls?: any[]; data?: any }>(
      `${ep}/agents/${input.agentId}/run`, {
        method: 'POST',
        body: JSON.stringify({ command: input.command, context: input.context, session_id: input.sessionId }),
      }
    );

    if (res.tool_calls && res.tool_calls.length > 0) {
      for (const call of res.tool_calls) {
        try { await this.callTool(call.name, call.arguments || {}); }
        catch (err: any) { console.warn(`[OpenClaw] Tool call failed: ${call.name}`, err.message); }
      }
    }

    return { message: res.message, data: res.data, sessionId: input.sessionId || '' };
  }

  // ── 工具管理 ──

  async discoverTools(): Promise<OpenClawTool[]> {
    const ep = this.getEndpoint();
    const res = await this.safeFetchJson<{ tools: OpenClawTool[] }>(`${ep}/tools`);
    return res?.tools || [];
  }

  async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const ep = this.getEndpoint();
    const res = await this.safeFetchJson<unknown>(`${ep}/tools/${toolName}`, {
      method: 'POST', body: JSON.stringify({ params }),
    });
    if (!res) throw new Error(`Tool endpoint not available: ${toolName}`);
    return res;
  }

  // ── 事件（SSE）─

  async subscribeEvents(handler: (event: PlatformEvent) => void): Promise<() => void> {
    const ep = this.getEndpoint();
    const res = await fetch(`${ep}/events`, {
      method: 'GET',
      headers: { ...(this.getAuthHeader()), 'Accept': 'text/event-stream' },
    });

    if (!res.ok) throw new Error(`Subscribe failed: HTTP ${res.status}`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let running = true;

    const readLoop = async () => {
      while (running) {
        try {
          const { done, value } = await reader.read();
          if (done || !running) break;

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
              handler({
                id: data.id || `evt-${Date.now()}`,
                source: this.connectionId, sourceType: 'openclaw',
                type: data.type || 'unknown',
                payload: data.payload || data,
                timestamp: new Date().toISOString(),
              });
            } catch { /* ignore */ }
          }
        } catch { break; }
      }
    };

    readLoop();

    return () => { running = false; reader.releaseLock(); };
  }
}
