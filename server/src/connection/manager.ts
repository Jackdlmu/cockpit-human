// ─── ConnectionManager ───
// 连接池管理：CRUD、生命周期、健康检查、能力发现

import type { Connection, Connector, ConnectionCapability, ConnectionType, ConnectionConfig, CreateConnectionInput, UpdateConnectionInput, PlatformEvent } from './types';
import * as store from './store';
import { eventBus } from '../services/event-bus';
import { GenericLLMConnector } from './connectors/generic-llm';
import { YonClawConnector } from './connectors/yonclaw';
import { OpenClawConnector } from './connectors/openclaw';
import { HermesConnector } from './connectors/hermes';

/** 连接器工厂注册表 */
const connectorFactories: Record<Connection['type'], (c: Connection) => Connector> = {
  'generic-llm': (c) => new GenericLLMConnector(c),
  'yonclaw': (c) => new YonClawConnector(c),
  'openclaw': (c) => new OpenClawConnector(c),
  'hermes': (c) => new HermesConnector(c),
};

export class ConnectionManager {
  private connectors = new Map<string, Connector>();
  private unsubscribers = new Map<string, () => void>();
  private healthCheckTimer?: NodeJS.Timeout;

  private sanitizeForResponse(connection: Connection): Connection {
    return {
      ...connection,
      config: {
        ...connection.config,
        apiKey: undefined,
        token: undefined,
        pat: undefined,
      },
    };
  }

  // ── CRUD ──

  async list(): Promise<Connection[]> {
    const connections = await store.listConnections();
    return connections.map((connection) => this.sanitizeForResponse(connection));
  }

  async get(id: string): Promise<Connection | undefined> {
    const connection = await store.getConnection(id);
    if (!connection) return undefined;
    return this.sanitizeForResponse(connection);
  }

  async create(input: CreateConnectionInput): Promise<Connection> {
    const conn = await store.createConnection(input);
    // 如果 enabled，尝试自动连接
    if (conn.enabled) {
      try {
        await this.connect(conn.id);
      } catch (err: any) {
        console.warn(`[ConnectionManager] Auto-connect failed for ${conn.id}:`, err.message);
      }
    }
    return this.sanitizeForResponse(conn);
  }

  async update(id: string, input: UpdateConnectionInput): Promise<Connection | undefined> {
    const existing = await store.getConnection(id);
    if (!existing) return undefined;

    // 如果禁用了连接，先断开
    if (input.enabled === false) {
      await this.disconnect(id);
    }

    const updated = await store.updateConnection(id, input);
    if (!updated) return undefined;

    // 如果启用了连接，尝试连接
    if (input.enabled === true && !this.connectors.has(id)) {
      try {
        await this.connect(id);
      } catch (err: any) {
        console.warn(`[ConnectionManager] Re-connect failed for ${id}:`, err.message);
      }
    }

    return updated ? this.sanitizeForResponse(updated) : undefined;
  }

  async remove(id: string): Promise<boolean> {
    await this.disconnect(id);
    return store.deleteConnection(id);
  }

  // ── 连接生命周期 ──

  async connect(id: string): Promise<void> {
    const conn = await store.getConnection(id);
    if (!conn) throw new Error(`Connection not found: ${id}`);
    if (!conn.enabled) throw new Error(`Connection ${id} is disabled`);

    // 断开旧连接
    await this.disconnect(id);

    const factory = connectorFactories[conn.type];
    if (!factory) throw new Error(`No connector factory for type: ${conn.type}`);

    const connector = factory(conn);

    try {
      await connector.connect();
      this.connectors.set(id, connector);
      await store.updateConnection(id, { status: 'connected' });
      console.log(`[ConnectionManager] Connected: ${conn.name} (${conn.type})`);

      // 自动订阅事件（如果 Connector 支持）
      if (connector.subscribeEvents) {
        try {
          const unsub = await connector.subscribeEvents((event: PlatformEvent) => {
            eventBus.publish(event);
          });
          this.unsubscribers.set(id, unsub);
          console.log(`[ConnectionManager] Event subscription started: ${conn.name}`);
        } catch (err: any) {
          console.warn(`[ConnectionManager] Event subscription failed for ${conn.name}:`, err.message);
        }
      }
    } catch (err: any) {
      await store.updateConnection(id, { status: 'error' });
      throw err;
    }
  }

