// ─── Hermes Connector ───
// 对接 Hermes 消息/事件总线
// 特性：WebSocket 双向通信、事件订阅/发布、消息广播

import type { Connection, Connector, ChatMessage, AgentInvokeInput, AgentInvokeResult, CockpitPlanRequest, CockpitPlanResult, CockpitSpec, PlatformEvent } from '../types';

interface HermesMessage {
  id: string;
  topic: string;
  action: 'publish' | 'subscribe' | 'unsubscribe' | 'ping' | 'pong';
  payload?: Record<string, unknown>;
  timestamp: string;
}

export class HermesConnector implements Connector {
  readonly connectionId: string;
  readonly type: Connection['type'];

  private connection: Connection;
  private ws?: WebSocket;
  private messageHandlers = new Set<(event: PlatformEvent) => void>();
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private pingTimer?: NodeJS.Timeout;
  private lastPong = Date.now();
  private shouldReconnect = true;

  constructor(connection: Connection) {
    if (connection.type !== 'hermes') {
      throw new Error(`HermesConnector requires type 'hermes', got '${connection.type}'`);
    }
    this.connection = connection;
    this.connectionId = connection.id;
    this.type = connection.type;
  }

  // ── 生命周期 ──

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ep = this.getWsEndpoint();

      try {
        this.ws = new WebSocket(ep);
      } catch (err: unknown) {
        reject(new Error(`WebSocket creation failed: ${err.message}`));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
        this.ws?.close();
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.reconnectAttempts = 0;
        this.startPing();
        console.log(`[Hermes] Connected: ${this.connection.name}`);
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this.stopPing();
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err: Event) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${err.message || 'Unknown'}`));
      };
    });
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    this.stopReconnect();
    this.stopPing();
    if (this.ws) {
      // 先移除监听器，防止 close 触发 onclose → scheduleReconnect
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = undefined;
    }
    this.messageHandlers.clear();
  }

  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const start = Date.now();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { healthy: false, latency: 0, error: 'WebSocket not connected' };
    }

    // 发送 ping，等待 pong
    return new Promise((resolve) => {
      const pongWait = setTimeout(() => {
        resolve({ healthy: false, latency: Date.now() - start, error: 'Pong timeout' });
      }, 5000);

      const checkPong = () => {
        if (Date.now() - this.lastPong < 6000) {
          clearTimeout(pongWait);
          resolve({ healthy: true, latency: Date.now() - start });
        } else {
          setTimeout(checkPong, 500);
        }
      };

      this.send({ id: `ping-${Date.now()}`, topic: 'system', action: 'ping', timestamp: new Date().toISOString() });
      checkPong();
    });
  }

  // ── 消息处理 ──

  private handleMessage(data: string): void {
    try {
      const msg: HermesMessage = JSON.parse(data);

      if (msg.action === 'pong') {
        this.lastPong = Date.now();
        return;
      }

      // 转换为 PlatformEvent 分发
      const event: PlatformEvent = {
        id: msg.id,
        source: this.connectionId,
        sourceType: 'hermes',
        type: msg.topic,
        payload: msg.payload || {},
        timestamp: msg.timestamp,
      };

      for (const handler of this.messageHandlers) {
        try { handler(event); } catch { /* ignore */ }
      }
    } catch {
      // 非 JSON 消息，忽略
    }
  }

  private send(msg: HermesMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ── 重连机制 ──

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  // ── 心跳 ──

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({
        id: `ping-${Date.now()}`,
        topic: 'system',
        action: 'ping',
        timestamp: new Date().toISOString(),
      });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  // ── 事件订阅/发布 ──

  async subscribeEvents(handler: (event: PlatformEvent) => void): Promise<() => void> {
    this.messageHandlers.add(handler);

    // 发送订阅消息
    const topicPrefix = this.connection.config.topicPrefix || '*';
    this.send({
      id: `sub-${Date.now()}`,
      topic: topicPrefix,
      action: 'subscribe',
      timestamp: new Date().toISOString(),
    });

    return () => {
      this.messageHandlers.delete(handler);
      this.send({
        id: `unsub-${Date.now()}`,
        topic: topicPrefix,
        action: 'unsubscribe',
        timestamp: new Date().toISOString(),
      });
    };
  }

  async publishEvent(topic: string, payload: Record<string, unknown>): Promise<void> {
    this.send({
      id: `pub-${Date.now()}`,
      topic,
      action: 'publish',
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  // ── 工具方法 ──

  private getWsEndpoint(): string {
    let ep = this.connection.config.endpoint || '';
    ep = ep.replace(/\/$/, '');
    // 将 http/https 转换为 ws/wss
    if (ep.startsWith('https://')) {
      return ep.replace('https://', 'wss://');
    }
    if (ep.startsWith('http://')) {
      return ep.replace('http://', 'ws://');
    }
    return ep;
  }
}
