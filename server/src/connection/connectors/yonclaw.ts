// ─── YonClaw Connector ───
// 对接 YonClaw（基于 OpenClaw 的企业级智能体平台）
// 特性：技能发现、流程编排引擎、企业权限体系

import { BaseConnector } from './base';
import type { Connection, ChatMessage, AgentInvokeInput, AgentInvokeResult, CockpitPlanRequest, CockpitPlanResult, CockpitSpec, PlatformEvent } from '../types';

interface YonClawSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'active' | 'inactive';
  tags: string[];
}

interface YonClawProcess {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  steps: Array<{ id: string; name: string; status: string }>;
  createdAt: string;
}

export class YonClawConnector extends BaseConnector {
  constructor(connection: Connection) {
    if (connection.type !== 'yonclaw') {
      throw new Error(`YonClawConnector requires type 'yonclaw', got '${connection.type}'`);
    }
    super(connection);
  }

  // ── 生命周期 ──

  async connect(): Promise<void> {
    const result = await this.healthCheck();
    if (!result.healthy) {
      throw new Error(`YonClaw connection failed: ${result.error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
  }

  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const start = Date.now();
    try {
      const ep = this.getEndpoint();
      // YonClaw 健康检查端点
      const res = await fetch(`${ep}/health`, {
        method: 'GET',
        headers: { ...(this.getAuthHeader()) },
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      if (res.ok || res.status === 404) {
        // 404 说明服务端存在，只是没有 /health 端点
        return { healthy: true, latency };
      }
      return { healthy: false, latency, error: `HTTP ${res.status}` };
    } catch (err: unknown) {
      return { healthy: false, latency: Date.now() - start, error: err.message };
    }
  }

  // ── 技能发现（YonClaw 特有）─

  /** 发现平台上的技能 */
  async discoverSkills(): Promise<YonClawSkill[]> {
    const ep = this.getEndpoint();
    return this.fetchJson<{ skills: YonClawSkill[] }>(`${ep}/skills`).then((r) => r.skills);
  }

  /** 获取单个技能详情 */
  async getSkill(skillId: string): Promise<YonClawSkill> {
    const ep = this.getEndpoint();
    return this.fetchJson<YonClawSkill>(`${ep}/skills/${skillId}`);
  }

  /** 调用技能 */
  async invokeSkill(skillId: string, input: Record<string, unknown>): Promise<unknown> {
    const ep = this.getEndpoint();
    return this.fetchJson<unknown>(`${ep}/skills/${skillId}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }

  // ── 流程编排（YonClaw 特有）─

  /** 启动流程 */
  async startProcess(processName: string, params?: Record<string, unknown>): Promise<YonClawProcess> {
    const ep = this.getEndpoint();
    return this.fetchJson<YonClawProcess>(`${ep}/processes`, {
      method: 'POST',
      body: JSON.stringify({ name: processName, params }),
    });
  }

  /** 查询流程状态 */
  async getProcessStatus(processId: string): Promise<YonClawProcess> {
    const ep = this.getEndpoint();
    return this.fetchJson<YonClawProcess>(`${ep}/processes/${processId}`);
  }

  /** 流式查询流程执行日志 */
  async *streamProcessLogs(processId: string): AsyncGenerator<string> {
    const ep = this.getEndpoint();
    yield* this.fetchStream(`${ep}/processes/${processId}/logs/stream`, {});
  }

  // ── 智能体能力（覆盖基类）─

  async listAgents(): Promise<Array<Record<string, unknown>>> {
    // YonClaw 中智能体通过技能发现
    const skills = await this.discoverSkills();
    return skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      version: s.version,
      tags: s.tags,
    }));
  }

  async getAgent(id: string): Promise<Record<string, unknown>> {
    const skill = await this.getSkill(id);
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      status: skill.status,
      version: skill.version,
      tags: skill.tags,
    };
  }

  async invokeAgent(input: AgentInvokeInput): Promise<AgentInvokeResult> {
    const result = await this.invokeSkill(input.agentId, {
      command: input.command,
      context: input.context,
      sessionId: input.sessionId,
    });
    const r = result as Record<string, unknown>;
    return {
      message: String(r.message || r.output || JSON.stringify(result)),
      data: r.data as Record<string, unknown> | undefined,
      suggestedCommands: Array.isArray(r.suggestedCommands) ? r.suggestedCommands as string[] : undefined,
      sessionId: input.sessionId || (r.sessionId as string | undefined),
    };
  }

  async *streamAgent(input: AgentInvokeInput): AsyncGenerator<string, AgentInvokeResult> {
    const ep = this.getEndpoint();
    const body = {
      input: {
        command: input.command,
        context: input.context,
        sessionId: input.sessionId,
      },
      stream: true,
    };

    yield* this.fetchStream(`${ep}/skills/${input.agentId}/invoke`, body);

    return {
      message: '',
      sessionId: input.sessionId || '',
    };
  }

  // ── 大模型能力（YonClaw 内置 LLM）─

  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<string> {
    const ep = this.getEndpoint();
    const res = await this.fetchJson<{ message: string }>(`${ep}/llm/chat`, {
      method: 'POST',
      body: JSON.stringify({ messages, options }),
    });
    return res.message;
  }

  async *streamChat(messages: ChatMessage[], options?: LLMOptions): AsyncGenerator<string> {
    const ep = this.getEndpoint();
    yield* this.fetchStream(`${ep}/llm/chat`, { messages, options, stream: true });
  }

  // ── 驾驶舱能力 ──

  async planCockpit(request: CockpitPlanRequest): Promise<CockpitPlanResult> {
    const ep = this.getEndpoint();
    return this.fetchJson<CockpitPlanResult>(`${ep}/cockpits/plan`, {
      method: 'POST',
      body: JSON.stringify({ goal: request.goal, constraints: request.constraints, context: request.context }),
    });
  }

  async createCockpit(spec: CockpitSpec): Promise<Record<string, unknown>> {
    const ep = this.getEndpoint();
    return this.fetchJson<Record<string, unknown>>(`${ep}/cockpits`, {
      method: 'POST',
      body: JSON.stringify(spec),
    });
  }

  async executeOnCockpit(workspaceId: string, command: string, params?: Record<string, unknown>): Promise<unknown> {
    const ep = this.getEndpoint();
    return this.fetchJson<unknown>(`${ep}/cockpits/${workspaceId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ command, params }),
    });
  }

  // ── 事件（SSE 长连接）─

  async subscribeEvents(handler: (event: PlatformEvent) => void): Promise<() => void> {
    const ep = this.getEndpoint();
    const res = await fetch(`${ep}/events/subscribe`, {
      method: 'GET',
      headers: {
        ...(this.getAuthHeader()),
        'Accept': 'text/event-stream',
      },
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
                source: this.connectionId,
                sourceType: 'yonclaw',
                type: data.type || 'unknown',
                payload: data.payload || data,
                timestamp: new Date().toISOString(),
              });
            } catch {
              // ignore
            }
          }
        } catch {
          break;
        }
      }
    };

    readLoop();

    return () => {
      running = false;
      reader.cancel().catch(() => {});
    };
  }
}
