// ─── CockpitMetaAgent ───
// 让驾驶舱对外暴露为可被调用的智能体（Meta-Agent）
// 兼容 OpenClaw / YonClaw Agent Protocol，支持 Tool Calling

import type { CockpitAgent } from '../agent/cockpit-agent';
import { recognizeIntent } from '../agent/intent';
import { planTasks } from '../agent/planner';
import type { ConnectionManager } from '../connection/manager';
import * as workspaceStore from '../data/workspaceStore';
import { eventBus } from './event-bus';
import type { Connection } from '../connection/types';

// ── 工具定义 ──

export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}

export interface AgentMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  tools: ToolDefinition[];
  status: 'active' | 'idle' | 'error';
}

export interface ToolInvokeRequest {
  tool: string;
  parameters: Record<string, unknown>;
  sessionId?: string;
  workspaceId?: string;
}

export interface ToolInvokeResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

export interface AgentInvokeRequest {
  command: string;
  context?: Record<string, unknown>;
  sessionId?: string;
  workspaceId?: string;
  tools?: string[];  // 指定允许使用的工具
}

export interface AgentInvokeResult {
  message: string;
  toolCalls?: Array<{ tool: string; parameters: Record<string, unknown>; result: unknown }>;
  data?: unknown;
  sessionId: string;
}

// ── 驾驶舱工具定义 ──

const COCKPIT_TOOLS: ToolDefinition[] = [
  {
    name: 'cockpit_plan',
    description: '根据业务目标规划一个新的智能驾驶舱，包括布局、组件、数据源建议',
    parameters: {
      goal: { type: 'string', description: '业务目标描述，例如：销售分析、客户管理、库存监控', required: true },
      constraints: { type: 'string', description: '约束条件，可选', required: false },
    },
  },
  {
    name: 'cockpit_create',
    description: '创建智能驾驶舱',
    parameters: {
      name: { type: 'string', description: '驾驶舱名称', required: true },
      description: { type: 'string', description: '驾驶舱描述', required: false },
      icon: { type: 'string', description: '图标标识', required: false },
      color: { type: 'string', description: '主题色', required: false },
      agentIds: { type: 'string', description: '关联智能体ID列表，逗号分隔', required: false },
    },
  },
  {
    name: 'cockpit_execute',
    description: '在指定驾驶舱中执行命令（查询数据、对话、简单操作）。注意：此工具不会创建新驾驶舱，只操作已有驾驶舱。',
    parameters: {
      workspaceId: { type: 'string', description: '驾驶舱ID', required: true },
      command: { type: 'string', description: '要执行的命令，例如：查看KPI、分析趋势、刷新数据', required: true },
    },
  },
  {
    name: 'cockpit_update',
    description: '更新已有驾驶舱：添加组件、删除组件、修改组件数据、修改驾驶舱配置（名称、描述、颜色等）',
    parameters: {
      workspaceId: { type: 'string', description: '驾驶舱ID', required: true },
      action: { type: 'string', description: '操作类型：add_widget(添加组件) | remove_widget(删除组件) | update_widget(修改组件) | update_config(修改配置)', required: true, enum: ['add_widget', 'remove_widget', 'update_widget', 'update_config'] },
      widget: { type: 'string', description: '组件数据（JSON字符串），add_widget/update_widget时使用', required: false },
      widgetId: { type: 'string', description: '组件ID，remove_widget/update_widget时使用', required: false },
      config: { type: 'string', description: '配置数据（JSON字符串），update_config时使用，如 {"name":"新名称","color":"#ff0000"}', required: false },
    },
  },
  {
    name: 'cockpit_query',
    description: '查询驾驶舱数据和状态',
    parameters: {
      workspaceId: { type: 'string', description: '驾驶舱ID', required: true },
      query: { type: 'string', description: '查询内容', required: true },
    },
  },
  {
    name: 'cockpit_list',
    description: '列出所有驾驶舱',
    parameters: {},
  },
  {
    name: 'cockpit_schedule',
    description: '在驾驶舱中调度任务',
    parameters: {
      workspaceId: { type: 'string', description: '驾驶舱ID', required: true },
      taskName: { type: 'string', description: '任务名称', required: true },
      cron: { type: 'string', description: '定时表达式', required: false },
    },
  },
  {
    name: 'agent_list',
    description: '列出所有可用智能体（包括外部平台智能体）',
    parameters: {
      connectionId: { type: 'string', description: '指定连接ID，可选', required: false },
    },
  },
  {
    name: 'agent_invoke',
    description: '调用指定智能体执行命令',
    parameters: {
      agentId: { type: 'string', description: '智能体ID', required: true },
      command: { type: 'string', description: '命令内容', required: true },
      connectionId: { type: 'string', description: '指定连接ID，可选', required: false },
    },
  },
  {
    name: 'connection_list',
    description: '列出所有已配置的外部平台连接',
    parameters: {},
  },
  {
    name: 'connection_test',
    description: '测试指定连接的可用性',
    parameters: {
      connectionId: { type: 'string', description: '连接ID', required: true },
    },
  },
];