  async disconnect(id: string): Promise<void> {
    // 取消事件订阅
    const unsub = this.unsubscribers.get(id);
    if (unsub) {
      try { unsub(); } catch { /* ignore */ }
      this.unsubscribers.delete(id);
    }

    const connector = this.connectors.get(id);
    if (connector) {
      try {
        await connector.disconnect();
      } catch (err: any) {
        console.warn(`[ConnectionManager] Disconnect error for ${id}:`, err.message);
      }
      this.connectors.delete(id);
    }
    const conn = await store.getConnection(id);
    if (conn && conn.status === 'connected') {
      await store.updateConnection(id, { status: 'disconnected' });
    }
  }

  async test(id: string): Promise<{ success: boolean; message: string }> {
    const conn = await store.getConnection(id);
    if (!conn) return { success: false, message: '连接不存在' };

    const factory = connectorFactories[conn.type];
    if (!factory) return { success: false, message: `不支持的类型: ${conn.type}` };

    try {
      const connector = factory(conn);
      const result = await connector.healthCheck();
      if (result.healthy) {
        return {
          success: true,
          message: `连接正常 (${result.latency}ms)${result.error ? ' — ' + result.error : ''}`,
        };
      }
      return { success: false, message: result.error || '健康检查失败' };
    } catch (err: any) {
      return { success: false, message: err.message || '测试失败' };
    }
  }

  /** 测试连接配置（不创建持久化连接） */
  async testConfig(type: ConnectionType, config: ConnectionConfig): Promise<{ success: boolean; message: string }> {
    const factory = connectorFactories[type];
    if (!factory) return { success: false, message: `不支持的类型: ${type}` };

    try {
      const tempConn: Connection = {
        id: 'test',
        name: 'test',
        type,
        config,
        status: 'disconnected',
        capabilities: [],
        priority: 100,
        enabled: true,
        lastHealthCheck: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const connector = factory(tempConn);
      const result = await connector.healthCheck();
      if (result.healthy) {
        return {
          success: true,
          message: `连接配置测试通过 (${result.latency}ms)${result.error ? ' — ' + result.error : ''}`,
        };
      }
      return { success: false, message: result.error || '健康检查失败' };
    } catch (err: any) {
      return { success: false, message: err.message || '测试失败' };
    }
  }

  // ── 连接器访问 ──

  getConnector(id: string): Connector | undefined {
    return this.connectors.get(id);
  }

  getAllConnectors(): Connector[] {
    return Array.from(this.connectors.values());
  }

  /** 根据能力获取第一个匹配的连接器（按优先级排序） */
  getConnectorByCapability(capability: ConnectionCapability): Connector | undefined {
    return this.getAllConnectorsByCapability(capability)[0];
  }

  /** 根据能力获取所有匹配的连接器 */
  getAllConnectorsByCapability(capability: ConnectionCapability): Connector[] {
    const results: Connector[] = [];
    for (const [id, connector] of this.connectors.entries()) {
      const conn = store.getConnectionSync(id);
      if (conn?.enabled && conn.capabilities.includes(capability)) {
        results.push(connector);
      }
    }
    // 按连接优先级排序（同步读取，避免 async comparator 导致随机排序）
    results.sort((a, b) => {
      const ca = store.getConnectionSync(a.connectionId);
      const cb = store.getConnectionSync(b.connectionId);
      return (ca?.priority ?? 100) - (cb?.priority ?? 100);
    });
    return results;
  }

  // ── 健康检查 ──

  startHealthChecks(intervalMs = 30000): void {
    this.stopHealthChecks();
    this.healthCheckTimer = setInterval(() => this.runHealthChecks(), intervalMs);
    console.log(`[ConnectionManager] Health checks started (${intervalMs}ms)`);
  }

  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  private async runHealthChecks(): Promise<void> {
    // 只检查当前实际持有的连接（disconnect 后已从 Map 移除，不会再被检查）
    for (const [id, connector] of this.connectors.entries()) {
      const conn = store.getConnectionSync(id);
      if (!conn || !conn.enabled) continue;

      try {
        const result = await connector.healthCheck();
        await store.updateConnection(id, {
          status: result.healthy ? 'connected' : 'error',
          lastHealthCheck: new Date().toISOString(),
        });
      } catch {
        await store.updateConnection(id, {
          status: 'error',
          lastHealthCheck: new Date().toISOString(),
        });
      }
    }
  }

  // ── 初始化 ──

  /** 启动时自动连接所有 enabled 的连接 */
  async initialize(): Promise<void> {
    const connections = await store.listConnections();
    for (const conn of connections) {
      if (!conn.enabled) continue;
      try {
        await this.connect(conn.id);
      } catch (err: any) {
        console.warn(`[ConnectionManager] Init connect failed for ${conn.id}:`, err.message);
      }
    }
  }
}

/** 全局单例 */
export const connectionManager = new ConnectionManager();
