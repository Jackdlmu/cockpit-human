// ─── CockpitMetaAgent ───
// 让驾驶舱对外暴露为可被调用的智能体（Meta-Agent）
// 兼容 OpenClaw / YonClaw Agent Protocol，支持 Tool Calling

import type { CockpitAgent } from '../agent/cockpit-agent';
import { recognizeIntent } from '../agent/intent';
import { planTasks } from '../agent/planner';
import type { ConnectionManager } from '../connection/manager';
import * as workspaceStore from '../data/workspaceStore';
import { eventBus } from './event-bus';
import { inferWidgetType } from './widget-type-inferer';
import type { Connection } from '../connection/types';
import { createWorkspaceWithLifecycle } from './workspace-creation';
import { normalizeWidgetDataPayload, normalizeWidgets } from './widget-normalizer';
import { contextBuilder } from './context-builder';
import { applyRecommendedWidgetData, recommendWidgetSize, recommendWidgetType } from './widget-recommendation';

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

interface ExternalSyncWidgetPatch {
  id?: string;
  title?: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number; w: number; h: number };
  dataSource?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  link?: Record<string, unknown>;
}

interface ExternalSyncPayload {
  summary?: string;
  widgets?: ExternalSyncWidgetPatch[];
  workspacePatch?: Record<string, unknown>;
  appendWidgets?: ExternalSyncWidgetPatch[];
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
    description: '创建智能驾驶舱。面向外部智能体调用时，默认采用外部主控模式：外部智能体负责规划、取数、补组件和写数据，本地驾驶舱仅负责落库、渲染与兜底。',
    parameters: {
      name: { type: 'string', description: '驾驶舱名称', required: true },
      description: { type: 'string', description: '驾驶舱描述', required: false },
      icon: { type: 'string', description: '图标标识', required: false },
      color: { type: 'string', description: '主题色', required: false },
      agentIds: { type: 'string', description: '关联智能体ID列表，逗号分隔', required: false },
      widgets: { type: 'string', description: '可选，完整组件列表（JSON 字符串或数组）。如果外部智能体已经完成规划或取数，建议直接传入组件及其 data。每个组件可包含可选 "group" 字段来指定所属分组（如 "group": "财务指标"），系统会根据 group 字段自动进行组件分组展示。组件还可包含可选 "link" 字段配置点击穿透行为：link = { type: "workspace|widget|url", targetId?: "...", url?: "...", title?: "...", openMode?: "drawer|blank|self" }，其中 openMode=drawer（默认）打开浮层面板，blank 新标签页，self 当前页跳转。', required: false },
      connectionId: { type: 'string', description: '外部平台连接ID。传入后会记录为该驾驶舱的外部主控来源。', required: false },
      provider: { type: 'string', description: '外部平台类型，如 yonclaw / openclaw。', required: false },
      executionOwner: { type: 'string', description: '执行主导方：external 或 cockpit。外部集成默认推荐 external。', required: false, enum: ['external', 'cockpit'] },
      externalWorkspaceId: { type: 'string', description: '外部平台中的驾驶舱/任务ID，可选，用于建立双向映射。', required: false },
      useDemoDataFallback: { type: 'string', description: '是否允许演示数据兜底。外部主控场景默认 false。', required: false },
    },
  },
  {
    name: 'cockpit_execute',
    description: '在指定驾驶舱中执行命令（查询数据、对话、简单操作）。注意：此工具不会创建新驾驶舱，只操作已有驾驶舱。对于 YonClaw / OpenClaw 外部主控场景，应优先由外部智能体自己完成取数与分析，再使用 cockpit_update 写回组件与数据；本工具更适合本地兜底或显式刷新。',
    parameters: {
      workspaceId: { type: 'string', description: '驾驶舱ID', required: true },
      command: { type: 'string', description: '要执行的命令，例如：查看KPI、分析趋势、刷新数据', required: true },
    },
  },
  {
    name: 'cockpit_update',
    description: '更新已有驾驶舱：添加组件、删除组件、修改组件数据、修改驾驶舱配置（名称、描述、颜色等）。如果外部智能体已经拿到真实数据，应该优先通过此工具直接写回组件和 data，而不是依赖本地驾驶舱再次去外部取数。',
    parameters: {
      workspaceId: { type: 'string', description: '驾驶舱ID', required: true },
      action: { type: 'string', description: '操作类型：add_widget(添加组件) | remove_widget(删除组件) | update_widget(修改组件) | update_config(修改配置)', required: true, enum: ['add_widget', 'remove_widget', 'update_widget', 'update_config'] },
      widget: { type: 'string', description: '组件数据（JSON字符串），add_widget/update_widget时使用。建议将真实数据写入 widget.data；如果误写在顶层字段，系统会自动尝试归并。支持 link 字段配置点击穿透：link = { type: "workspace|widget|url", targetId?: "...", url?: "...", title?: "...", openMode?: "drawer|blank|self" }', required: false },
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
      description: '一个智能驾驶舱 Meta-Agent，具备驾驶舱规划、创建、执行、调度能力，支持驾驶舱组件智能分组（页签/流式/混合模式），同时可编排多个外部智能体协同工作。',
      version: '1.0.0',
      capabilities: [
        'cockpit-plan',
        'cockpit-create',
        'cockpit-execute',
        'cockpit-query',
        'agent-orchestration',
        'event-subscribe',
        'tool-calling',
        'widget-grouping',
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

  private async rebuildWorkspaceContextIfPresent(workspace: unknown): Promise<void> {
    if (!workspace || typeof workspace !== 'object') return;
    const candidate = workspace as { id?: string };
    if (!candidate.id) return;
    const refreshed = await workspaceStore.getWorkspace(String(candidate.id));
    if (refreshed) {
      await contextBuilder.build(refreshed);
    }
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
        const externalManaged = this.isExternalManagedCreate(params);
        const externalConnectionId = params.connectionId ? String(params.connectionId) : undefined;
        const externalProvider = this.resolveExternalProvider(externalConnectionId, params.provider);
        const widgets = this.parseWidgetsInput(params.widgets);
        const spec = {
          name: String(params.name || ''),
          description: String(params.description || ''),
          icon: String(params.icon || 'Layers'),
          color: String(params.color || '#6366f1'),
          widgets,
          agentIds,
          primaryAgentId,
          useDemoDataFallback: this.parseBoolean(params.useDemoDataFallback, externalManaged ? false : undefined),
          executionOwner: externalManaged ? 'external' as const : 'cockpit' as const,
          externalProvider,
          externalWorkspaceId: params.externalWorkspaceId ? String(params.externalWorkspaceId) : undefined,
          externalConnectionId,
        };
        const creation = await createWorkspaceWithLifecycle(spec, {
          source: 'meta-agent',
          connectionManager: this.connectionManager,
          resetAgentsWithoutConnection: true,
          skipLocalInitialization: externalManaged,
        });
        return creation.workspace;
      }

      case 'cockpit_execute': {
        const wsId = String(params.workspaceId || '');
        const cmd = String(params.command || '');

        // 获取目标驾驶舱
        const ws = await workspaceStore.getWorkspace(wsId);
        if (!ws) {
          return { message: `驾驶舱 ${wsId} 不存在`, error: 'Workspace not found' };
        }

        const externalExecution = await this.tryExecuteOnExternalWorkspace(ws, cmd, params, sessionId);
        if (externalExecution) {
          return externalExecution;
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
              const existingWidgetSummary = (ws.widgets || []).map((w: any) =>
                `  - ${w.title} (${w.type}): position={x:${w.position?.x},y:${w.position?.y},w:${w.position?.w},h:${w.position?.h}}`
              ).join('\n');

              const parsePrompt = `你是驾驶舱组件解析器。根据用户指令，提取要添加的所有组件，返回 JSON 数组。

当前驾驶舱已有组件：
${existingWidgetSummary || '  (无)'}

【重要】组件类型(type)只能使用以下标准值，不能自行发明其他类型：
- metric（指标/仪表/数据卡/数字）
- chart（图表/折线图/柱状图/饼图/趋势图）
- table（表格/数据表）
- kanban（看板/状态板/流程板）
- timeline（时间线/时间轴/里程碑）
- list（列表/事项/任务/清单）
- report（报告/总结/简报）
- progress（进度条）
- status（状态面板）
- html（HTML组件）
- gauge（仪表盘/进度盘）
- funnel（漏斗图/转化漏斗）
- radar（雷达图/蛛网图）
- heatmap（热力图/密度图）
- bullet（子弹图/目标进度）
- alert（告警列表/事件通知）
- map（地图/地理分布）
- adaptive（智能自适应容器/智能摘要面板）
- sparkline（迷你趋势图）

数据与视觉选择规则：
- 单值 KPI 用 metric；value+target 用 bullet；value+min/max 用 gauge；label+value 进度用 progress。
- 2-5 个分类占比用 chart，并在 data.styleConfig 写入 {"variant":"donut","donut":{"innerRatio":0.58,"maxSlices":5}}。
- 超过 5 个分类优先 chart bar；超过 10 个分类或需要明细查看时优先 table。
- rows/cells 且含 x/y/value 用 heatmap；stages/steps 含 value/rate 用 funnel；alerts/events 用 alert。
- HTML 正文必须用 html，并保留 data.html/data.detail.content/detailUrl/reportUrl，不要把完整 HTML 改写成摘要。
- summary/highlights/keyPoints 用 report；复杂多块摘要用 adaptive。

布局规则（网格 12 列宽）：
- metric/progress: w=3 h=2；多指标 metric 可 w=4 h=3。
- chart donut/bar: 至少 w=6 h=4，分类很多时 w=8 h=5。
- table: 常规 w=6 h=4，多列或多行 w=8-12 h=5-6。
- report/html: 常规 w=8 h=4，长报告/完整 HTML 用 w=12 h=6。
- timeline 可 w=8 h=4；heatmap/map/funnel/adaptive 建议 w=6-7 h=4。
- 位置需避免与现有组件重叠，y 坐标优先放在最下方空行

【关联/穿透配置（可选 link 字段）】
- link = { type: "workspace|widget|url", targetId?: "...", targetTemplate?: "...", url?: "https://...", title?: "...", openMode?: "drawer|blank|self" }
- openMode 说明：
  - drawer（默认）：点击后从右侧滑出浮层面板，用于在同页面内查看详情。适合 report/html 类型的"摘要 → 详情"穿透场景
  - blank：点击后在新浏览器标签页中打开目标页面。适合外部系统链接
  - self：点击后在当前页面内直接跳转。适合 workspace 类型跳转到其他驾驶舱
- 典型场景：
  1. html 组件生成报告摘要：data.html 放摘要/概览，配置 link = { type: "widget", openMode: "drawer", title: "查看报告详情" }，用户点击后浮层显示完整报告
  2. report 组件：data.summary 放摘要，配置 link = { type: "widget", openMode: "drawer", title: "查看完整报告" }
  3. 跳转到其他驾驶舱：link = { type: "workspace", targetId: "ws-xxx", openMode: "self" }
  4. 外部链接：link = { type: "url", url: "https://...", openMode: "blank" }

用户指令："""${cmd}"""

请只输出 JSON 数组，不要其他内容。确保 type 只能是上述标准值（含 universal、adaptive）：
[
  {"type":"metric|chart|table|kanban|timeline|list|report|progress|status|html|gauge|funnel|radar|heatmap|bullet|alert|map|sparkline|universal|adaptive","title":"组件标题","position":{"x":0,"y":0,"w":4,"h":2},"data":{}},
  ...
]`;

              const parseResult = await llmConnector.chat([
                { role: 'system', content: '你是结构化数据解析器，只输出 JSON。' },
                { role: 'user', content: parsePrompt },
              ], { temperature: 0.1, maxTokens: 2048 });

              const parsed = this.tryParseJson(parseResult);
              if (Array.isArray(parsed) && parsed.length > 0) {
                newWidgets = parsed
                  .filter((w: any) => w && typeof w === 'object')
                  .map((w: any, i: number) => {
                    const normType = this.normalizeWidgetType(w.type, w.data);
                    const normData = this.normalizeWidgetData(w.data || this.defaultWidgetData(normType), normType);
                    const finalType = recommendWidgetType(normType, normData);
                    const finalData = applyRecommendedWidgetData(finalType, normData);
                    // 防御 LLM/连接器返回异常 title（如字符数组或截断字符串）
                    let title = w.title;
                    if (Array.isArray(title)) title = title.join('');
                    title = String(title || '').trim();
                    if (title.length === 0 || title.length === 1) {
                      // 单字 title 尝试从指令上下文推断，否则使用类型默认名
                      title = this.widgetTypeLabel(finalType);
                    }
                    return {
                      id: `w-${Date.now()}-${i}`,
                      type: finalType,
                      title,
                      position: w.position || this.calcWidgetPosition(finalType, ws.widgets || [], [], i, finalData),
                      data: finalData,
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
          const widgetDesc = (ws.widgets || []).map((w: any) =>
            `- ${w.title}（${this.widgetTypeLabel(w.type)}）`
          ).join('\n') || '无';
          const prompt = `用户正在驾驶舱「${ws.name}」中提问。驾驶舱信息：${ws.description || '无描述'}。

当前组件列表：
${widgetDesc}

用户问题：${cmd}

请基于驾驶舱上下文回答。

【数据回答原则】
- 如果组件配置了 dataSource（数据源），请基于驾驶舱当前数据状态回答
- 如果组件是静态数据且用户要求获取真实/最新数据，请基于你的知识生成尽可能真实合理的数据，并说明数据来源
- 不要默认告知用户"当前是静态演示数据"，除非确实无法提供任何相关信息

【数据回填】
如果用户的查询结果可以填充到某个组件中（如查询天气、销售额等），请在回答末尾附加一个JSON代码块，格式如下，系统会自动将数据回填到对应组件：
\`\`\`json
{
  "widgets": [
    { "title": "组件标题", "data": { /* 该组件类型的数据字段 */ } }
  ]
}
\`\`\``;
          const reply = await llmConnector.chat([
            { role: 'system', content: '你是智能驾驶舱助手，基于驾驶舱上下文回答用户问题。支持将查询结果以JSON格式回填到组件。' },
            { role: 'user', content: prompt },
          ], { temperature: 0.5, maxTokens: 2048 });

          // 尝试从回复中提取 widget 数据更新
          const dataUpdate = this.tryExtractWidgetUpdate(reply, ws.widgets || []);
          if (dataUpdate && dataUpdate.length > 0) {
            const updatedWidgets = (ws.widgets || []).map((w: any) => {
              const patch = dataUpdate.find((u: any) => u.title === w.title);
              if (patch && patch.data && typeof patch.data === 'object') {
                return {
                  ...w,
                  data: this.normalizeWidgetData({ ...(w.data || {}), ...patch.data }, w.type),
                };
              }
              return w;
            });
            const updatedWorkspace = await workspaceStore.updateWorkspace(ws.id, { widgets: updatedWidgets });
            await this.rebuildWorkspaceContextIfPresent(updatedWorkspace);
            this.publishWorkspaceUpdated(ws.id, ws.name, 'meta-agent-query');
          }

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
              const lifted = this.liftWidgetPayload(w);
              const normType = this.normalizeWidgetType(lifted.type, lifted.data);
              const normData = this.normalizeWidgetData(lifted.data || this.defaultWidgetData(normType), normType);
              const finalType = recommendWidgetType(normType, normData);
              const finalData = applyRecommendedWidgetData(finalType, normData);
              return {
                ...lifted,
                id: lifted.id || `w-${Date.now()}-${i}`,
                type: finalType,
                title: String(lifted.title || '新组件'),
                position: lifted.position || this.calcWidgetPosition(finalType, ws.widgets || [], [], i, finalData),
                data: finalData,
              };
            });
            const updated = await workspaceStore.updateWorkspace(wsId, {
              widgets: [...(ws.widgets || []), ...newWidgets],
            });
            await this.rebuildWorkspaceContextIfPresent(updated);
            this.publishWorkspaceUpdated(wsId, ws.name, 'meta-agent-update');
            if (newWidgets.length === 1) {
              return { message: `已添加组件「${newWidgets[0].title}」`, data: updated };
            }
            return { message: `已批量添加 ${newWidgets.length} 个组件：${newWidgets.map((w: any) => w.title).join('、')}`, data: updated };
          }
          case 'remove_widget': {
            const widgetId = String(params.widgetId || '');
            const widgets = (ws.widgets || []).filter((w: any) => w.id !== widgetId);
            const updated = await workspaceStore.updateWorkspace(wsId, { widgets });
            await this.rebuildWorkspaceContextIfPresent(updated);
            this.publishWorkspaceUpdated(wsId, ws.name, 'meta-agent-update');
            return { message: `已删除组件 ${widgetId}`, data: updated };
          }
          case 'update_widget': {
            const widgetId = String(params.widgetId || '');
            const patch = params.widget ? JSON.parse(String(params.widget)) : {};

            // 将已知的 widget data 字段自动包装到 data 中，兼容 cockpit_update 写顶层字段的调用方式
            const knownDataFields = new Set([
              'value', 'change', 'trend', 'caption', 'variant', 'accentColor', 'status',
              'labels', 'values', 'categories', 'data', 'series', 'datasets', 'names', 'xaxis', 'xAxis', 'yaxis', 'yAxis',
              'rows', 'columns', 'records', 'entries',
              'stages', 'statuses', 'columns', 'phases',
              'steps', 'milestones', 'events', 'nodes',
              'items', 'tasks', 'todos',
              'summary', 'highlights', 'keyPoints', 'metrics', 'stats', 'overview', 'detail', 'fullContent', 'detailContent', 'content', 'html', 'detailHtml', 'fullHtml', 'htmlContent', 'reportHtml',
              'detailUrl', 'reportUrl', 'htmlUrl', 'reportPath', 'htmlPath', 'filePath', 'reportFile', 'fileName', 'filename',
              'label', 'color', 'colors', 'metric', 'primaryMetric', 'headline', 'sections', 'blocks', 'cards',
              'min', 'max', 'unit', 'thresholds', 'percentage', 'percent', 'current',
              'indicators', 'dimensions', 'scores',
              'cells', 'cellData',
              'target', 'ranges', 'goal',
              'alerts', 'notifications', 'message', 'severity', 'level', 'time', 'timestamp',
              'points', 'locations', 'regions', 'cities',
              'sparkline', 'compareValue', 'compareLabel', 'previous',
              'subtitle', 'title', 'body',
            ]);
            const dataPatch: Record<string, unknown> = {};
            const topPatch: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(patch)) {
              if (knownDataFields.has(key)) {
                dataPatch[key] = val;
              } else {
                topPatch[key] = val;
              }
            }

            const widgets = (ws.widgets || []).map((w: any) => {
              if (w.id !== widgetId) return w;
              // 合并 data：patch.data 优先，其次是自动提取的 dataPatch
              const mergedData = this.normalizeWidgetData(
                { ...(w.data || {}), ...dataPatch, ...(patch.data || {}) },
                w.type
              );
              const result = { ...w, ...topPatch };
              if (Object.keys(mergedData).length > 0) {
                result.data = mergedData;
              }
              return result;
            });
            const updated = await workspaceStore.updateWorkspace(wsId, { widgets });
            await this.rebuildWorkspaceContextIfPresent(updated);
            this.publishWorkspaceUpdated(wsId, ws.name, 'meta-agent-update');
            return { message: `已更新组件 ${widgetId}`, data: updated };
          }
          case 'update_config': {
            const config = params.config ? JSON.parse(String(params.config)) : {};
            const updated = await workspaceStore.updateWorkspace(wsId, config);
            await this.rebuildWorkspaceContextIfPresent(updated);
            this.publishWorkspaceUpdated(wsId, ws.name, 'meta-agent-update');
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
      // 精确提取最外层的 JSON 数组：找第一个 '[' 和与之匹配的最后一个 ']'
      const start = jsonStr.indexOf('[');
      if (start === -1) return null;
      let depth = 0;
      let end = -1;
      for (let i = start; i < jsonStr.length; i++) {
        if (jsonStr[i] === '[') depth++;
        else if (jsonStr[i] === ']') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      const target = end > start ? jsonStr.slice(start, end + 1) : jsonStr;
      return JSON.parse(target);
    } catch {
      return null;
    }
  }

  // ── 辅助：从 LLM 回复中提取 widget 数据更新 ──
  private tryExtractWidgetUpdate(reply: string, widgets: any[]): Array<{ title: string; data: Record<string, unknown> }> | null {
    try {
      // 尝试提取 ```json ... ``` 代码块中的对象
      const codeMatch = reply.match(/```json\s*\n?([\s\S]*?)\n?```/);
      const jsonStr = codeMatch ? codeMatch[1].trim() : reply;
      // 找第一个 { 和匹配的 }
      const start = jsonStr.indexOf('{');
      if (start === -1) return null;
      let depth = 0;
      let end = -1;
      for (let i = start; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++;
        else if (jsonStr[i] === '}') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end <= start) return null;
      const parsed = JSON.parse(jsonStr.slice(start, end + 1));
      if (!parsed || !Array.isArray(parsed.widgets)) return null;
      const result: Array<{ title: string; data: Record<string, unknown> }> = [];
      for (const w of parsed.widgets) {
        if (w.title && typeof w.data === 'object' && w.data !== null) {
          // 按 title 匹配现有 widget
          const matched = widgets.find((existing: any) => existing.title === w.title);
          if (matched) {
            result.push({ title: w.title, data: w.data as Record<string, unknown> });
          }
        }
      }
      return result.length > 0 ? result : null;
    } catch {
      return null;
    }
  }

  private parseBoolean(value: unknown, fallback?: boolean): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return fallback;
  }

  private async tryExecuteOnExternalWorkspace(
    ws: Awaited<ReturnType<typeof workspaceStore.getWorkspace>>,
    command: string,
    params: Record<string, unknown>,
    sessionId?: string
  ): Promise<unknown | null> {
    if (!ws || ws.executionOwner !== 'external') {
      return null;
    }

    const externalWorkspaceId = ws.externalWorkspaceId || ws.id;
    const connector = ws.externalConnectionId
      ? this.connectionManager.getConnector(ws.externalConnectionId)
      : this.resolvePreferredExternalConnector(ws.externalProvider);

    if (!connector) {
      return {
        message: `驾驶舱「${ws.name}」标记为外部主控，但未找到可用的外部连接，本次未执行本地兜底。`,
        error: 'External connector not available',
      };
    }

    if (connector.executeOnCockpit) {
      const result = await connector.executeOnCockpit(externalWorkspaceId, command, {
        ...params,
        workspaceId: ws.id,
        externalWorkspaceId,
        sessionId,
      });

      const synced = await this.trySyncExternalExecutionResult(ws.id, ws.name, result);
      return {
        message: `已将命令优先路由至${this.externalProviderLabel(ws.externalProvider || connector.type)}执行${synced ? '，结果已同步回本地驾驶舱' : ''}。`,
        data: {
          route: 'external-cockpit',
          connectorId: connector.connectionId,
          connectorType: connector.type,
          externalWorkspaceId,
          executionResult: result,
          synced,
        },
      };
    }

    if (connector.invokeAgent) {
      const result = await connector.invokeAgent({
        agentId: ws.primaryAgentId || 'default',
        command,
        context: {
          ...params,
          workspaceId: ws.id,
          externalWorkspaceId,
        },
        sessionId,
      });

      const synced = await this.trySyncExternalExecutionResult(ws.id, ws.name, result);
      return {
        message: `已将命令优先路由至${this.externalProviderLabel(ws.externalProvider || connector.type)}智能体执行${synced ? '，结果已同步回本地驾驶舱' : ''}。`,
        data: {
          route: 'external-agent',
          connectorId: connector.connectionId,
          connectorType: connector.type,
          externalWorkspaceId,
          executionResult: result,
          synced,
        },
      };
    }

    return {
      message: `驾驶舱「${ws.name}」由外部平台主控，但当前连接不支持执行操作。`,
      error: 'External connector does not support execution',
    };
  }

  private resolvePreferredExternalConnector(provider?: string) {
    if (provider === 'yonclaw' || provider === 'openclaw' || provider === 'generic-llm') {
      return this.connectionManager.getAllConnectors().find((connector) => connector.type === provider);
    }
    return this.connectionManager.getConnectorByCapability('cockpit-execute')
      || this.connectionManager.getConnectorByCapability('agent-invoke');
  }

  private async trySyncExternalExecutionResult(workspaceId: string, workspaceName: string, result: unknown): Promise<boolean> {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return false;
    }

    const syncPayload = this.parseExternalSyncPayload(result);
    if (!syncPayload) {
      return false;
    }

    const current = await workspaceStore.getWorkspace(workspaceId);
    if (!current) return false;

    const widgetsById = new Map((current.widgets || []).map((widget: any) => [widget.id, widget]));
    const widgetsByTitle = new Map((current.widgets || []).map((widget: any) => [widget.title, widget]));

    const nextWidgets = (current.widgets || []).map((widget: any) => ({ ...widget }));
    let changed = false;

    for (const raw of syncPayload.widgets || []) {
      if (!raw || typeof raw !== 'object') continue;
      const lifted = this.liftWidgetPayload(raw as Record<string, unknown>);
      const byId = typeof lifted.id === 'string' ? widgetsById.get(lifted.id) : undefined;
      const byTitle = typeof lifted.title === 'string' ? widgetsByTitle.get(lifted.title) : undefined;
      const matched = byId || byTitle;
      if (!matched) continue;

      const targetIndex = nextWidgets.findIndex((widget: any) => widget.id === matched.id);
      if (targetIndex === -1) continue;

      const normalizedType = this.normalizeWidgetType(String(lifted.type || matched.type || ''), lifted.data || matched.data);
      const mergedData = this.normalizeWidgetData(
        { ...(matched.data || {}), ...((lifted.data as Record<string, unknown>) || {}) },
        normalizedType || matched.type
      );

      nextWidgets[targetIndex] = {
        ...matched,
        ...lifted,
        id: matched.id,
        type: normalizedType || matched.type,
        title: typeof lifted.title === 'string' && lifted.title.trim() ? lifted.title : matched.title,
        data: mergedData,
      };
      changed = true;
    }

    const appendWidgets = Array.isArray(syncPayload.appendWidgets)
      ? normalizeWidgets(
          syncPayload.appendWidgets
            .filter((widget) => widget && typeof widget === 'object')
            .map((widget) => {
              const lifted = this.liftWidgetPayload(widget as Record<string, unknown>);
              const type = this.normalizeWidgetType(String(lifted.type || ''), lifted.data);
              const data = this.normalizeWidgetData(lifted.data || this.defaultWidgetData(type), type);
              const finalType = recommendWidgetType(type, data);
              return {
                ...lifted,
                type: finalType,
                title: String(lifted.title || this.widgetTypeLabel(finalType)),
                data: applyRecommendedWidgetData(finalType, data),
              };
            }),
          { idPrefix: 'w' }
        )
      : [];

    if (appendWidgets.length > 0) {
      for (const widget of appendWidgets) {
        if (widgetsById.has(widget.id) || widgetsByTitle.has(widget.title)) {
          continue;
        }
        nextWidgets.push(widget);
        changed = true;
      }
    }

    const workspacePatch = syncPayload.workspacePatch && typeof syncPayload.workspacePatch === 'object'
      ? this.sanitizeWorkspacePatch(syncPayload.workspacePatch)
      : null;

    if (!changed && !workspacePatch) {
      return false;
    }

    await workspaceStore.updateWorkspace(workspaceId, {
      ...(workspacePatch || {}),
      widgets: nextWidgets,
    });
    const updatedWorkspace = await workspaceStore.getWorkspace(workspaceId);
    if (updatedWorkspace) {
      await contextBuilder.build(updatedWorkspace);
    }
    this.publishWorkspaceUpdated(workspaceId, workspaceName, 'meta-agent-external-sync');
    return true;
  }

  private parseExternalSyncPayload(result: unknown): ExternalSyncPayload | null {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return null;
    }

    const payload = result as Record<string, unknown>;

    // 正式协议：sync
    const sync = payload.sync;
    if (sync && typeof sync === 'object' && !Array.isArray(sync)) {
      const syncRecord = sync as Record<string, unknown>;
      return {
        summary: typeof syncRecord.summary === 'string' ? syncRecord.summary : undefined,
        widgets: Array.isArray(syncRecord.widgets) ? syncRecord.widgets as ExternalSyncWidgetPatch[] : [],
        workspacePatch: syncRecord.workspacePatch && typeof syncRecord.workspacePatch === 'object'
          ? syncRecord.workspacePatch as Record<string, unknown>
          : undefined,
        appendWidgets: Array.isArray(syncRecord.appendWidgets) ? syncRecord.appendWidgets as ExternalSyncWidgetPatch[] : [],
      };
    }

    // 兼容旧格式：顶层 widgets 或 data.widgets
    const widgets = Array.isArray(payload.widgets)
      ? payload.widgets as ExternalSyncWidgetPatch[]
      : (payload.data && typeof payload.data === 'object' && Array.isArray((payload.data as Record<string, unknown>).widgets))
        ? (payload.data as Record<string, unknown>).widgets as ExternalSyncWidgetPatch[]
        : [];

    const workspacePatch = payload.workspacePatch && typeof payload.workspacePatch === 'object'
      ? payload.workspacePatch as Record<string, unknown>
      : (payload.data && typeof payload.data === 'object' && (payload.data as Record<string, unknown>).workspacePatch && typeof (payload.data as Record<string, unknown>).workspacePatch === 'object')
        ? (payload.data as Record<string, unknown>).workspacePatch as Record<string, unknown>
        : undefined;

    const appendWidgets = Array.isArray(payload.appendWidgets)
      ? payload.appendWidgets as ExternalSyncWidgetPatch[]
      : (payload.data && typeof payload.data === 'object' && Array.isArray((payload.data as Record<string, unknown>).appendWidgets))
        ? (payload.data as Record<string, unknown>).appendWidgets as ExternalSyncWidgetPatch[]
        : [];

    if (widgets.length === 0 && appendWidgets.length === 0 && !workspacePatch) {
      return null;
    }

    return {
      summary: typeof payload.summary === 'string'
        ? payload.summary
        : (payload.data && typeof payload.data === 'object' && typeof (payload.data as Record<string, unknown>).summary === 'string')
          ? String((payload.data as Record<string, unknown>).summary)
          : undefined,
      widgets,
      workspacePatch,
      appendWidgets,
    };
  }

  private sanitizeWorkspacePatch(patch: Record<string, unknown>): Partial<Record<string, unknown>> {
    const allowedKeys = new Set([
      'name',
      'description',
      'icon',
      'color',
      'status',
      'useDemoDataFallback',
      'agentIds',
      'primaryAgentId',
      'agentMode',
      'externalWorkspaceId',
      'externalConnectionId',
      'externalProvider',
      'executionOwner',
    ]);

    const safePatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!allowedKeys.has(key) || key === 'widgets') continue;
      safePatch[key] = value;
    }
    return safePatch;
  }

  private externalProviderLabel(provider?: string): string {
    if (provider === 'yonclaw') return 'YonClaw';
    if (provider === 'openclaw') return 'OpenClaw';
    if (provider === 'generic-llm') return '外部智能体平台';
    return '外部平台';
  }

  private isExternalManagedCreate(params: Record<string, unknown>): boolean {
    const executionOwner = typeof params.executionOwner === 'string'
      ? params.executionOwner.trim().toLowerCase()
      : '';
    if (executionOwner === 'cockpit') return false;
    if (executionOwner === 'external') return true;

    const managedBy = typeof params.managedBy === 'string'
      ? params.managedBy.trim().toLowerCase()
      : '';
    if (managedBy === 'cockpit' || managedBy === 'local' || managedBy === 'internal') return false;
    if (managedBy === 'yonclaw' || managedBy === 'openclaw' || managedBy === 'external') return true;

    if (params.externalWorkspaceId || params.externalDataProvided || params.skipLocalInitialization || params.connectionId || params.provider) {
      return true;
    }

    // Meta-Agent 本身主要面向外部平台调用。未显式声明时，默认采用外部主控模式。
    return true;
  }

  private resolveExternalProvider(connectionId?: string, provider?: unknown): 'yonclaw' | 'openclaw' | 'generic-llm' | 'other' | undefined {
    if (typeof provider === 'string') {
      const normalized = provider.trim().toLowerCase();
      if (normalized === 'yonclaw' || normalized === 'openclaw' || normalized === 'generic-llm') {
        return normalized;
      }
      if (normalized) return 'other';
    }

    if (!connectionId) return undefined;
    const connection = this.connectionManager.getConnector(connectionId as string);
    if (!connection) return undefined;
    if (connection.type === 'yonclaw' || connection.type === 'openclaw' || connection.type === 'generic-llm') {
      return connection.type;
    }
    return 'other';
  }

  private parseWidgetsInput(rawWidgets: unknown): any[] {
    if (!rawWidgets) return [];

    let parsed = rawWidgets;
    if (typeof rawWidgets === 'string') {
      try {
        parsed = JSON.parse(rawWidgets);
      } catch {
        return [];
      }
    }

    const list = Array.isArray(parsed) ? parsed : [parsed];
    const normalized = list
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const lifted = this.liftWidgetPayload(item as Record<string, unknown>);
        const type = this.normalizeWidgetType(String(lifted.type || ''), lifted.data);
        const data = this.normalizeWidgetData(lifted.data || this.defaultWidgetData(type), type);
        const finalType = recommendWidgetType(type, data);
        return {
          ...lifted,
          type: finalType,
          title: String(lifted.title || this.widgetTypeLabel(finalType)),
          data: applyRecommendedWidgetData(finalType, data),
        };
      });

    return normalizeWidgets(normalized, { idPrefix: 'w' });
  }

  private liftWidgetPayload(widget: Record<string, unknown>): Record<string, unknown> {
    const cloned = { ...widget };
    const existingData = cloned.data && typeof cloned.data === 'object' && !Array.isArray(cloned.data)
      ? { ...(cloned.data as Record<string, unknown>) }
      : {};

    const knownDataFields = new Set([
      'value', 'change', 'trend', 'caption', 'variant', 'accentColor', 'status',
      'styleConfig', 'visualMapping',
      'labels', 'values', 'categories', 'series', 'datasets', 'names', 'xaxis', 'xAxis', 'yaxis', 'yAxis',
      'rows', 'columns', 'records', 'entries',
      'stages', 'statuses', 'phases',
      'steps', 'milestones', 'events', 'nodes',
      'items', 'tasks', 'todos',
      'summary', 'highlights', 'keyPoints', 'metrics', 'stats', 'overview', 'detail', 'fullContent', 'detailContent', 'content', 'html', 'detailHtml', 'fullHtml', 'htmlContent', 'reportHtml',
      'detailUrl', 'reportUrl', 'htmlUrl', 'reportPath', 'htmlPath', 'filePath', 'reportFile', 'fileName', 'filename',
      'label', 'color', 'colors', 'metric', 'primaryMetric', 'headline', 'sections', 'blocks', 'cards',
      'min', 'max', 'unit', 'thresholds', 'percentage', 'percent', 'current',
      'indicators', 'dimensions', 'scores',
      'cells', 'cellData',
      'target', 'ranges', 'goal', 'maximum', 'limit',
      'alerts', 'notifications', 'message', 'severity', 'level', 'time', 'timestamp',
      'points', 'locations', 'regions', 'cities',
      'sparkline', 'compareValue', 'compareLabel', 'previous', 'previousLabel', 'targetLabel',
      'subtitle', 'body',
    ]);

    for (const [key, value] of Object.entries(cloned)) {
      if (key === 'data') continue;
      if (knownDataFields.has(key)) {
        existingData[key] = value;
        delete cloned[key];
      }
    }

    cloned.data = existingData;
    return cloned;
  }

  private publishWorkspaceUpdated(workspaceId: string, name: string, source: string): void {
    eventBus.publish({
      id: `evt-${Date.now()}`,
      source,
      sourceType: 'yonclaw',
      type: 'workspace.updated',
      payload: { workspaceId, name },
      timestamp: new Date().toISOString(),
    });
  }

  // ── 辅助：标准化组件类型 ──
  private normalizeWidgetType(raw: string, data?: Record<string, unknown>): string {
    const map: Record<string, string> = {
      'data': 'data', 'metric': 'metric', '指标': 'metric', '仪表': 'metric', '数据卡': 'metric',
      '数字': 'metric', 'kpi': 'metric', '指标卡': 'metric', '数值': 'metric',
      'metric-card': 'data', 'data-card': 'data', 'metriccard': 'data', '指标卡片': 'data',
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
      'adaptive': 'adaptive', '智能容器': 'adaptive', '自适应容器': 'adaptive', '智能摘要': 'adaptive', '摘要面板': 'adaptive',
      'gauge': 'gauge', '仪表盘': 'gauge', '进度盘': 'gauge', '达成率': 'gauge', 'gauge图': 'gauge',
      'funnel': 'funnel', '漏斗': 'funnel', '漏斗图': 'funnel', '转化': 'funnel', '转化漏斗': 'funnel',
      'radar': 'radar', '雷达': 'radar', '雷达图': 'radar', '蛛网图': 'radar', '蜘蛛图': 'radar',
      'heatmap': 'heatmap', '热力图': 'heatmap', '热力': 'heatmap', '密度图': 'heatmap',
      'bullet': 'bullet', '子弹图': 'bullet', '目标进度': 'bullet', '进度条': 'bullet',
      'alert': 'alert', '告警': 'alert', '告警列表': 'alert', '事件': 'alert', '通知': 'alert',
      'map': 'map', '地图': 'map', '地理': 'map', '区域': 'map', '分布图': 'map',
      'business': 'business', '业务组件': 'business', '消息中心': 'business', '审批中心': 'business',
      '智能日程': 'business', '日程组件': 'business', '洞察中心': 'business', '洞察组件': 'business', '业务洞察': 'business',
    };
    const key = String(raw || '').toLowerCase().trim();
    const mapped = map[key] || 'metric';
    // 如果数据与映射后的类型明显不匹配，用推断修正
    if (data && (mapped === 'universal' || mapped === 'metric') && (!data.value || data.html || data.content)) {
      const inferred = inferWidgetType(data);
      if (inferred !== 'universal') return inferred;
    }
    return mapped;
  }

  // ── 辅助：类型默认中文名 ──
  private widgetTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      metric: '指标卡', chart: '图表', table: '表格', kanban: '看板',
      timeline: '时间线', list: '列表', report: '报告', universal: '通用组件', adaptive: '智能容器',
      progress: '进度条', status: '状态面板', html: 'HTML组件',
      gauge: '仪表盘', funnel: '漏斗图', radar: '雷达图', heatmap: '热力图',
      bullet: '子弹图', alert: '告警列表', map: '地图',
      sparkline: '迷你趋势',
    };
    return labels[type] || '新组件';
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
      '仪表盘': 'gauge', 'gauge': 'gauge', '进度盘': 'gauge', '达成率': 'gauge',
      '漏斗': 'funnel', 'funnel': 'funnel', '漏斗图': 'funnel', '转化': 'funnel',
      '雷达': 'radar', 'radar': 'radar', '雷达图': 'radar', '蛛网图': 'radar',
      '热力图': 'heatmap', 'heatmap': 'heatmap', '热力': 'heatmap',
      '子弹图': 'bullet', 'bullet': 'bullet', '目标进度': 'bullet',
      '告警': 'alert', 'alert': 'alert', '告警列表': 'alert', '事件': 'alert',
      '地图': 'map', 'map': 'map', '地理': 'map', '区域': 'map',
    };

    // 匹配 "添加[一个]XX[叫]YY" 模式（含更多类型同义词）
    const segmentPattern = /(?:添加|增加|新建|插入)\s*(?:一个|个)?\s*(?:\d+个)?\s*(指标|仪表|数据卡|metric|图表|折线图|柱状图|饼图|趋势图|chart|表格|数据表|table|看板|状态板|流程板|kanban|时间线|时间轴|里程碑|timeline|列表|事项|任务|清单|待办|list|报告|总结|简报|report|仪表盘|gauge|进度盘|漏斗|漏斗图|funnel|转化|雷达|雷达图|radar|蛛网图|热力图|heatmap|热力|子弹图|bullet|目标进度|告警|alert|告警列表|事件|地图|map|地理|区域)?\s*(?:叫|名为|named)?\s*["']?([^"'，；、。]+?)["']?/gi;

    let match;
    let idx = 0;
    while ((match = segmentPattern.exec(command)) !== null) {
      const typeKey = match[1] || 'metric';
      const title = match[2]?.trim() || '新组件';
      const type = this.normalizeWidgetType(typeKey);
      const data = this.normalizeWidgetData(this.defaultWidgetData(type), type);
      const finalData = applyRecommendedWidgetData(type, data);

      // 计算位置：避免重叠，放在最下方
      const pos = this.calcWidgetPosition(type, existingWidgets, widgets, idx, finalData);
      widgets.push({
        id: `w-${Date.now()}-${idx}`,
        type,
        title,
        position: pos,
        data: finalData,
      });
      idx++;
    }

    return widgets;
  }

  // ── 辅助：计算组件位置（避免重叠）─
  private calcWidgetPosition(type: string, existing: any[], pending: any[], idx: number, data?: Record<string, unknown>): { x: number; y: number; w: number; h: number } {
    const { w, h } = recommendWidgetSize(type, data);

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
    // gauge: percent→value, current→value, percentage→value
    if (type === 'gauge') {
      if ('percent' in d && !('value' in d)) d.value = d.percent;
      if ('current' in d && !('value' in d)) d.value = d.current;
      if ('percentage' in d && !('value' in d)) d.value = d.percentage;
      if ('limit' in d && !('max' in d)) d.max = d.limit;
    }
    // funnel: 兼容 flat arrays (stages + values)
    if (type === 'funnel') {
      if (!('stages' in d) && Array.isArray(d.data)) d.stages = d.data;
      if (Array.isArray(d.stages) && d.stages.length > 0 && typeof d.stages[0] === 'string') {
        d.stages = d.stages.map((name: string, i: number) => ({
          name,
          value: Array.isArray(d.values) ? d.values[i] || 0 : 0,
          rate: Array.isArray(d.values) && d.values[0] ? Math.round((d.values[i] / d.values[0]) * 100) : 0,
        }));
      }
    }
    // radar: labels→indicators 兼容
    if (type === 'radar') {
      if ('indicators' in d && !('labels' in d)) d.labels = d.indicators;
      if ('labels' in d && !('indicators' in d)) d.indicators = d.labels;
      if ('dimensions' in d && !('labels' in d)) d.labels = d.dimensions;
      if ('dimensions' in d && !('indicators' in d)) d.indicators = d.dimensions;
    }
    // heatmap: data→rows, cells→rows
    if (type === 'heatmap') {
      if ('data' in d && !('rows' in d)) d.rows = d.data;
      if ('cells' in d && !('rows' in d)) d.rows = d.cells;
    }
    // bullet: current→value, goal→target
    if (type === 'bullet') {
      if ('current' in d && !('value' in d)) d.value = d.current;
      if ('goal' in d && !('target' in d)) d.target = d.goal;
      if ('maximum' in d && !('max' in d)) d.max = d.maximum;
    }
    // alert: items→alerts, events→alerts
    if (type === 'alert') {
      if ('items' in d && !('alerts' in d)) d.alerts = d.items;
      if ('events' in d && !('alerts' in d)) d.alerts = d.events;
      if ('notifications' in d && !('alerts' in d)) d.alerts = d.notifications;
    }
    // map: locations→points, regions→points
    if (type === 'map') {
      if ('locations' in d && !('points' in d)) d.points = d.locations;
      if ('regions' in d && !('points' in d)) d.points = d.regions;
      if ('cities' in d && !('points' in d)) d.points = d.cities;
    }

    return normalizeWidgetDataPayload(d, type);
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
      adaptive: {
        headline: { title: '智能摘要', subtitle: '用于承载复杂、多形态的数据结果' },
        sections: [
          { type: 'metrics', metrics: [{ label: '核心指标', value: '—' }, { label: '趋势', value: '待生成' }] },
          { type: 'text', content: '当标准组件不适合时，使用该容器进行统一兜底渲染。' },
        ],
      },
      gauge: { value: 68, min: 0, max: 100, unit: '%' },
      funnel: { stages: [{ name: '访问', value: 1000, rate: 100 }, { name: '注册', value: 600, rate: 60 }, { name: '付费', value: 200, rate: 20 }] },
      radar: { labels: ['速度', '质量', '成本', '服务', '创新'], values: [85, 70, 90, 75, 80] },
      heatmap: { rows: [{ x: '周一', y: '上午', value: 30 }, { x: '周一', y: '下午', value: 50 }, { x: '周二', y: '上午', value: 40 }] },
      bullet: { value: 75, target: 80, max: 100, label: '目标达成率' },
      alert: { alerts: [{ level: 'warning', message: '示例告警信息', time: '10:30' }] },
      map: { points: [{ name: '北京', value: 120 }, { name: '上海', value: 95 }, { name: '广州', value: 80 }] },
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
