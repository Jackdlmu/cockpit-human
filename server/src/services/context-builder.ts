// ─── Cockpit Context Builder ───
// 生成驾驶舱智能友好的上下文摘要，便于LLM快速理解当前状态

import type { WorkspaceData, CockpitContext, AgentContextRef } from '../data/workspacesData';
import * as workspaceStore from '../data/workspaceStore';

export class ContextBuilder {
  /** 为指定 workspace 构建/刷新上下文 */
  async build(workspace: WorkspaceData): Promise<CockpitContext> {
    const context = this.composeContext(workspace);
    // 持久化
    await workspaceStore.updateWorkspace(workspace.id, { context });
    return context;
  }

  /** 构建临时上下文，不写回持久层 */
  buildTransient(workspace: WorkspaceData): CockpitContext {
    return this.composeContext(workspace);
  }

  private composeContext(workspace: WorkspaceData): CockpitContext {
    const existing = workspace.context;
    const version = (existing?.version || 0) + 1;

    return {
      version,
      summary: this.buildSummary(workspace),
      agents: this.buildAgentsContext(workspace),
      widgets: this.buildWidgetsContext(workspace),
      recentActions: this.mergeRecentActions(workspace, existing),
    };
  }

  /** 批量构建所有 workspace */
  async buildAll(): Promise<void> {
    const workspaces = await workspaceStore.listWorkspaces();
    for (const ws of workspaces) {
      try {
        await this.build(ws);
      } catch (err: any) {
        console.error(`[ContextBuilder] Failed for ${ws.id}:`, err.message);
      }
    }
  }

  /** 构建对话用的提示词上下文 */
  buildPromptContext(workspace: WorkspaceData, context: CockpitContext): string {
    const agents = context.agents;
    const primary = agents.primary;
    const collaborators = agents.collaborators;

    return `【驾驶舱上下文 v${context.version}】
名称：${context.summary.name}
用途：${context.summary.purpose}
当前状态：${agents.orchestrationMode}，${agents.healthStatus}
主控智能体：${primary ? `${primary.name}（${primary.status}）` : '无'}
协作智能体：${collaborators.map((a) => `${a.name}（${a.status}）`).join('、') || '无'}
组件概况：共${context.widgets.count}个组件，${Object.entries(context.widgets.types).map(([k, v]) => `${k}:${v}`).join('、')}
关键数据：${context.widgets.highlights.join('；') || '暂无'}
最近操作：${context.recentActions.slice(-3).map((a) => `[${a.agent}] ${a.action}`).join('；') || '无'}

用户当前正在查看「${workspace.name}」驾驶舱。请基于以上上下文回答用户问题或执行操作。`;
  }

  // ── 内部构建 ──

  private buildSummary(workspace: WorkspaceData): CockpitContext['summary'] {
    const existing = workspace.context?.summary;
    return {
      name: workspace.name,
      description: workspace.description,
      purpose: existing?.purpose || this.inferPurpose(workspace),
      keyMetrics: this.extractKeyMetrics(workspace),
      lastUpdated: new Date().toISOString(),
    };
  }