// ── CockpitMetaAgent ──

export class CockpitMetaAgent {
  private meta: AgentMeta;

  constructor(
    private cockpitAgent: CockpitAgent,
    private connectionManager: ConnectionManager
  ) {
    this.meta = {
      id: 'yoncockpit-meta-agent',
      name: 'YonCockpit 智能驾驶舱',
      description: '一个智能驾驶舱 Meta-Agent，具备驾驶舱规划、创建、执行、调度能力，同时可编排多个外部智能体协同工作。',
      version: '1.0.0',
      capabilities: [
        'cockpit-plan',
        'cockpit-create',
        'cockpit-execute',
        'cockpit-query',
        'agent-orchestration',
        'event-subscribe',
        'tool-calling',
      ],
      tools: COCKPIT_TOOLS,
      status: 'active',
    };
  }

  // ── 元信息 ──

  getMeta(): AgentMeta {
    return { ...this.meta };
  }

  getTools(): ToolDefinition[] {
    return [...this.meta.tools];
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.meta.tools.find((t) => t.name === name);
  }

  // ── 工具调用 ──

  async invokeTool(request: ToolInvokeRequest): Promise<ToolInvokeResult> {
    const { tool, parameters, sessionId } = request;
    const toolDef = this.getTool(tool);
    if (!toolDef) {
      return { success: false, message: '', error: `Tool not found: ${tool}` };
    }

    // 验证必需参数
    for (const [key, param] of Object.entries(toolDef.parameters)) {
      if (param.required && parameters[key] === undefined) {
        return { success: false, message: '', error: `Missing required parameter: ${key}` };
      }
    }

    try {
      const result = await this.executeToolInternal(tool, parameters, sessionId);
      return {
        success: true,
        message: typeof result === 'string' ? result : JSON.stringify(result),
        data: result,
      };
    } catch (err: any) {
      return {
        success: false,
        message: '',
        error: err.message || `Tool execution failed: ${tool}`,
      };
    }
  }

  // ── 智能体调用（OpenClaw/YonClaw 兼容）─

  async handleInvoke(request: AgentInvokeRequest): Promise<AgentInvokeResult> {
    const { command, context, sessionId, workspaceId } = request;
    const sid = sessionId || `session-${Date.now()}`;

    // 1. 分析命令，判断需要调用哪些工具
    const toolCalls = await this.analyzeCommand(command, request.tools);

    // 2. 执行工具调用
    const results: Array<{ tool: string; parameters: Record<string, unknown>; result: unknown }> = [];
    for (const call of toolCalls) {
      const result = await this.invokeTool({
        tool: call.tool,
        parameters: call.parameters,
        sessionId: sid,
        workspaceId,
      });
      results.push({
        tool: call.tool,
        parameters: call.parameters,
        result: result.success ? result.data : { error: result.error },
      });
    }

    // 3. 如果没有匹配的工具，通过 CockpitAgent 处理
    let message = '';
    if (toolCalls.length === 0) {
      const agentResult = await this.cockpitAgent.handleCommand(command, {
        workspaceId,
        sessionId: sid,
        history: context ? [{ role: 'user', content: JSON.stringify(context) }] : [],
      });
      message = agentResult.message;
    } else {
      // 生成汇总消息
      message = this.summarizeToolResults(command, results);
    }

    return {
      message,
      toolCalls: results,
      sessionId: sid,
    };
  }

  // ── 注册到外部平台 ──

