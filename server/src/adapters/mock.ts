// ─── Mock 适配器 ───
// 默认适配器，使用本地静态数据，不依赖外部服务
// 用于独立演示或开发测试

import type { AgentPlatformAdapter, ChatChunk, ChatResponse } from './types';
import { agentsData } from '../data/agentsData';
import * as workspaceStore from '../data/workspaceStore';

export class MockAdapter implements AgentPlatformAdapter {
  async getAgents(): Promise<any[]> {
    return agentsData;
  }

  async getAgent(id: string): Promise<any> {
    const agent = agentsData.find((a) => a.id === id);
    if (!agent) throw new Error('Agent not found');
    return agent;
  }

  async getAgentStats(id: string): Promise<any> {
    const agent = agentsData.find((a) => a.id === id);
    if (!agent) throw new Error('Agent not found');
    return {
      usageCount: agent.usageCount,
      successRate: 99.2,
      avgResponseTime: 1.2,
      activeUsers: Math.floor(agent.usageCount / 50),
      weeklyCalls: [342, 385, 298, 412, 356, 423, 287],
      weeklySuccess: [338, 380, 295, 408, 352, 420, 284],
    };
  }

  async getWorkspaces(): Promise<any[]> {
    return workspaceStore.listWorkspaces();
  }

  async getWorkspace(id: string): Promise<any> {
    const ws = await workspaceStore.getWorkspace(id);
    if (!ws) throw new Error('Workspace not found');
    return ws;
  }

  async chat(workspaceId: string, command: string, agentId?: string, _sessionId?: string): Promise<ChatResponse> {
    const ws = await workspaceStore.getWorkspace(workspaceId);
    if (!ws) throw new Error('Workspace not found');
    const targetAgentId = agentId || ws.primaryAgentId;
    const targetAgent = agentsData.find((a) => a.id === targetAgentId);

    // 注入驾驶舱上下文
    const ctx = ws.context;
    const orch = ws.orchestration;
    const primaryAgentName = orch?.primaryAgent?.name || targetAgent?.name || '智能驾驶舱';

    const cmd = command.toLowerCase();
    let message = '';
    let suggestedCommands: string[] = [];

    if (cmd.includes('kpi') || cmd.includes('指标') || cmd.includes('数据')) {
      const highlights = ctx?.widgets?.highlights || [];
      message = highlights.length > 0
        ? `「${ws.name}」当前核心指标：${highlights.join('；')}。`
        : `「${ws.name}」当前核心指标如下：${ws.widgets
            .filter((w) => w.type === 'metric')
            .map((w) => `${w.title}: ${(w.data as any)?.value || '—'}`)
            .join('，')}。`;
      suggestedCommands = ['刷新数据', '生成报表', '查看趋势'];
    } else if (cmd.includes('智能体') || cmd.includes('agent')) {
      const activeAgents = orch?.activeAgents || [];
      message = activeAgents.length > 0
        ? `「${ws.name}」当前${orch?.mode === 'platform-led' ? `由${orch?.primaryAgent?.name || '外部平台'}主导` : '由驾驶舱智能体主导'}，参与智能体：${activeAgents.map((a) => `${a.name}(${a.status === 'active' ? '运行中' : '离线'})`).join('、')}。`
        : `「${ws.name}」当前协作智能体：${ws.agentIds.map((id) => agentsData.find((a) => a.id === id)).filter(Boolean).map((a) => a?.name).join('、')}。`;
      suggestedCommands = ['刷新智能体状态', '查看智能体详情'];
    } else if (cmd.includes('添加') || cmd.includes('增加') || cmd.includes('新建')) {
      message = `我可以帮您添加组件到「${ws.name}」。请告诉我您想添加什么类型的组件（如指标、图表、表格等），以及组件的名称。`;
      suggestedCommands = ['添加销售指标', '添加趋势图表', '添加客户表格'];
    } else if (cmd.includes('删除') || cmd.includes('移除') || cmd.includes('去掉')) {
      message = `我可以帮您删除「${ws.name}」中的组件。请告诉我您要删除哪个组件，或者组件的名称。`;
      suggestedCommands = ['删除最后一个组件', '清空所有组件'];
    } else if (cmd.includes('改名') || cmd.includes('修改名称')) {
      message = `我可以帮您修改「${ws.name}」的名称。请告诉我新的名称。`;
      suggestedCommands = ['改名为销售看板', '修改描述'];
    } else if (cmd.includes('分析') || cmd.includes('洞察')) {
      message = `我可以基于「${ws.name}」的现有数据为您生成洞察分析。当前有${ws.widgets.length}个组件，主要关注${ctx?.summary?.purpose || '综合业务数据'}。`;
      suggestedCommands = ['分析销售趋势', '生成数据洞察', '找出异常数据'];
    } else {
      message = `我是「${ws.name}」的驾驶舱助手${primaryAgentName !== '智能驾驶舱' ? `（当前由 ${primaryAgentName} 主控）` : ''}。\n\n当前状态：${orch?.reason || '正常运行中'}。\n\n您可以向我提问来管理驾驶舱，例如：\n• 查看KPI指标\n• 添加/删除组件\n• 修改驾驶舱名称\n• 生成数据洞察`;
      suggestedCommands = ['查看KPI指标', '添加组件', '生成洞察'];
    }

    return {
      message,
      suggestedCommands,
      sessionId: _sessionId || `session-${Date.now()}`,
    };
  }

  async *chatStream(
    workspaceId: string,
    command: string,
    agentId?: string,
    sessionId?: string
  ): AsyncGenerator<ChatChunk, ChatResponse, unknown> {
    const response = await this.chat(workspaceId, command, agentId, sessionId);

    const sentences = response.message.split(/([。！？\n])/);
    let buffer = '';
    for (let i = 0; i < sentences.length; i++) {
      buffer += sentences[i];
      if (i % 2 === 1 || i === sentences.length - 1) {
        yield { chunk: buffer, done: false };
        buffer = '';
        await delay(80 + Math.random() * 120);
      }
    }

    return response;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
