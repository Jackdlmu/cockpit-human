// ─── Agent Router ───
// 智能体路由层：根据 agentId / 能力需求 / 领域 → 找到正确的 Connector
// 核心职责：
//   1. agentId → connector 映射（跨多个连接平台）
//   2. 能力需求 → 最优 connector 选择（支持优先级）
//   3. Widget dataSource → 执行路由
//   4. 可用性检查 + 降级建议

import type { ConnectionManager } from '../connection/manager';
import type { Connector, ConnectionCapability, ConnectionType } from '../connection/types';
import { getConnectionSync } from '../connection/store';
import { AgentDiscoveryService, type DiscoveredAgent } from './agent-discovery';

export interface AgentRoutingResult {
  /** 匹配的 connector（可直接调用） */
  connector: Connector;
  /** 来源连接 ID */
  connectionId: string;
  /** 来源连接类型 */
  connectionType: ConnectionType;
  /** 路由策略 */
  strategy: 'exact' | 'capability' | 'fallback-llm' | 'fallback-static';
  /** 说明 */
  reason: string;
}

export interface RoutingOptions {
  /** 优先使用的连接 ID */
  preferredConnectionId?: string;
  /** 最低需要的能力 */
  requiredCapability?: ConnectionCapability;
  /** 是否允许 fallback 到 LLM */
  allowLLMFallback?: boolean;
  /** 是否允许返回 null（不 fallback） */
  allowNull?: boolean;
}

export class AgentRouter {
  private discovery: AgentDiscoveryService;

  constructor(private connectionManager: ConnectionManager) {
    this.discovery = new AgentDiscoveryService(connectionManager);
  }

  getDiscoveryService(): AgentDiscoveryService {
    return this.discovery;
  }

  // ── 核心路由 API ──

  /**
   * 根据 agentId 解析最佳 Connector
   * 策略优先级：
   *   1. 该 agent 注册在哪个连接 → 用那个连接的 connector
   *   2. 没发现该 agent → 找支持 agent-invoke 的任意连接（用户可能配置了通用 agent-invoke 端点）
   *   3. 还没有 → fallback 到 LLM（如果允许）
   *   4. 最终返回 null（调用方应 fallback 到静态数据）
   */
  async resolveAgent(agentId: string, options?: RoutingOptions): Promise<AgentRoutingResult | null> {
    // 1. 先发现所有智能体
    const allAgents = await this.discovery.discoverAll();
    const matched = allAgents.find((a) => a.id === agentId);

    if (matched) {
      const connector = this.connectionManager.getConnector(matched.sourceConnectionId);
      if (connector) {
        return {
          connector,
          connectionId: matched.sourceConnectionId,
          connectionType: matched.sourceType,
          strategy: 'exact',
          reason: `Agent "${agentId}" discovered on ${matched.sourceConnectionName}`,
        };
      }
    }

    // 2. 按能力查找（如果指定了 preferredConnectionId 优先）
    const reqCap = options?.requiredCapability || 'agent-invoke';
    if (options?.preferredConnectionId) {
      const preferred = this.connectionManager.getConnector(options.preferredConnectionId);
      if (preferred) {
        const connMeta = this.getConnectionMeta(options.preferredConnectionId);
        if (connMeta?.capabilities.includes(reqCap)) {
          return {
            connector: preferred,
            connectionId: options.preferredConnectionId,
            connectionType: connMeta.type,
            strategy: 'capability',
            reason: `Using preferred connection by capability "${reqCap}"`,
          };
        }
      }
    }

    // 3. 任意支持该能力的连接
    const byCap = this.connectionManager.getConnectorByCapability(reqCap);
    if (byCap) {
      const connMeta = this.getConnectionMeta(byCap.connectionId);
      return {
        connector: byCap,
        connectionId: byCap.connectionId,
        connectionType: connMeta?.type || 'generic-llm',
        strategy: 'capability',
        reason: `Using first connector with capability "${reqCap}"`,
      };
    }

    // 4. Fallback 到 LLM
    if (options?.allowLLMFallback !== false) {
      const llm = this.connectionManager.getConnectorByCapability('llm-chat');
      if (llm) {
        const connMeta = this.getConnectionMeta(llm.connectionId);
        return {
          connector: llm,
          connectionId: llm.connectionId,
          connectionType: connMeta?.type || 'generic-llm',
          strategy: 'fallback-llm',
          reason: `Agent "${agentId}" not found, falling back to LLM`,
        };
      }
    }

    // 5. 不允许 null → 返回 static fallback 标记
    if (options?.allowNull) {
      return null;
    }

    // 6. 最终：没有任何可用连接，返回 null 让调用方 fallback
    return null;
  }

