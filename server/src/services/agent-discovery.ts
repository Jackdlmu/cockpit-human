// ─── Agent Discovery Service ───
// 聚合所有已连接外部平台的智能体，建立全局可用智能体目录
// 解决核心问题：模板里的 agentIds 是死字符串，需要映射到实际连接

import type { ConnectionManager } from '../connection/manager';
import type { Connector, ConnectionType } from '../connection/types';

/**  discovered agent 的统一表示 */
export interface DiscoveredAgent {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'idle' | 'error' | 'unknown';
  version?: string;
  tags?: string[];
  /** 来源连接 ID */
  sourceConnectionId: string;
  /** 来源连接类型 */
  sourceType: ConnectionType;
  /** 来源连接名称 */
  sourceConnectionName: string;
  /** 该智能体支持的能力（由 connector 声明） */
  capabilities: string[];
  /** 额外元数据 */
  meta?: Record<string, unknown>;
}

/** 缓存条目 */
interface CacheEntry {
  agents: DiscoveredAgent[];
  timestamp: number;
  connectionId: string;
}

const CACHE_TTL_MS = 30000; // 30 秒缓存

export class AgentDiscoveryService {
  private cache = new Map<string, CacheEntry>();
  private refreshTimer?: NodeJS.Timeout;

  constructor(private connectionManager: ConnectionManager) {}

  // ── 核心 API ──

  /** 获取所有可用智能体（聚合所有连接） */
  async discoverAll(): Promise<DiscoveredAgent[]> {
    const connectors = this.connectionManager.getAllConnectors();
    const results: DiscoveredAgent[] = [];

    for (const connector of connectors) {
      const agents = await this.discoverFromConnector(connector);
      results.push(...agents);
    }

    return results;
  }

  /** 从指定连接发现智能体（带缓存） */
  async discoverFromConnector(connector: Connector): Promise<DiscoveredAgent[]> {
    const connId = connector.connectionId;
    const cached = this.cache.get(connId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.agents;
    }

    if (!connector.listAgents) {
      return [];
    }

    try {
      const rawAgents = await connector.listAgents();
      const conn = this.connectionManager.getConnector(connId);
      // getConnector 返回的是 connector 实例，我们需要 connection 元数据
      // 通过内部方法获取连接信息（这里用 store 同步读取）
      const { getConnectionSync } = await import('../connection/store');
      const connectionMeta = getConnectionSync(connId);

      const agents: DiscoveredAgent[] = rawAgents.map((a: any) => ({
        id: String(a.id || a.agentId || a.name || 'unknown'),
        name: String(a.name || a.id || a.agentId || '未命名'),
        description: a.description ? String(a.description) : undefined,
        status: normalizeStatus(a.status),
        version: a.version ? String(a.version) : undefined,
        tags: Array.isArray(a.tags) ? a.tags.map(String) : undefined,
        sourceConnectionId: connId,
        sourceType: connectionMeta?.type || 'generic-llm',
        sourceConnectionName: connectionMeta?.name || connId,
        capabilities: connectionMeta?.capabilities || [],
        meta: a.meta || a,
      }));

      this.cache.set(connId, { agents, timestamp: Date.now(), connectionId: connId });
      return agents;
    } catch (err: any) {
      console.warn(`[AgentDiscovery] Failed to list agents from ${connId}:`, err.message);
      // 缓存空结果，避免频繁失败请求
      this.cache.set(connId, { agents: [], timestamp: Date.now(), connectionId: connId });
      return [];
    }
  }

  /** 根据 ID 查找智能体（跨所有连接） */
  async findAgent(agentId: string): Promise<DiscoveredAgent | undefined> {
    const all = await this.discoverAll();
    return all.find((a) => a.id === agentId);
  }

  /** 查找指定连接上的智能体 */
  async findAgentOnConnection(agentId: string, connectionId: string): Promise<DiscoveredAgent | undefined> {
    const connector = this.connectionManager.getConnector(connectionId);
    if (!connector) return undefined;
    const agents = await this.discoverFromConnector(connector);
    return agents.find((a) => a.id === agentId);
  }

  /** 获取某个连接的缓存智能体（同步，可能过期） */
  getCachedAgents(connectionId: string): DiscoveredAgent[] {
    return this.cache.get(connectionId)?.agents || [];
  }

  /** 强制刷新某个连接的缓存 */
  async refreshConnection(connectionId: string): Promise<DiscoveredAgent[]> {
    this.cache.delete(connectionId);
    const connector = this.connectionManager.getConnector(connectionId);
    if (!connector) return [];
    return this.discoverFromConnector(connector);
  }

  /** 清除所有缓存 */
  clearCache(): void {
    this.cache.clear();
  }

  // ── 生命周期 ──

  /** 启动定期刷新 */
  startAutoRefresh(intervalMs = 60000): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      this.clearCache();
      // 异步刷新但不 await
      this.discoverAll().catch(() => {});
    }, intervalMs);
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
}

// ── 辅助 ──

function normalizeStatus(status: unknown): DiscoveredAgent['status'] {
  const s = String(status).toLowerCase();
  if (s === 'active' || s === 'running' || s === 'online' || s === 'connected') return 'active';
  if (s === 'idle' || s === 'pending' || s === ' standby') return 'idle';
  if (s === 'error' || s === 'failed' || s === 'offline' || s === 'disconnected') return 'error';
  return 'unknown';
}
