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

    const cmd = command.toLowerCase();
    let message = '';
    let suggestedCommands: string[] = [];

    if (cmd.includes('kpi') || cmd.includes('指标') || cmd.includes('数据')) {
      message = `「${ws.name}」当前核心指标如下：${ws.widgets
        .filter((w) => w.type === 'metric')
        .map((w) => `${w.title}: ${(w.data as any)?.value || '—'}`)
        .join('，')}。整体运行状态良好。`;
      suggestedCommands = ['刷新数据', '生成报表', '查看趋势'];
    } else if (cmd.includes('智能体') || cmd.includes('agent')) {
      const agents = ws.agentIds.map((id) => agentsData.find((a) => a.id === id)).filter(Boolean);
      message = `「${ws.name}」当前协作智能体：${agents.map((a) => `${a?.name}(${a?.status === 'active' ? '运行中' : '空闲'})`).join('、')}。主智能体为 ${targetAgent?.name || '未设置'}。`;
      suggestedCommands = ['刷新智能体状态', '查看智能体详情'];
    } else {
      message = `我是「${ws.name}」的驾驶舱助手${targetAgent ? `（由 ${targetAgent.name} 驱动）` : ''}。您可以向我提问来管理驾驶舱，例如：查看KPI指标、刷新数据、分析趋势等。`;
      suggestedCommands = ['查看KPI指标', '刷新数据', '分析趋势'];
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
