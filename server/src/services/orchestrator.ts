// ─── Cockpit Orchestrator ───
// 多智能体协作调度器：根据外部Agent可用性 + LLM可用性 动态决策
// 策略：保留监控 + 紧急接管

import type { ConnectionManager } from '../connection/manager';
import type { WorkspaceData, AgentBinding, OrchestrationState } from '../data/workspacesData';
import * as workspaceStore from '../data/workspaceStore';
import { eventBus } from './event-bus';
import type { AgentDiscoveryService } from './agent-discovery';
import type { DiscoveredAgent } from './agent-discovery';
import { getConnectionSync } from '../connection/store';

/** 驾驶舱自身智能体引用 */
const COCKPIT_AGENT_REF = {
  id: 'cockpit-self',
  name: '驾驶舱智能体',
  status: 'active',
  sourceType: 'internal',
};

/** 平台色系映射（用于前端头像分配） */
export const PLATFORM_GRADIENTS: Record<string, string> = {
  yonclaw: 'from-indigo-500 to-blue-600',
  openclaw: 'from-emerald-500 to-green-600',
  hermes: 'from-amber-500 to-yellow-600',
  'generic-llm': 'from-violet-500 to-purple-600',
  internal: 'from-rose-500 to-red-500',
};

export class CockpitOrchestrator {
  private checkTimer?: NodeJS.Timeout;
  private stateCache = new Map<string, OrchestrationState>();

  constructor(
    private connectionManager: ConnectionManager,
    private discoveryService: AgentDiscoveryService
  ) {}

  // ── 核心：状态决策 ──

  /** 为单个 workspace 计算当前协作状态 */
  async evaluateWorkspace(workspace: WorkspaceData): Promise<OrchestrationState> {
    const cached = this.stateCache.get(workspace.id);
    // 缓存 10 秒内不重复计算
    if (cached && Date.now() - new Date(cached.timestamp).getTime() < 10000) {
      return cached;
    }

    const llmHealthy = this.isLLMHealthy();
    const platformAgents = await this.getPlatformAgents(workspace);
    const activeBindings = platformAgents.filter((a) => a.binding?.status === 'active');
    const primaryBinding = activeBindings.find((a) => a.id === workspace.primaryAgentId);

    let state: OrchestrationState;

    // 场景1: 有外部平台主Agent可用 → platform-led（驾驶舱后台化）
    if (primaryBinding && primaryBinding.agent.status === 'active') {
      state = {
        mode: 'platform-led',
        health: 'healthy',
        primaryAgent: {
          id: primaryBinding.agent.id,
          name: primaryBinding.agent.name,
          sourceType: primaryBinding.agent.sourceType,
        },
        activeAgents: activeBindings.map((a) => ({
          id: a.agent.id,
          name: a.agent.name,
          status: a.agent.status,
        })),
        cockpitAgentActive: false,
        reason: `主智能体「${primaryBinding.agent.name}」正常运行，驾驶舱智能体已后台化`,
        timestamp: new Date().toISOString(),
      };
    }
    // 场景2: 无外部Agent但LLM可用，且 agentMode=llm-only → llm-direct
    else if (llmHealthy && workspace.agentMode === 'llm-only') {
      state = {
        mode: 'llm-direct',
        health: 'healthy',
        primaryAgent: { id: COCKPIT_AGENT_REF.id, name: COCKPIT_AGENT_REF.name, sourceType: 'internal' },
        activeAgents: [{ id: COCKPIT_AGENT_REF.id, name: COCKPIT_AGENT_REF.name, status: 'active' }],
        cockpitAgentActive: true,
        reason: 'LLM直连模式，智能驾驶舱独立运行',
        timestamp: new Date().toISOString(),
      };
    }
    // 场景3: 外部Agent不可用但LLM可用 → cockpit-led（降级，自身接管）
    else if (llmHealthy) {
      state = {
        mode: 'cockpit-led',
        health: activeBindings.length > 0 ? 'degraded' : 'healthy',
        primaryAgent: { id: COCKPIT_AGENT_REF.id, name: COCKPIT_AGENT_REF.name, sourceType: 'internal' },
        activeAgents: [
          { id: COCKPIT_AGENT_REF.id, name: COCKPIT_AGENT_REF.name, status: 'active' },
          ...platformAgents.map((a) => ({
            id: a.agent.id,
            name: a.agent.name,
            status: a.agent.status === 'active' ? 'active' : 'unavailable',
          })),
        ],
        cockpitAgentActive: true,
        reason: activeBindings.length > 0
          ? '协作智能体部分不可用，驾驶舱智能体已接管主控'
          : '驾驶舱智能体自主运行中',
        timestamp: new Date().toISOString(),
      };
    }
    // 场景4: 完全不可用
    else {
      state = {
        mode: 'cockpit-led',
        health: 'unavailable',
        primaryAgent: null,
        activeAgents: platformAgents.map((a) => ({
          id: a.agent.id,
          name: a.agent.name,
          status: 'unavailable',
        })),
        cockpitAgentActive: false,
        reason: 'LLM连接不可用，智能体功能受限',
        timestamp: new Date().toISOString(),
      };
    }

    // 检测状态变化，触发事件
    const prev = this.stateCache.get(workspace.id);
    if (prev && (prev.mode !== state.mode || prev.health !== state.health)) {
      eventBus.publish({
        id: `evt-${Date.now()}`,
        source: 'orchestrator',
        sourceType: 'internal',
        type: 'orchestration.changed',
        payload: {
          workspaceId: workspace.id,
          previous: { mode: prev.mode, health: prev.health },
          current: { mode: state.mode, health: state.health },
          reason: state.reason,
        },
        timestamp: state.timestamp,
      });
    }

    this.stateCache.set(workspace.id, state);

    // 持久化到 workspace store
    await workspaceStore.updateWorkspace(workspace.id, { orchestration: state });

    return state;
  }