  /**
   * 为 Widget 的 dataSource 解析路由
   * 支持 dataSource 中的 connectionId / agentId / skillId 显式指定
   */
  async resolveWidgetRoute(
    dataSource: {
      type: string;
      connectionId?: string;
      agentId?: string;
      skillId?: string;
    },
    options?: RoutingOptions
  ): Promise<AgentRoutingResult | null> {
    // A. 显式指定了 connectionId
    if (dataSource.connectionId) {
      const connector = this.connectionManager.getConnector(dataSource.connectionId);
      if (connector) {
        const connMeta = this.getConnectionMeta(dataSource.connectionId);
        return {
          connector,
          connectionId: dataSource.connectionId,
          connectionType: connMeta?.type || 'generic-llm',
          strategy: 'exact',
          reason: `Explicit connectionId: ${dataSource.connectionId}`,
        };
      }
    }

    // B. 显式指定了 agentId
    if (dataSource.agentId) {
      const result = await this.resolveAgent(dataSource.agentId, options);
      if (result) return result;
    }

    // C. skill 类型：按能力路由
    if (dataSource.type === 'skill') {
      return this.resolveAgent(dataSource.skillId || 'default', {
        ...options,
        requiredCapability: 'agent-invoke',
      });
    }

    // D. query 类型
    if (dataSource.type === 'query') {
      const exec = this.connectionManager.getConnectorByCapability('cockpit-execute')
        || this.connectionManager.getConnectorByCapability('agent-invoke');
      if (exec) {
        const connMeta = this.getConnectionMeta(exec.connectionId);
        return {
          connector: exec,
          connectionId: exec.connectionId,
          connectionType: connMeta?.type || 'generic-llm',
          strategy: 'capability',
          reason: 'Auto-routed by query capability',
        };
      }
    }

    // E. 没有任何匹配
    if (options?.allowLLMFallback !== false) {
      const llm = this.connectionManager.getConnectorByCapability('llm-chat');
      if (llm) {
        const connMeta = this.getConnectionMeta(llm.connectionId);
        return {
          connector: llm,
          connectionId: llm.connectionId,
          connectionType: connMeta?.type || 'generic-llm',
          strategy: 'fallback-llm',
          reason: 'No specific route found, fallback to LLM',
        };
      }
    }

    return null;
  }

  // ── 可用性查询 ──

  /** 检查某个 agentId 是否可用 */
  async isAgentAvailable(agentId: string): Promise<boolean> {
    const agent = await this.discovery.findAgent(agentId);
    return !!agent && agent.status === 'active';
  }

  /** 获取所有可用智能体 */
  async listAvailableAgents(): Promise<DiscoveredAgent[]> {
    const all = await this.discovery.discoverAll();
    return all.filter((a) => a.status === 'active' || a.status === 'idle');
  }

  /** 为模板/领域推荐智能体 */
  async suggestAgentsForDomain(domain: string, templateAgentIds?: string[]): Promise<{
    matched: DiscoveredAgent[];
    suggested: DiscoveredAgent[];
    unavailable: string[];
  }> {
    const available = await this.listAvailableAgents();
    const domainLower = domain.toLowerCase();

    const matched: DiscoveredAgent[] = [];
    const unavailable: string[] = [];

    // 先匹配模板建议的 agentIds
    if (templateAgentIds) {
      for (const id of templateAgentIds) {
        const found = available.find((a) => a.id === id);
        if (found) {
          matched.push(found);
        } else {
          unavailable.push(id);
        }
      }
    }

    // 领域匹配：name / description / tags 中包含领域关键词
    const suggested = available.filter((a) => {
      if (matched.some((m) => m.id === a.id)) return false;
      const text = `${a.name} ${a.description || ''} ${(a.tags || []).join(' ')}`.toLowerCase();
      return text.includes(domainLower);
    });

    return { matched, suggested, unavailable };
  }

  /** 获取当前环境支持的多智能体模式建议 */
  async suggestAgentMode(): Promise<{
    mode: 'single' | 'multi-coordinator' | 'multi-parallel' | 'llm-only';
    reason: string;
    availableAgentCount: number;
  }> {
    const agents = await this.listAvailableAgents();
    const hasAgentInvoke = !!this.connectionManager.getConnectorByCapability('agent-invoke');
    const hasLLM = !!this.connectionManager.getConnectorByCapability('llm-chat');

    if (!hasAgentInvoke && !hasLLM) {
      return { mode: 'llm-only', reason: '无可用连接', availableAgentCount: 0 };
    }

    if (!hasAgentInvoke && hasLLM) {
      return { mode: 'llm-only', reason: '仅有 LLM 连接，无 agent-invoke 能力', availableAgentCount: 0 };
    }

    if (agents.length === 0 && hasLLM) {
      return { mode: 'llm-only', reason: '有 agent-invoke 连接但未发现智能体，降级到 LLM', availableAgentCount: 0 };
    }

    if (agents.length === 1) {
      return { mode: 'single', reason: '发现 1 个可用智能体', availableAgentCount: 1 };
    }

    // 多个智能体时，检查是否有 yonclaw/openclaw（支持编排）
    const hasOrchestration = this.connectionManager.getAllConnectors().some((c) => {
      const meta = this.getConnectionMeta(c.connectionId);
      return meta?.type === 'yonclaw' || meta?.type === 'openclaw';
    });

    if (hasOrchestration) {
      return { mode: 'multi-coordinator', reason: '发现多个智能体 + 编排平台支持', availableAgentCount: agents.length };
    }

    return { mode: 'multi-parallel', reason: '发现多个智能体，无编排平台，并行执行', availableAgentCount: agents.length };
  }

  // ── 内部 ──

  private getConnectionMeta(connectionId: string) {
    return getConnectionSync(connectionId);
  }
}

// ── 全局单例（延迟初始化）─
let routerInstance: AgentRouter | null = null;

export function initAgentRouter(cm: ConnectionManager): AgentRouter {
  routerInstance = new AgentRouter(cm);
  return routerInstance;
}

export function getAgentRouter(): AgentRouter | null {
  return routerInstance;
}
