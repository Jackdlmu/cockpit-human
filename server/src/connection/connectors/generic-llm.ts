// ─── 通用大模型 Connector ───
// 兼容 OpenAI API 格式，支持流式与非流式对话
// 也支持任何兼容 /v1/chat/completions 的端点（本地 Ollama、vLLM 等）

import { BaseConnector } from './base';
import type { Connection, ChatMessage, LLMOptions, CockpitPlanRequest, CockpitPlanResult } from '../types';
import { executeTool } from '../../tools/registry';

export class GenericLLMConnector extends BaseConnector {
  constructor(connection: Connection) {
    if (connection.type !== 'generic-llm') {
      throw new Error(`GenericLLMConnector requires type 'generic-llm', got '${connection.type}'`);
    }
    super(connection);
  }

  async connect(): Promise<void> {
    const result = await this.healthCheck();
    if (!result.healthy) {
      throw new Error(`LLM connection failed: ${result.error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
  }

  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const start = Date.now();
    const ep = this.getEndpoint();
    try {
      // 尝试访问 models 列表端点（OpenAI 兼容）
      const res = await fetch(`${ep}/models`, {
        method: 'GET',
        headers: {
          ...(this.getAuthHeader()),
        },
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { healthy: true, latency };
    } catch (err: unknown) {
      const configModel = this.connection.config.model;
      if (!configModel) {
        return { healthy: false, latency: Date.now() - start, error: '未配置 model — 请在连接设置中填写模型名称（如 moonshot-v1-8k、gpt-4o）' };
      }
      // 某些端点可能没有 /models，尝试直接发一个短请求验证
      try {
        const res = await fetch(`${ep}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.getAuthHeader()),
          },
          body: JSON.stringify({
            model: configModel,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(8000),
        });
        const latency = Date.now() - start;
        if (res.status === 401) return { healthy: false, latency, error: '认证失败 (401) — API Key 无效或已过期' };
        if (res.ok || res.status === 400) return { healthy: true, latency };
        return { healthy: false, latency: Date.now() - start, error: `HTTP ${res.status}` };
      } catch (err2: unknown) {
        const is404 = err.message?.includes('404') || err2.message?.includes('404');
        const hint = is404
          ? ` — 请确认 endpoint 格式为 Base URL（如 https://api.openai.com/v1），而非完整路径`
          : '';
        return { healthy: false, latency: Date.now() - start, error: (err2.message || err.message || 'Unreachable') + hint };
      }
    }
  }

  // ── LLM 对话（支持 Tool Calling） ──

  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<string> {
    const ep = this.getEndpoint();
    const config = this.connection.config;
    const model = options?.model || config.model;
    if (!model) {
      throw new Error('未配置 model — 请在连接设置中填写模型名称（如 moonshot-v1-8k、gpt-4o）');
    }

    // Tool Calling 循环：最多 5 轮，避免无限循环
    const MAX_TOOL_ROUNDS = 5;
    let currentMessages = [...messages];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const body: Record<string, unknown> = {
        model,
        messages: currentMessages,
        temperature: options?.temperature ?? config.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? config.maxTokens ?? 2048,
        stream: false,
      };

      // 如果有工具定义，传递给 LLM
      if (options?.tools && options.tools.length > 0) {
        body.tools = options.tools;
        body.tool_choice = 'auto';
      }

      const res = await this.fetchJson<{
        choices: Array<{
          message: {
            content: string | null;
            reasoning_content?: string;
            tool_calls?: Array<{
              id: string;
              type: 'function';
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      }>(`${ep}/chat/completions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const choice = res.choices?.[0]?.message;
      if (!choice) {
        return '';
      }

      // 如果没有 tool_calls，直接返回 content
      if (!choice.tool_calls || choice.tool_calls.length === 0) {
        return choice.content ?? '';
      }

      // 有 tool_calls：将 assistant 的消息加入对话，然后执行工具
      // 注意：Kimi 等多轮 reasoning 模型需要保留 reasoning_content，否则后续请求会 400
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: choice.content || '',
        tool_calls: choice.tool_calls,
      };
      if (choice.reasoning_content) {
        assistantMsg.reasoning_content = choice.reasoning_content;
      }
      currentMessages.push(assistantMsg);

      // 执行每个工具调用，并将结果加入对话
      for (const call of choice.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          console.warn(`[GenericLLM] Failed to parse tool arguments for ${call.function.name}`);
        }

        console.log(`[GenericLLM] Tool call: ${call.function.name}(${JSON.stringify(args).slice(0, 200)})`);
        const result = await executeTool(call.function.name, args);
        console.log(`[GenericLLM] Tool result: ${result.success ? 'success' : 'failed'} — ${String(result.error || '').slice(0, 100)}`);

        currentMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result.success ? result.data : { error: result.error }),
        });
      }

      // 继续循环，让 LLM 基于工具结果生成最终回复
    }

    // 达到最大轮数，返回最后一轮的内容
    const lastAssistant = currentMessages.filter((m) => m.role === 'assistant').pop();
    return lastAssistant?.content ?? '';
  }

  async *streamChat(messages: ChatMessage[], options?: LLMOptions): AsyncGenerator<string> {
    const ep = this.getEndpoint();
    const config = this.connection.config;
    const model = options?.model || config.model;
    if (!model) {
      throw new Error('未配置 model — 请在连接设置中填写模型名称（如 moonshot-v1-8k、gpt-4o）');
    }

    const body = {
      model,
      messages,
      temperature: options?.temperature ?? config.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? config.maxTokens ?? 2048,
      stream: true,
    };

    yield* this.fetchStream(`${ep}/chat/completions`, body);
  }

  // ── 驾驶舱规划（通过 LLM）─

  async planCockpit(request: CockpitPlanRequest): Promise<CockpitPlanResult> {
    const systemPrompt = `你是一个智能驾驶舱规划专家。根据用户的业务目标，生成完整的驾驶舱配置方案。

你需要输出以下 JSON 格式：
{
  "plan": {
    "steps": [
      { "id": "1", "description": "步骤描述", "capability": "cockpit-create", "params": {} }
    ],
    "estimatedTime": 60
  },
  "cockpitSpec": {
    "name": "驾驶舱名称（简洁有力）",
    "description": "一句话描述驾驶舱用途",
    "icon": "BarChart3|UserPlus|CheckCircle|Monitor|Target|Layers",
    "color": "#hex色值（根据主题选合适的颜色）",
    "widgets": [
      { "type": "metric", "title": "指标卡标题", "position": {"x":0,"y":0,"w":3,"h":2}, "data": {"value":"示例值","change":"+10%","trend":"up"} },
      { "type": "chart", "title": "图表标题", "position": {"x":3,"y":0,"w":6,"h":4}, "data": {"labels":["A","B","C"],"values":[10,20,30]} },
      { "type": "table", "title": "表格标题", "position": {"x":0,"y":2,"w":6,"h":4}, "data": {"rows":[["列1","列2"]]} },
      { "type": "kanban", "title": "看板标题", "position": {"x":6,"y":0,"w":3,"h":4}, "data": {"stages":["阶段1","阶段2"]} },
      { "type": "timeline", "title": "时间线标题", "position": {"x":0,"y":0,"w":9,"h":4}, "data": {"steps":["步骤1✓","步骤2→"]} },
      { "type": "list", "title": "列表标题", "position": {"x":0,"y":0,"w":6,"h":4}, "data": {"items":["事项1","事项2"]} }
    ],
    "agentIds": ["sales-agent"],
    "primaryAgentId": "sales-agent"
  },
  "reasoning": "规划理由，说明为什么这样设计"
}

widget 布局规则：
- 网格是 12 列宽
- metric 卡宽 3 高 2
- chart/table/kanban/timeline/list 宽 6 高 4
- 合理排列，不要重叠
- 至少包含 2-4 个 widgets

icon 选择规则：
- 销售/业绩/数据 → BarChart3
- 人事/员工 → UserPlus
- 审批/流程 → CheckCircle
- 监控/系统 → Monitor
- 营销/目标 → Target
- 通用 → Layers

color 选择规则：
- 销售/业绩 → #6366f1（靛蓝）
- 人事/健康 → #10b981（翠绿）
- 财务/审批 → #f59e0b（琥珀）
- 监控/告警 → #ef4444（红色）
- 营销/创意 → #ec4899（粉色）
- 通用 → #8b5cf6（紫色）

名称约束（绝对遵守）：
- 名称必须是简洁的中文业务名称，如"销售分析驾驶舱"
- 禁止包含技术术语：ID、ws-xxx、conn-xxx、连接ID等
- 禁止包含英文代码、随机字符串
- 禁止以"在"、"从"、"对"等介词开头
- 正确示例："供应链监控中心"、"销售业绩驾驶舱"
- 错误示例："在ID为ws-xxx的驾驶舱"、"conn-xxx的驾驶舱"`;

    const userPrompt = `目标：${request.goal}\n约束：${(request.constraints ?? []).join('、') || '无'}`;

    const content = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3 }
    );

    try {
      const parsed = JSON.parse(content);
      // 确保有 plan.steps
      if (!parsed.plan?.steps) {
        parsed.plan = {
          steps: [
            { id: '1', description: `分析目标：${request.goal}`, capability: 'cockpit-plan' },
            { id: '2', description: '生成驾驶舱配置', capability: 'cockpit-create' },
          ],
        };
      }
      return parsed as CockpitPlanResult;
    } catch {
      return {
        plan: {
          steps: [
            { id: '1', description: `分析目标：${request.goal}`, capability: 'cockpit-plan' },
            { id: '2', description: '生成驾驶舱配置', capability: 'cockpit-create' },
          ],
        },
        reasoning: content.slice(0, 500),
      };
    }
  }
}