  /** 批量评估所有 workspace */
  async evaluateAll(): Promise<Map<string, OrchestrationState>> {
    const workspaces = await workspaceStore.listWorkspaces();
    const results = new Map<string, OrchestrationState>();
    for (const ws of workspaces) {
      try {
        const state = await this.evaluateWorkspace(ws);
        results.set(ws.id, state);
      } catch (err: any) {
        console.error(`[Orchestrator] Evaluate failed for ${ws.id}:`, err.message);
      }
    }
    return results;
  }

  // ── 紧急接管 ──

  /** 手动触发接管：当外部Agent超时/错误时调用 */
  async takeOver(workspaceId: string, reason: string): Promise<OrchestrationState> {
    const ws = await workspaceStore.getWorkspace(workspaceId);
    if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

    const state: OrchestrationState = {
      mode: 'cockpit-led',
      health: 'degraded',
      primaryAgent: { id: COCKPIT_AGENT_REF.id, name: COCKPIT_AGENT_REF.name, sourceType: 'internal' },
      activeAgents: [{ id: COCKPIT_AGENT_REF.id, name: COCKPIT_AGENT_REF.name, status: 'active' }],
      cockpitAgentActive: true,
      reason: `紧急接管：${reason}`,
      timestamp: new Date().toISOString(),
    };

    this.stateCache.set(workspaceId, state);
    await workspaceStore.updateWorkspace(workspaceId, { orchestration: state });

    eventBus.publish({
      id: `evt-${Date.now()}`,
      source: 'orchestrator',
      sourceType: 'internal',
      type: 'orchestration.takeover',
      payload: { workspaceId, reason, state },
      timestamp: state.timestamp,
    });

    return state;
  }

  /** 获取指定 workspace 的当前调度状态 */
  getState(workspaceId: string): OrchestrationState | undefined {
    return this.stateCache.get(workspaceId);
  }

  // ── 健康检查 ──

  startAutoCheck(intervalMs = 15000): void {
    this.stopAutoCheck();
    this.checkTimer = setInterval(() => {
      this.evaluateAll().catch(() => {});
    }, intervalMs);
    console.log(`[Orchestrator] Auto-check started (${intervalMs}ms)`);
  }

  stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  // ── 内部辅助 ──

  /** 检查 LLM 是否可用 */
  private isLLMHealthy(): boolean {
    const llm = this.connectionManager.getConnectorByCapability('llm-chat');
    if (!llm) return false;
    const conn = getConnectionSync(llm.connectionId);
    return conn?.status === 'connected' && conn?.enabled;
  }

  /** 获取 workspace 关联的所有平台Agent */
  private async getPlatformAgents(
    workspace: WorkspaceData
  ): Promise<{ agent: DiscoveredAgent; binding?: AgentBinding }[]> {
    const results: { agent: DiscoveredAgent; binding?: AgentBinding }[] = [];
    const bindings = workspace.agentBindings || [];

    for (const binding of bindings) {
      try {
        const agent = await this.discoveryService.findAgent(binding.agentId);
        if (agent) {
          results.push({ agent, binding });
        }
      } catch {
        // ignore discovery errors
      }
    }

    return results;
  }
}