  private buildAgentsContext(workspace: WorkspaceData): CockpitContext['agents'] {
    const orch = workspace.orchestration;
    const primary = orch?.primaryAgent;
    const activeAgents = orch?.activeAgents || [];

    const primaryRef: AgentContextRef | null = primary
      ? {
          id: primary.id,
          name: primary.name,
          role: 'primary',
          status: 'active',
          capabilities: [],
          recentContributions: [],
        }
      : null;

    const collaborators: AgentContextRef[] = activeAgents
      .filter((a) => a.id !== primary?.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        role: 'collaborator',
        status: a.status,
        capabilities: [],
        recentContributions: [],
      }));

    return {
      primary: primaryRef,
      collaborators,
      orchestrationMode: orch?.mode || 'cockpit-led',
      healthStatus: orch?.health || 'unknown',
    };
  }

  private buildWidgetsContext(workspace: WorkspaceData): CockpitContext['widgets'] {
    const widgets = workspace.widgets || [];
    const types: Record<string, number> = {};
    const highlights: string[] = [];

    for (const w of widgets) {
      const type = w.type || 'unknown';
      types[type] = (types[type] || 0) + 1;

      // 提取 metric 类型的关键数据作为 highlights
      if (type === 'metric' && w.data?.value) {
        const change = w.data.change ? ` (${w.data.change})` : '';
        highlights.push(`${w.title}: ${w.data.value}${change}`);
      }
      // chart 类型提取最新数据点
      if (type === 'chart' && w.data?.values?.length > 0) {
        const last = w.data.values[w.data.values.length - 1];
        highlights.push(`${w.title}: 最新值 ${last}`);
      }
      if (type === 'table' && Array.isArray(w.data?.rows) && w.data.rows.length > 0) {
        const firstRow = Array.isArray(w.data.rows[0])
          ? w.data.rows[0].join(' / ')
          : JSON.stringify(w.data.rows[0]);
        highlights.push(`${w.title}: 首行 ${firstRow}`);
      }
      if (type === 'list' && Array.isArray(w.data?.items) && w.data.items.length > 0) {
        const firstItem = typeof w.data.items[0] === 'string'
          ? w.data.items[0]
          : JSON.stringify(w.data.items[0]);
        highlights.push(`${w.title}: 首项 ${firstItem}`);
      }
      if (type === 'report' && typeof w.data?.summary === 'string' && w.data.summary.trim()) {
        highlights.push(`${w.title}: ${w.data.summary.trim().slice(0, 80)}`);
      }
      if (type === 'status' && Array.isArray(w.data?.items) && w.data.items.length > 0) {
        const firstStatus = w.data.items[0] as Record<string, unknown>;
        if (firstStatus?.label || firstStatus?.name) {
          highlights.push(`${w.title}: ${String(firstStatus.label || firstStatus.name)}=${String(firstStatus.value || firstStatus.status || '')}`);
        }
      }
    }

    return {
      count: widgets.length,
      types,
      highlights: highlights.slice(0, 6),
    };
  }

  private mergeRecentActions(
    workspace: WorkspaceData,
    existing?: CockpitContext
  ): CockpitContext['recentActions'] {
    const prev = existing?.recentActions || [];
    // 保留最近20条
    return prev.slice(-20);
  }

  /** 推断驾驶舱用途 */
  private inferPurpose(workspace: WorkspaceData): string {
    const name = workspace.name;
    const desc = workspace.description;
    const lower = `${name} ${desc}`.toLowerCase();

    if (lower.includes('销售') || lower.includes('业绩')) return '销售业绩监控与分析';
    if (lower.includes('hr') || lower.includes('入职') || lower.includes('人力')) return '人力资源管理与入职流程跟踪';
    if (lower.includes('财务') || lower.includes('审批') || lower.includes('报销')) return '财务审批与预算管理';
    if (lower.includes('it') || lower.includes('运维') || lower.includes('监控')) return '系统监控与IT运维';
    if (lower.includes('营销') || lower.includes('市场') || lower.includes('投放')) return '营销数据分析与ROI追踪';
    if (lower.includes('供应链') || lower.includes('库存') || lower.includes('采购')) return '供应链监控与库存管理';
    if (lower.includes('客服') || lower.includes('服务')) return '客户服务与工单处理';
    if (lower.includes('法务') || lower.includes('合规')) return '法务合规与合同审查';
    return '综合业务数据监控与分析';
  }

  /** 从 metric widget 中提取关键指标 */
  private extractKeyMetrics(workspace: WorkspaceData): string[] {
    const metrics = (workspace.widgets || [])
      .filter((w: any) => w.type === 'metric' && w.data?.value)
      .map((w: any) => `${w.title} ${w.data.value}`);
    return metrics.slice(0, 4);
  }
}

// 全局单例
export const contextBuilder = new ContextBuilder();