  /** 注册到 OpenClaw 平台 */
  async registerToOpenClaw(openClawConnectorId: string): Promise<{ success: boolean; message: string }> {
    const connector = this.connectionManager.getConnector(openClawConnectorId);
    if (!connector) {
      return { success: false, message: 'OpenClaw connector not found' };
    }

    // OpenClaw 注册端点（假设）
    try {
      const ep = (connector as any).getEndpoint?.() || '';
      const res = await fetch(`${ep}/agents/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(connector as any).getAuthHeader?.() || {},
        },
        body: JSON.stringify({
          id: this.meta.id,
          name: this.meta.name,
          description: this.meta.description,
          tools: this.meta.tools,
          endpoint: `http://localhost:3001/api/meta-agent`,
        }),
      });

      if (res.ok) {
        return { success: true, message: 'Registered to OpenClaw successfully' };
      }
      return { success: false, message: `Registration failed: HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  /** 注册到 YonClaw 平台 */
  async registerToYonClaw(yonClawConnectorId: string): Promise<{ success: boolean; message: string }> {
    const connector = this.connectionManager.getConnector(yonClawConnectorId);
    if (!connector) {
      return { success: false, message: 'YonClaw connector not found' };
    }

    try {
      const ep = (connector as any).getEndpoint?.() || '';
      const res = await fetch(`${ep}/skills/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(connector as any).getAuthHeader?.() || {},
        },
        body: JSON.stringify({
          id: this.meta.id,
          name: this.meta.name,
          description: this.meta.description,
          version: this.meta.version,
          tags: ['cockpit', 'meta-agent', 'orchestration'],
          endpoint: `http://localhost:3001/api/meta-agent`,
        }),
      });

      if (res.ok) {
        return { success: true, message: 'Registered to YonClaw successfully' };
      }
      return { success: false, message: `Registration failed: HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  // ── 内部方法 ──

  private async executeToolInternal(
    tool: string,
    params: Record<string, unknown>,
    sessionId?: string
  ): Promise<unknown> {
    switch (tool) {
      case 'cockpit_plan': {
        const llmConnector = this.connectionManager.getConnectorByCapability('llm-chat');
        if (llmConnector && llmConnector.planCockpit) {
          return llmConnector.planCockpit({
            goal: String(params.goal || ''),
            constraints: params.constraints ? [String(params.constraints)] : [],
          });
        }
        // fallback: 只规划不执行（避免 handleCommand 直接创建驾驶舱）
        const intent = await recognizeIntent(String(params.goal || ''), llmConnector || undefined);
        const plan = await planTasks(intent, {
          sessionId: sessionId || `session-${Date.now()}`,
        }, llmConnector || undefined);
        return {
          intent: intent.type,
          tasks: plan.tasks.map((t) => ({
            id: t.id,
            description: t.description,
            capability: t.capability,
            params: t.params,
          })),
          reasoning: plan.reasoning,
        };
      }

      case 'cockpit_create': {
        // agentIds 参数可能是逗号分隔的字符串，需要解析
        const rawAgentIds = params.agentIds;
        const agentIds: string[] = Array.isArray(rawAgentIds)
          ? rawAgentIds.map(String)
          : rawAgentIds
            ? String(rawAgentIds).split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        const primaryAgentId = params.primaryAgentId
          ? String(params.primaryAgentId)
          : (agentIds[0] || '');
        const spec = {
          name: String(params.name || ''),
          description: String(params.description || ''),
          icon: String(params.icon || 'Layers'),
          color: String(params.color || '#6366f1'),
          widgets: (params.widgets as any[]) || [],
          agentIds,
          primaryAgentId,
        };
        const ws = await workspaceStore.createWorkspace(spec);
        eventBus.publish({
          id: `evt-${Date.now()}`,
          source: 'meta-agent',
          sourceType: 'yonclaw',
          type: 'workspace.created',
          payload: { workspaceId: ws.id, name: ws.name },
          timestamp: new Date().toISOString(),
        });
        return ws;
      }

      case 'cockpit_execute': {
        const wsId = String(params.workspaceId || '');
        const cmd = String(params.command || '');

        // 获取目标驾驶舱
        const ws = await workspaceStore.getWorkspace(wsId);
        if (!ws) {
          return { message: `驾驶舱 ${wsId} 不存在`, error: 'Workspace not found' };
        }

        // 命令意图解析：在已有驾驶舱上下文中，避免触发 create_cockpit
        const lowerCmd = cmd.toLowerCase();
        const isAddWidget = /(添加|增加|新建|插入|需要|加|放).*(组件|widget|图表|指标|表格|看板|模块|面板)/.test(lowerCmd);
        const isRemoveWidget = /(删除|移除|去掉|删).*(组件|widget|图表|指标|表格|看板|模块|面板)/.test(lowerCmd);
        const isUpdateConfig = /(修改|更新|改名|换颜色|改).*(名称|描述|颜色|配置)/.test(lowerCmd);

        if (isAddWidget) {
          // 尝试用 LLM 解析复杂命令，提取结构化 widget 列表
          const llmConnector = this.connectionManager.getConnectorByCapability('llm-chat');
          let newWidgets: any[] = [];

          if (llmConnector && llmConnector.chat) {
            try {
              const existingWidgets = (ws.widgets || []).map((w: any) =>
                `  - ${w.title} (${w.type}): position={x:${w.position?.x},y:${w.position?.y},w:${w.position?.w},h:${w.position?.h}}`
              ).join('\n');

              const parsePrompt = `你是驾驶舱组件解析器。根据用户指令，提取要添加的所有组件，返回 JSON 数组。

当前驾驶舱已有组件：
${existingWidgets || '  (无)'}

【重要】组件类型(type)只允许以下 7 种标准值，不能自行发明其他类型：
- metric（指标/仪表/数据卡/数字）
- chart（图表/折线图/柱状图/饼图/趋势图）
- table（表格/数据表）
- kanban（看板/状态板/流程板）
- timeline（时间线/时间轴/里程碑）
- list（列表/事项/任务/清单）
- report（报告/总结/简报）

每种类型对应的 data 结构要求：
- metric:  {"value":"数值","change":"变化","trend":"up|down|flat"}
- chart:   {"labels":["标签1","标签2"],"values":[10,20]}
- table:   {"rows":[["列1","列2"],["数据A","数据B"]]}
- kanban:  {"stages":["待处理","进行中","已完成"]}
- timeline:{"steps":["步骤1","步骤2","步骤3"]}
- list:    {"items":["事项1","事项2"]}
- report:  {"summary":"摘要","highlights":[{"label":"指标","value":"数值"}]}

布局规则（网格 12 列宽）：
- metric: w=3 h=2
- chart/table/kanban/timeline/list: w=6 h=4
- report: w=9 h=4
- 位置需避免与现有组件重叠，y 坐标优先放在最下方空行

用户指令："""${cmd}"""

请只输出 JSON 数组，不要其他内容。确保 type 只能是上述 8 种标准值（含 universal）：
[
  {"type":"metric|chart|table|kanban|timeline|list|report|universal","title":"组件标题","position":{"x":0,"y":0,"w":3,"h":2},"data":{"value":"—","change":"+0%","trend":"flat"}},
  ...
]`;

              const parseResult = await llmConnector.chat([
                { role: 'system', content: '你是结构化数据解析器，只输出 JSON。' },
                { role: 'user', content: parsePrompt },
              ], { temperature: 0.1, maxTokens: 2048 });

              const parsed = this.tryParseJson(parseResult);
              if (Array.isArray(parsed) && parsed.length > 0) {
                newWidgets = parsed.map((w: any, i: number) => {
                  const normType = this.normalizeWidgetType(w.type);
                  const normData = this.normalizeWidgetData(w.data || this.defaultWidgetData(normType), normType);
                  return {
                    id: `w-${Date.now()}-${i}`,
                    type: normType,
                    title: String(w.title || '新组件'),
                    position: w.position || this.calcWidgetPosition(normType, existingWidgets, [], i),
                    data: normData,
                  };
                });
              }
            } catch (err: any) {
              console.warn('[MetaAgent] LLM widget parse failed:', err.message, '→ fallback to rule');
            }
          }

          // LLM 解析失败或不可用时，回退到规则解析（支持批量）
          if (newWidgets.length === 0) {
            newWidgets = this.parseWidgetsByRule(cmd, ws.widgets || []);
          }

          if (newWidgets.length === 0) {
            return { message: `未能从指令「${cmd}」中解析出组件，请使用 cockpit_update 工具精确添加。`, data: null };
          }

          const updated = await workspaceStore.updateWorkspace(wsId, {
            widgets: [...(ws.widgets || []), ...newWidgets],
          });

          if (newWidgets.length === 1) {
            return {
              message: `已在「${ws.name}」中添加 ${newWidgets[0].type} 组件「${newWidgets[0].title}」`,
              data: { widgets: newWidgets, workspace: updated },
            };
          }
          return {
            message: `已在「${ws.name}」中批量添加 ${newWidgets.length} 个组件：${newWidgets.map((w: any) => w.title).join('、')}`,
            data: { widgets: newWidgets, workspace: updated },
          };
        }

        if (isRemoveWidget) {
          // 尝试匹配组件标题或ID
          const titleMatch = cmd.match(/[删除移除去掉]\s*["']?([^"'，。]+?)["']?/);
          const targetTitle = titleMatch ? titleMatch[1].trim() : '';
          const widgets = ws.widgets || [];
          const idx = widgets.findIndex((w: any) =>
            w.title === targetTitle || w.id === targetTitle
          );
          if (idx >= 0) {
            const removed = widgets[idx];
            widgets.splice(idx, 1);
            const updated = await workspaceStore.updateWorkspace(wsId, { widgets });
            return { message: `已从「${ws.name}」中删除组件「${removed.title}」`, data: { removed, workspace: updated } };
          }
          return { message: `未找到组件「${targetTitle}」，驾驶舱「${ws.name}」现有组件：${widgets.map((w: any) => w.title).join('、')}` };
        }

        if (isUpdateConfig) {
          const updates: any = {};
          const nameMatch = cmd.match(/[叫 named]*["']?([^"'，。]+?)["']?\s*(驾驶舱|$)/);
          if (nameMatch) updates.name = nameMatch[1].trim();
          const updated = await workspaceStore.updateWorkspace(wsId, updates);
          return { message: `已更新驾驶舱「${ws.name}」的配置`, data: updated };
        }

        // 默认：查询/对话模式 —— 直接调用 LLM，不走 CockpitAgent（避免触发 create_cockpit）
        const llmConnector = this.connectionManager.getConnectorByCapability('llm-chat');
        if (llmConnector && llmConnector.chat) {
          const prompt = `用户正在驾驶舱「${ws.name}」中提问。驾驶舱信息：${ws.description || '无描述'}，组件：${(ws.widgets || []).map((w: any) => w.title).join('、') || '无'}。

用户问题：${cmd}

请基于驾驶舱上下文回答。如果用户要求查看数据，请说明当前是静态演示数据。`;
          const reply = await llmConnector.chat([
            { role: 'system', content: '你是智能驾驶舱助手，基于驾驶舱上下文回答用户问题。' },
            { role: 'user', content: prompt },
          ], { temperature: 0.5, maxTokens: 1024 });
          return { message: reply };
        }

        // LLM 不可用：fallback 到 adapter 或静态回复
        return { message: `收到指令「${cmd}」。当前驾驶舱「${ws.name}」包含 ${(ws.widgets || []).length} 个组件。` };
      }

      case 'cockpit_update': {
        const wsId = String(params.workspaceId || '');
        const action = String(params.action || '');
        const ws = await workspaceStore.getWorkspace(wsId);
        if (!ws) return { message: '', error: `驾驶舱 ${wsId} 不存在` };

        switch (action) {
          case 'add_widget': {
            // JSON 解析健壮化：支持 JSON 字符串、对象、数组
            let raw: unknown = null;
            if (params.widget) {
              const widgetStr = String(params.widget).trim();
              // 如果已经是对象/数组（非字符串 JSON），直接使用
              if (typeof params.widget === 'object') {
                raw = params.widget;
              } else {
                try {
                  raw = JSON.parse(widgetStr);
                } catch {
                  // 尝试修复常见的 JSON 格式错误（如单引号、尾部逗号）
                  try {
                    const fixed = widgetStr
                      .replace(/'/g, '"')
                      .replace(/,\s*([}\]])/g, '$1')
                      .replace(/([{,]\s*)(\w+):/g, '$1"$2":');
                    raw = JSON.parse(fixed);
                  } catch {
                    return { message: '', error: `widget 参数不是合法的 JSON 字符串：${widgetStr.slice(0, 100)}` };
                  }
                }
              }
            }
            if (!raw) return { message: '', error: 'widget 参数不能为空' };
            // 支持传入单个 widget 或 widget 数组
            const inputWidgets = Array.isArray(raw) ? raw : [raw];
            const newWidgets = inputWidgets.map((w: any, i: number) => {
              const normType = this.normalizeWidgetType(w.type);
              return {
                ...w,
                id: w.id || `w-${Date.now()}-${i}`,
                type: normType,
                title: String(w.title || '新组件'),
                position: w.position || this.calcWidgetPosition(normType, ws.widgets || [], [], i),
                data: this.normalizeWidgetData(w.data || this.defaultWidgetData(normType), normType),
              };
            });
            const updated = await workspaceStore.updateWorkspace(wsId, {
              widgets: [...(ws.widgets || []), ...newWidgets],
            });
            if (newWidgets.length === 1) {
              return { message: `已添加组件「${newWidgets[0].title}」`, data: updated };
            }
            return { message: `已批量添加 ${newWidgets.length} 个组件：${newWidgets.map((w: any) => w.title).join('、')}`, data: updated };
          }
          case 'remove_widget': {
            const widgetId = String(params.widgetId || '');
            const widgets = (ws.widgets || []).filter((w: any) => w.id !== widgetId);
            const updated = await workspaceStore.updateWorkspace(wsId, { widgets });
            return { message: `已删除组件 ${widgetId}`, data: updated };
          }
          case 'update_widget': {
            const widgetId = String(params.widgetId || '');
            const patch = params.widget ? JSON.parse(String(params.widget)) : {};
            const widgets = (ws.widgets || []).map((w: any) =>
              w.id === widgetId ? { ...w, ...patch } : w
            );
            const updated = await workspaceStore.updateWorkspace(wsId, { widgets });
            return { message: `已更新组件 ${widgetId}`, data: updated };
          }
          case 'update_config': {
            const config = params.config ? JSON.parse(String(params.config)) : {};
            const updated = await workspaceStore.updateWorkspace(wsId, config);
            return { message: `已更新驾驶舱配置`, data: updated };
          }
          default:
            return { message: '', error: `不支持的操作类型: ${action}` };
        }
      }

      case 'cockpit_query': {
        const wsId = String(params.workspaceId || '');
        const query = String(params.query || '');
        // 通过 agent-invoke 查询
        const connector = this.connectionManager.getConnectorByCapability('agent-invoke');
        if (connector && connector.invokeAgent) {
          return connector.invokeAgent({
            agentId: 'query-agent',
            command: query,
            context: { workspaceId: wsId },
            sessionId,
          });
        }
        return { message: `查询驾驶舱 ${wsId}: ${query}` };
      }

      case 'cockpit_list': {
        // 返回所有 workspace（通过 workspaceStore）
        const workspaces = await workspaceStore.listWorkspaces();
        return workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          description: w.description,
          icon: w.icon,
          color: w.color,
          status: w.status,
          createdAt: w.createdAt,
          agentCount: (w.agentIds || []).length,
          widgetCount: (w.widgets || []).length,
        }));
      }

      case 'cockpit_schedule': {
        return {
          taskId: `task-${Date.now()}`,
          workspaceId: String(params.workspaceId || ''),
          taskName: String(params.taskName || ''),
          status: 'scheduled',
          scheduledAt: new Date().toISOString(),
        };
      }

      case 'agent_list': {
        const connId = params.connectionId as string | undefined;
        if (connId) {
          const connector = this.connectionManager.getConnector(connId);
          if (connector && connector.listAgents) {
            return connector.listAgents();
          }
          return [];
        }
        // 聚合所有连接的 agent 列表
        const allAgents: any[] = [];
        for (const connector of this.connectionManager.getAllConnectors()) {
          if (connector.listAgents) {
            try {
              const agents = await connector.listAgents();
              allAgents.push(...agents.map((a: any) => ({ ...a, _source: connector.connectionId })));
            } catch { /* ignore */ }
          }
        }
        return allAgents;
      }

      case 'agent_invoke': {
        const connId = params.connectionId as string | undefined;
        const agentId = String(params.agentId || '');
        const command = String(params.command || '');

        let connector;
        if (connId) {
          connector = this.connectionManager.getConnector(connId);
        } else {
          connector = this.connectionManager.getConnectorByCapability('agent-invoke');
        }

        if (connector && connector.invokeAgent) {
          return connector.invokeAgent({
            agentId,
            command,
            sessionId,
          });
        }
        return { message: `无法调用智能体 ${agentId}：未找到可用连接` };
      }

      case 'connection_list': {
        return this.connectionManager.list();
      }

      case 'connection_test': {
        const result = await this.connectionManager.test(String(params.connectionId || ''));
        return result;
      }

      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  }

  private async analyzeCommand(
    command: string,
    allowedTools?: string[]
  ): Promise<Array<{ tool: string; parameters: Record<string, unknown> }>> {
    const lower = command.toLowerCase();
    const calls: Array<{ tool: string; parameters: Record<string, unknown> }> = [];

    // 简单规则匹配
    const toolPatterns: Array<{ tool: string; patterns: RegExp[]; extractParams: (cmd: string) => Record<string, unknown> }> = [
      {
        tool: 'cockpit_plan',
        patterns: [/规划.*驾驶舱|设计.*驾驶舱|搭建.*驾驶舱/],
        extractParams: (cmd) => ({ goal: cmd }),
      },
      {
        tool: 'cockpit_create',
        patterns: [/创建.*驾驶舱|新建.*驾驶舱|生成.*驾驶舱/],
        extractParams: (cmd) => {
          const nameMatch = cmd.match(/(?:叫|名为|名称是)"?([^"，。]+?)"?[，。\s]/);
          return { name: nameMatch ? nameMatch[1].trim() : '新驾驶舱', description: cmd };
        },
      },
      {
        tool: 'cockpit_execute',
        patterns: [/执行|运行|调度/],
        extractParams: (cmd) => {
          const wsMatch = cmd.match(/(?:驾驶舱|工作台)[\s:：]*([ws\-a-zA-Z0-9]+)/);
          return { command: cmd, workspaceId: wsMatch ? wsMatch[1].trim() : '' };
        },
      },
      {
        tool: 'cockpit_query',
        patterns: [/查询.*驾驶舱|查看.*驾驶舱|驾驶舱.*状态/],
        extractParams: (cmd) => {
          const wsMatch = cmd.match(/(?:驾驶舱|工作台)[\s:：]*([ws\-a-zA-Z0-9]+)/);
          return { query: cmd, workspaceId: wsMatch ? wsMatch[1].trim() : '' };
        },
      },
      {
        tool: 'cockpit_list',
        patterns: [/列出.*驾驶舱|所有.*驾驶舱|驾驶舱.*列表/],
        extractParams: () => ({}),
      },
      {
        tool: 'agent_list',
        patterns: [/列出.*智能体|所有.*智能体|智能体.*列表/],
        extractParams: () => ({}),
      },
      {
        tool: 'agent_invoke',
        patterns: [/调用.*智能体|让.*智能体/],
        extractParams: (cmd) => ({ command: cmd }),
      },
    ];

    for (const tp of toolPatterns) {
      for (const pattern of tp.patterns) {
        if (pattern.test(lower)) {
          if (!allowedTools || allowedTools.includes(tp.tool)) {
            calls.push({ tool: tp.tool, parameters: tp.extractParams(command) });
          }
          break;
        }
      }
    }

    return calls;
  }

  // ── 辅助：解析 LLM 返回的 JSON ──
  private tryParseJson(raw: string): unknown {
    try {
      const cleaned = raw.trim();
      const codeBlock = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      const jsonStr = codeBlock ? codeBlock[1].trim() : cleaned;
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : jsonStr);
    } catch {
      return null;
    }
  }

  // ── 辅助：标准化组件类型 ──
  private normalizeWidgetType(raw: string): string {
    const map: Record<string, string> = {
      'metric': 'metric', '指标': 'metric', '仪表': 'metric', '数据卡': 'metric',
      '数字': 'metric', 'kpi': 'metric', '指标卡': 'metric', '数值': 'metric',
      'chart': 'chart', '图表': 'chart', '折线图': 'chart', '柱状图': 'chart',
      '饼图': 'chart', '趋势图': 'chart', '统计图': 'chart', '可视化': 'chart',
      'table': 'table', '表格': 'table', '数据表': 'table', '明细表': 'table',
      'kanban': 'kanban', '看板': 'kanban', '状态板': 'kanban', '流程板': 'kanban',
      'board': 'kanban',
      'timeline': 'timeline', '时间线': 'timeline', '时间轴': 'timeline',
      '里程碑': 'timeline', '甘特图': 'timeline', '日程': 'timeline',
      'list': 'list', '列表': 'list', '事项': 'list', '任务': 'list',
      '清单': 'list', '待办': 'list', 'todo': 'list',
      'report': 'report', '报告': 'report', '总结': 'report', '简报': 'report',
      '汇报': 'report', '概览': 'report',
      'universal': 'universal', '通用': 'universal', '文本': 'universal', '内容': 'universal',
      '容器': 'universal', '富文本': 'universal', 'markdown': 'universal', 'md': 'universal',
    };
    const key = String(raw || '').toLowerCase().trim();
    return map[key] || 'metric';
  }

  // ── 辅助：规则解析批量组件 ──
  private parseWidgetsByRule(command: string, existingWidgets: any[]): any[] {
    const widgets: any[] = [];
    const lower = command.toLowerCase();

    // 支持顿号/逗号/分号分隔的多个组件
    const typeMap: Record<string, string> = {
      '指标': 'metric', 'metric': 'metric', '仪表': 'metric', '数据卡': 'metric',
      '图表': 'chart', 'chart': 'chart', '折线图': 'chart', '柱状图': 'chart', '饼图': 'chart', '趋势图': 'chart',
      '表格': 'table', 'table': 'table', '数据表': 'table',
      '看板': 'kanban', 'kanban': 'kanban', '状态板': 'kanban', '流程板': 'kanban',
      '时间线': 'timeline', 'timeline': 'timeline', '时间轴': 'timeline', '里程碑': 'timeline',
      '列表': 'list', 'list': 'list', '事项': 'list', '任务': 'list', '清单': 'list', '待办': 'list',
      '报告': 'report', 'report': 'report', '总结': 'report', '简报': 'report',
    };

    // 匹配 "添加[一个]XX[叫]YY" 模式（含更多类型同义词）
    const segmentPattern = /(?:添加|增加|新建|插入)\s*(?:一个|个)?\s*(?:\d+个)?\s*(指标|仪表|数据卡|metric|图表|折线图|柱状图|饼图|趋势图|chart|表格|数据表|table|看板|状态板|流程板|kanban|时间线|时间轴|里程碑|timeline|列表|事项|任务|清单|待办|list|报告|总结|简报|report)?\s*(?:叫|名为|named)?\s*["']?([^"'，；、。]+?)["']?/gi;

    let match;
    let idx = 0;
    while ((match = segmentPattern.exec(command)) !== null) {
      const typeKey = match[1] || 'metric';
      const title = match[2]?.trim() || '新组件';
      const type = this.normalizeWidgetType(typeKey);

      // 计算位置：避免重叠，放在最下方
      const pos = this.calcWidgetPosition(type, existingWidgets, widgets, idx);
      widgets.push({
        id: `w-${Date.now()}-${idx}`,
        type,
        title,
        position: pos,
        data: this.normalizeWidgetData(this.defaultWidgetData(type), type),
      });
      idx++;
    }

    return widgets;
  }

  // ── 辅助：计算组件位置（避免重叠）─
  private calcWidgetPosition(type: string, existing: any[], pending: any[], idx: number): { x: number; y: number; w: number; h: number } {
    const sizeMap: Record<string, { w: number; h: number }> = {
      metric: { w: 3, h: 2 },
      chart: { w: 6, h: 4 },
      table: { w: 6, h: 4 },
      kanban: { w: 6, h: 4 },
      timeline: { w: 9, h: 4 },
      list: { w: 6, h: 4 },
      report: { w: 9, h: 4 },
    };
    const { w, h } = sizeMap[type] || { w: 3, h: 2 };

    // 收集所有已占用的格子（现有 + 待添加）
    const all = [...existing, ...pending];
    const occupied = new Set<string>();
    for (const widget of all) {
      const p = widget.position || { x: 0, y: 0, w: 3, h: 2 };
      for (let dx = 0; dx < p.w; dx++) {
        for (let dy = 0; dy < p.h; dy++) {
          occupied.add(`${p.x + dx},${p.y + dy}`);
        }
      }
    }

    // 找最下方的空位（从左到右，从上到下扫描）
    for (let y = 0; y < 20; y += 2) {
      for (let x = 0; x <= 12 - w; x += 3) {
        let fits = true;
        for (let dx = 0; dx < w; dx++) {
          for (let dy = 0; dy < h; dy++) {
            if (occupied.has(`${x + dx},${y + dy}`)) {
              fits = false;
              break;
            }
          }
          if (!fits) break;
        }
        if (fits) return { x, y, w, h };
      }
    }

    //  fallback：放在最下方新行
    const maxY = all.reduce((m, w) => Math.max(m, (w.position?.y || 0) + (w.position?.h || 2)), 0);
    return { x: (idx * 3) % 12, y: maxY, w, h };
  }

  // ── 辅助：标准化组件 data 字段名（兼容 LLM 别名）──
  private normalizeWidgetData(data: Record<string, unknown>, type: string): Record<string, unknown> {
    if (!data || typeof data !== 'object') return this.defaultWidgetData(type);
    const d = { ...data };

    // chart: categories→labels, data/series→values
    if (type === 'chart') {
      if ('categories' in d && !('labels' in d)) d.labels = d.categories;
      if (('data' in d || 'series' in d) && !('values' in d)) d.values = d.data || d.series;
    }
    // kanban: statuses→stages, columns→stages, phases→stages
    if (type === 'kanban') {
      if ('statuses' in d && !('stages' in d)) d.stages = d.statuses;
      if ('columns' in d && !('stages' in d)) d.stages = d.columns;
      if ('phases' in d && !('stages' in d)) d.stages = d.phases;
    }
    // timeline: milestones→steps, events→steps, nodes→steps
    if (type === 'timeline') {
      if ('milestones' in d && !('steps' in d)) d.steps = d.milestones;
      if ('events' in d && !('steps' in d)) d.steps = d.events;
      if ('nodes' in d && !('steps' in d)) d.steps = d.nodes;
    }
    // list: tasks→items, entries→items, todos→items
    if (type === 'list') {
      if ('tasks' in d && !('items' in d)) d.items = d.tasks;
      if ('entries' in d && !('items' in d)) d.items = d.entries;
      if ('todos' in d && !('items' in d)) d.items = d.todos;
    }
    // table: records→rows, data→rows
    if (type === 'table') {
      if ('records' in d && !('rows' in d)) d.rows = d.records;
      if ('data' in d && !('rows' in d)) d.rows = d.data;
    }
    // report: keyPoints/metrics/stats→highlights
    if (type === 'report') {
      if ('keyPoints' in d && !('highlights' in d)) d.highlights = d.keyPoints;
      if ('metrics' in d && !('highlights' in d)) d.highlights = d.metrics;
      if ('stats' in d && !('highlights' in d)) d.highlights = d.stats;
      if ('overview' in d && !('highlights' in d)) d.highlights = d.overview;
      // highlights 数组内部字段标准化
      if (Array.isArray(d.highlights)) {
        d.highlights = (d.highlights as any[]).map((h: any) => ({
          label: h.label || h.name || h.title || h.key || '指标',
          value: h.value || h.val || h.num || h.amount || '—',
        }));
      }
    }
    // metric: 数值→value, 变化→change
    if (type === 'metric') {
      if ('数值' in d && !('value' in d)) d.value = d.数值;
      if ('变化' in d && !('change' in d)) d.change = d.变化;
    }

    return d;
  }

  // ── 辅助：默认组件数据 ──
  private defaultWidgetData(type: string): Record<string, unknown> {
    const defaults: Record<string, Record<string, unknown>> = {
      metric: { value: '—', change: '+0%', trend: 'up' },
      chart: { labels: ['类别A', '类别B', '类别C'], values: [10, 20, 30] },
      table: { rows: [['示例', '数据']] },
      kanban: { stages: ['待处理', '进行中', '已完成'] },
      timeline: { steps: ['步骤1', '步骤2', '步骤3'] },
      list: { items: ['事项1', '事项2'] },
      report: { summary: '报告摘要...', highlights: [{ label: '核心指标', value: '—' }] },
      universal: { content: '通用内容容器...' },
    };
    return defaults[type] || defaults.metric;
  }

  private summarizeToolResults(
    command: string,
    results: Array<{ tool: string; parameters: Record<string, unknown>; result: unknown }>
  ): string {
    const lines = [`已根据指令「${command}」执行以下操作：`];
    for (const r of results) {
      const toolLabel = r.tool.replace(/_/g, ' ');
      lines.push(`- ${toolLabel}: ${JSON.stringify(r.result).slice(0, 200)}`);
    }
    return lines.join('\n');
  }
}

// 全局单例
export let metaAgent: CockpitMetaAgent | null = null;

export function initMetaAgent(
  cockpitAgent: CockpitAgent,
  connectionManager: ConnectionManager
): CockpitMetaAgent {
  metaAgent = new CockpitMetaAgent(cockpitAgent, connectionManager);
  console.log('[MetaAgent] Initialized with', metaAgent.getTools().length, 'tools');
  return metaAgent;
}
