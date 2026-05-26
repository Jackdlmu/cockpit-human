// ─── WebSocket 事件服务器 ───
// 挂载在 Express HTTP server 上，路径 /api/events
// 前端连接后可实时接收外部平台事件

import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { eventBus } from './event-bus';
import type { PlatformEvent } from '../connection/types';

interface ClientState {
  ws: WebSocket;
  filters: Array<{ source?: string; sourceType?: string; type?: string }>;
  connectedAt: string;
}

const clients = new Map<WebSocket, ClientState>();

export function createWebSocketServer(httpServer: HttpServer, path = '/api/events'): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    console.log(`[WS] Client connected from ${clientIp}, total: ${clients.size + 1}`);

    const state: ClientState = {
      ws,
      filters: [],
      connectedAt: new Date().toISOString(),
    };
    clients.set(ws, state);

    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'system',
      payload: { message: 'Connected to YonCockpit Event Stream' },
      timestamp: new Date().toISOString(),
    }));

    // 处理客户端消息
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(ws, state, msg);
      } catch {
        ws.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Invalid JSON' },
          timestamp: new Date().toISOString(),
        }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected, total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
      clients.delete(ws);
    });
  });

  // 订阅 EventBus，转发到所有 WebSocket 客户端
  eventBus.subscribe((event) => {
    broadcast(event);
  });

  console.log(`[WS] WebSocket server ready on ${path}`);
  return wss;
}

/** 处理客户端消息 */
function handleClientMessage(ws: WebSocket, state: ClientState, msg: any): void {
  switch (msg.action) {
    case 'subscribe': {
      // 订阅特定主题
      const filter = msg.filter || {};
      state.filters.push(filter);
      ws.send(JSON.stringify({
        type: 'system',
        payload: { message: 'Subscribed', filter },
        timestamp: new Date().toISOString(),
      }));
      break;
    }

    case 'unsubscribe': {
      const filter = msg.filter || {};
      state.filters = state.filters.filter((f) =>
        JSON.stringify(f) !== JSON.stringify(filter)
      );
      break;
    }

    case 'history': {
      // 请求历史事件
      const history = eventBus.getHistory(msg.filter);
      ws.send(JSON.stringify({
        type: 'history',
        payload: { events: history.slice(-100) },
        timestamp: new Date().toISOString(),
      }));
      break;
    }

    case 'ping': {
      ws.send(JSON.stringify({
        type: 'pong',
        payload: {},
        timestamp: new Date().toISOString(),
      }));
      break;
    }

    default:
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: `Unknown action: ${msg.action}` },
        timestamp: new Date().toISOString(),
      }));
  }
}

/** 广播事件到所有匹配的客户端 */
function broadcast(event: PlatformEvent): void {
  const message = JSON.stringify({
    type: event.type,
    source: event.source,
    sourceType: event.sourceType,
    payload: event.payload,
    timestamp: event.timestamp,
    id: event.id,
  });

  for (const state of clients.values()) {
    // 如果没有设置过滤器，接收所有事件
    if (state.filters.length === 0) {
      if (state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(message);
      }
      continue;
    }

    // 检查是否匹配任一过滤器
    for (const filter of state.filters) {
      if (matchesFilter(event, filter)) {
        if (state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(message);
        }
        break;
      }
    }
  }
}

function matchesFilter(event: PlatformEvent, filter: any): boolean {
  if (filter.source && event.source !== filter.source) return false;
  if (filter.sourceType && event.sourceType !== filter.sourceType) return false;
  if (filter.type && event.type !== filter.type) return false;
  return true;
}

/** 获取当前连接数 */
export function getWsClientCount(): number {
  return clients.size;
}

/** 向所有客户端发送系统消息 */
export function broadcastSystem(message: string): void {
  broadcast({
    id: `sys-${Date.now()}`,
    source: 'system',
    sourceType: 'hermes',
    type: 'system',
    payload: { message },
    timestamp: new Date().toISOString(),
  });
}
