import * as workspaceStore from '../data/workspaceStore';
import { eventBus } from './event-bus';
import { connectionManager } from '../connection/manager';
import type { ChatMessage } from '../connection/types';
import { getAllToolDefinitionsForLLM } from '../tools/registry';
import { resolveWidgetData } from './widget-data';
import { inferWidgetType, isTypeMismatched } from './widget-type-inferer';
import { recordAuditEvent } from './audit-log';
import { contextBuilder } from './context-builder';
import {
  createWorkspaceInitJob,
  getWorkspaceInitJob,
  listRecoverableWorkspaceInitJobs,
  updateWorkspaceInitJob,
  type WorkspaceInitJob,
} from './workspace-init-jobs';

type TemplateWidgetDataSource = {
  type: 'skill' | 'query' | 'static' | 'event';
  fallbackToStatic?: boolean;
  [key: string]: unknown;
};

export interface InitWidget {
  id: string;
  type: string;
  title: string;
  data?: Record<string, unknown>;
  dataSource?: TemplateWidgetDataSource;
  dataIntent?: {
    domain?: string;
    metricKey?: string;
    sourcePreference?: 'real-time' | 'tool-first' | 'template-first';
    priority?: 'high' | 'medium' | 'low';
    required?: boolean;
  };
}

interface WidgetInitFailure {
  id: string;
  reason: string;
}

export interface WorkspaceInitResult {
  success: boolean;
  updated: number;
  total: number;
  mode: 'llm' | 'data-source' | 'real-data';
  updatedWidgetIds: string[];
  failedWidgetIds: string[];
  error?: string;
  message?: string;
  fallbackApplied?: boolean;
}

interface LLMInitOptions {
  requireGroundedData?: boolean;
  progressOffset?: number;
  progressTotal?: number;
}

export interface WorkspaceInitializationRequest {
  workspaceId: string;
  workspaceName: string;
  templateName?: string;
  initPrompt: string;
  widgets: InitWidget[];
  useDemoDataFallback?: boolean;
  sourceType?: 'template' | 'agent';
}

export interface WorkspaceInitializationStartResult {
  initializing: boolean;
  initializationMode: 'llm' | 'real-data';
  jobId: string;
}

export function detectRealDataIntent(text?: string): boolean {
  if (!text) return false;
  return /(真实.{0,8}数据|实时.{0,8}数据|实际.{0,8}数据|最新.{0,8}数据|联网.{0,8}数据|在线.{0,8}数据|不要演示数据|不要示例数据|不要\s*mock\s*数据|real.{0,8}data|live.{0,8}data|up[- ]to[- ]date)/i.test(text);
}

function hasRefreshableDataSource(widget: InitWidget): boolean {
  const type = widget.dataSource?.type;
  return type === 'skill' || type === 'query';
}

function publishInitProgress(
  workspaceId: string,
  current: number,
  total: number,
  widgetTitle: string
): void {
  eventBus.publish({
    id: `evt-${Date.now()}`,
    source: 'cockpit-agent',
    sourceType: 'yonclaw',
    type: 'workspace.init_progress',
    payload: {
      workspaceId,
      current,
      total,
      widgetTitle,
    },
    timestamp: new Date().toISOString(),
  });
}

function isEmptyWidgetData(data: Record<string, unknown>, type: string): boolean {
  if (!data || typeof data !== 'object') return true;
  const keys = Object.keys(data).filter((k) => !k.startsWith('_') && k !== 'businessType');
  if (keys.length === 0) return true;

  // business 类型：核心数组为空则视为空数据
  if (type === 'business') {
    const bt = data.businessType;
    const keyField = bt === 'calendar' ? 'events' : bt === 'insight-hub' ? 'insights' : 'messages';
    const arr = data[keyField];
    if (Array.isArray(arr) && arr.length === 0) return true;
  }

  return false;
}

async function mergeWidgetData(
  workspaceId: string,
  updates: Map<string, Record<string, unknown>>
): Promise<void> {
  if (updates.size === 0) return;
  const currentWs = await workspaceStore.getWorkspace(workspaceId);
  if (!currentWs) return;

  const updatedWidgets = currentWs.widgets.map((widget: any) => {
    const nextData = updates.get(widget.id);
    if (!nextData) return widget;

    // 空数据保护：若 LLM 返回了空结构，保留原始演示数据
    if (isEmptyWidgetData(nextData, widget.type)) {
      console.log(`[WorkspaceInit] Skipping empty data for widget "${widget.title}" (${widget.id}), preserving original demo data`);
      return widget;
    }

    const nextType = isTypeMismatched(widget.type, nextData)
      ? inferWidgetType(nextData)
      : widget.type;

    // 业务洞察组件：对 LLM 返回的数据进行字段级合并，保留模板中预置的
    // cockpitSummary / persona / highlights / recommendations 等结构化字段
    let mergedData = { ...nextData };
    if (widget.type === 'business' && (widget.business?.businessType === 'insight-hub' || nextData.businessType === 'insight-hub')) {
      const preserveFields = ['cockpitSummary', 'persona', 'highlights', 'recommendations'];
      for (const field of preserveFields) {
        const original = widget.data?.[field];
        const next = nextData[field];
        if (next === undefined && original !== undefined) {
          mergedData[field] = original;
        }
      }
    }

    return {
      ...widget,
      type: nextType,
      data: mergedData,
    };
  });

  const updatedWorkspace = await workspaceStore.updateWorkspace(workspaceId, { widgets: updatedWidgets });
  if (updatedWorkspace) {
    await contextBuilder.build(updatedWorkspace);
  }
}

async function markWidgetsInitFailed(
  workspaceId: string,
  failures: WidgetInitFailure[]
): Promise<void> {
  if (failures.length === 0) return;
  const failureMap = new Map(failures.map((failure) => [failure.id, failure.reason]));
  const currentWs = await workspaceStore.getWorkspace(workspaceId);
  if (!currentWs) return;

  const updatedWidgets = currentWs.widgets.map((widget: any) => {
    const reason = failureMap.get(widget.id);
    if (!reason) return widget;
    return {
      ...widget,
      data: {
        ...(widget.data ?? {}),
        __initStatus: 'failed',
        __initError: reason,
      },
    };
  });

  const updatedWorkspace = await workspaceStore.updateWorkspace(workspaceId, { widgets: updatedWidgets });
  if (updatedWorkspace) {
    await contextBuilder.build(updatedWorkspace);
  }
}

function extractJsonFromText(text: string): unknown {
  try {
    return JSON.parse(text.trim());
  } catch { /* ignore */ }

  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch { /* ignore */ }

  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * 递归解码 widget data 中可能存在的 JSON 双重转义字符串。
 * LLM 有时会在字符串值内部返回字面量的 \\n、\\uXXXX 等序列，
 * 需要把它们还原为实际的换行符和 Unicode 字符。
 */
function unescapeJsonStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    // 检测是否包含 JSON 转义序列（\\n、\\uXXXX、\\t 等）
    if (/\\[nrtbf"\\/]|\\u[0-9a-fA-F]{4}/.test(value)) {
      try {
        // 尝试用 JSON.parse 解码：把字符串包成 JSON 字符串再解析
        const decoded = JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
        if (typeof decoded === 'string') return decoded;
      } catch {
        // 解析失败则退回到手动替换
        return value
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(unescapeJsonStrings);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = unescapeJsonStrings(v);
    }
    return result;
  }
  return value;
}

function getWidgetPriorityScore(widget: InitWidget): number {
  const intent = widget.dataIntent;
  let score = 0;

  if (intent?.required) score += 100;

  switch (intent?.priority) {
    case 'high':
      score += 30;
      break;
    case 'medium':
      score += 20;
      break;
    case 'low':
      score += 10;
      break;
    default:
      break;
  }

  switch (intent?.sourcePreference) {
    case 'tool-first':
      score += 15;
      break;
    case 'real-time':
      score += 10;
      break;
    case 'template-first':
      score += 0;
      break;
    default:
      break;
  }

  if (hasRefreshableDataSource(widget)) {
    score += 5;
  }

  return score;
}

function sortWidgetsByDataIntent(widgets: InitWidget[]): InitWidget[] {
  return [...widgets].sort((a, b) => getWidgetPriorityScore(b) - getWidgetPriorityScore(a));
}

function buildDomainSpecificGroundingGuide(
  workspaceName: string,
  templateName: string,
  initPrompt: string,
  batch: InitWidget[]
): string {
  const batchTitles = batch.map((widget) => widget.title).join('、');
  const text = `${workspaceName} ${templateName} ${initPrompt} ${batchTitles}`;

  if (/(CFO|财务|盈利|现金流|资产负债|估值|市值|上市公司|股票|finance|profit|cashflow|market cap|valuation)/i.test(text)) {
    return `财务场景专项要求：
- 优先使用 finance_company_lookup 查询目标公司的真实证券快照，再基于结果生成组件数据
- 如果用户没有明确公司名，先从初始化要求中推断公司；无法推断时返回 unavailableReason，不要编造
- finance_company_lookup 返回的字段主要是证券行情与估值快照，例如 price、changePercent、marketCap、pe、pb
- 不要把 pe/pb 直接当作毛利率、利润率、资产负债率、经营现金流
- 如果真实来源没有某项财务指标，请明确说明缺失，不要用估值指标冒充财务报表指标
- 市值应映射到“市值/估值/资本市场表现”类组件；营业收入、利润率、现金流、资产负债率必须使用可验证的财务口径或在缺失时说明不可得`;
  }

  if (/(天气|气温|降雨|预报|weather|forecast)/i.test(text)) {
    return `天气场景专项要求：
- 优先使用 weather_query
- 只填充天气、气温、风力、湿度、未来预报相关数据，不要生成与天气无关的业务指标`;
  }

  return '';
}

async function initializeBatchWithLLM(
  workspaceId: string,
  workspaceName: string,
  templateName: string,
  initPrompt: string,
  batch: InitWidget[],
  llmConnector: NonNullable<ReturnType<typeof connectionManager.getConnectorByCapability>>,
  options: LLMInitOptions = {}
): Promise<{ updated: number; updatedWidgetIds: string[]; failedWidgets: WidgetInitFailure[] }> {
  const widgetDesc = batch
    .map((w) => `- [${w.type}] ${w.title} (id: ${w.id})`)
    .join('\n');
  const groundingGuide = buildDomainSpecificGroundingGuide(workspaceName, templateName, initPrompt, batch);

  const systemPrompt = options.requireGroundedData
    ? `你是一个企业数据分析助手。当前用户明确要求真实数据。
重要原则：
- 必须优先使用可用工具、联网结果或可验证事实来生成组件数据
- 如果无法获得真实、最新、可验证的数据，绝对不要编造、不要回退到示例数据
- 无法满足时，请返回 unavailableReason 字段说明原因，并让 widgets 为空数组`
    : `你是一个企业数据分析助手。请根据驾驶舱信息和用户的初始化要求，为每个组件生成合理的初始数据。
重要原则：
- 如果用户要求"真实数据"、"实际数据"或"最新数据"，请生成尽可能真实、合理、符合业务逻辑的数据，而不是明显的占位符或示例数据
- 数据应体现专业性和业务深度，数值要有合理的分布和逻辑关系
- 严格遵循用户提出的初始化要求

【内部可视化规则（不对外展示）】
- 指标卡(metric)必须使用 data.value/change/trend/unit/target/compareLabel/description 等语义字段
- 金额、收入、利润等数值字段必须使用纯数字+单位格式（如 "850亿元"），禁止使用 ~ 前缀（~ 会被误解为负号）
- 含正负值、差额、盈亏、预算偏差的数据必须使用 bar 图表，并在 data.styleConfig 中配置 baseline="zero"、mode="diverging"
- 只有全为非负值且 2-5 个分类占比时才使用 donut
- 不要把 chartType/styleConfig/value/change/trend 等配置字段作为报告正文或详情展示字段`;

  const userPrompt = `驾驶舱名称: ${workspaceName}
模板来源: ${templateName}
初始化要求: ${initPrompt}

请为以下 ${batch.length} 个组件生成数据：
${widgetDesc}

直接输出 JSON 对象（不要 markdown 代码块），格式如下:
{
  "widgets": [
    { "id": "widget-id", "data": { ... } }
  ],
  "unavailableReason": "当无法获取真实数据时说明原因；若已成功生成可省略"
}

各组件类型的 data 格式参考:
- metric: { value: string, change: string, trend: "up"|"down"|"flat" }
- chart: { labels: string[], values: number[] }
- table: { rows: any[] }
- list: { items: any[] }
- kanban: { stages: string[] }
- timeline: { steps: string[] }
- report: { summary: string, highlights: [{label:string,value:string}], detail?: { content: string, contentType: "html"|"markdown"|"text" }, html?: string }
- html: { html: string, title?: string }
- progress: { value: number, max: number, label: string }
- status: { items: [{ label: string, status: "green"|"yellow"|"red", value: string }] }
- gauge: { value: number, min: number, max: number, unit: string, thresholds?: [{value:number,color:string}] }
- funnel: { stages: [{ name: string, value: number, rate: number }] }
- radar: { labels: string[], values: number[] }
- heatmap: { rows: [{ x: string, y: string, value: number }] }
- bullet: { value: number, target: number, max: number, label: string }
- alert: { alerts: [{ level: "warning"|"critical"|"info"|"success", message: string, time: string }] }
- map: { points: [{ name: string, value: number }] }
- business: 根据 businessType 决定数据结构，必须保留原始数据中的业务对象
  - message-center: { businessType: 'message-center', messages: [{ id, type: 'approval'|'alert'|'todo', priority: 'critical'|'high'|'medium'|'low', status: 'pending'|'processing'|'done', title, summary, source, dueAt?, intelligence?, actions: [{id,label,type,tone?}] }] }
  - calendar: { businessType: 'calendar', events: [{ id, type: 'meeting'|'approval'|'risk'|'deadline'|'reminder'|'milestone', start, end?, location?, participants?: string[], source, status?, actions: [{id,label,type}] }] }
  - insight-hub（业务洞察组件）: { businessType: 'insight-hub', cockpitSummary: { title: 'xx业务洞察', subtitle?, domain?, scope?, description: '一句话说明该组件的价值' }, persona: { role: '角色', focus: ['关注维度1', '关注维度2'], preferences?: string[] }, highlights: [{ id, label, value, change?, trend: 'up'|'down'|'neutral' }], insights: [{ id, type: 'risk'|'opportunity'|'anomaly'|'recommendation'|'summary', severity: 'critical'|'high'|'medium'|'low', title, summary, evidence?: [{label,value}], recommendation?, confidence?: number, actions: [{id,label,type,tone?}] }], recommendations: [{ id, text, priority: 'high'|'medium'|'low' }] }
- workflow: { steps: [{ id, label, status: 'pending'|'running'|'done'|'error', detail? }], currentStep?: number, summary?: string }
- result: { items: [{ type: 'finding'|'conclusion'|'warning'|'insight', content, evidence?: string[], confidence?: number }], generatedAt?: string }
- actions: { actions: [{ id, label, status: 'queued'|'running'|'done', type?: 'sql'|'report'|'script'|'task', output?: string }] }
- artifact: { artifacts: [{ id, name, type: 'sql'|'code'|'report'|'chart'|'document', content, language?: string }] }
- universal: 根据组件标题自由发挥

要求:
1. 严格遵循用户的初始化要求，如果要求真实数据则优先使用工具/联网结果，不要编造
2. 数据必须与驾驶舱主题高度相关，数值合理且有业务逻辑
3. 直接输出纯 JSON，不要任何 markdown 格式或其他文字
4. 如果组件标题或初始化要求包含“完整报告 / HTML报告 / 点击查看详情 / 全部详情”等语义，必须把完整正文写入 data.html 或 data.detail.content；不要只返回 detailUrl: true 这类布尔标记
${groundingGuide ? `5. 请额外遵守以下场景约束：\n${groundingGuide}` : ''}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const tools = getAllToolDefinitionsForLLM();
    // 添加 60 秒超时，防止 LLM 无响应导致初始化永久卡住
    const chatPromise = llmConnector.chat(messages, {
      temperature: 0.5,
      maxTokens: 4096,
      tools: tools.length > 0 ? tools : undefined,
    });
    const raw = await Promise.race([
      chatPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('LLM 初始化请求超时（60秒）')), 60000);
      }),
    ]);
    const parsed = extractJsonFromText(raw) as {
      widgets?: Array<{ id: string; data: Record<string, unknown> }>;
      unavailableReason?: string;
    } | null;

    if (!parsed || !Array.isArray(parsed.widgets)) {
      return {
        updated: 0,
        updatedWidgetIds: [],
        failedWidgets: batch.map((widget) => ({
          id: widget.id,
          reason: options.requireGroundedData ? 'LLM 未返回可解析的真实数据结果' : 'LLM 返回解析失败',
        })),
      };
    }

    if (options.requireGroundedData && parsed.unavailableReason) {
      return {
        updated: 0,
        updatedWidgetIds: [],
        failedWidgets: batch.map((widget) => ({
          id: widget.id,
          reason: parsed.unavailableReason || '当前无法获取真实数据',
        })),
      };
    }

    const dataMap = new Map<string, Record<string, unknown>>();
    for (const item of parsed.widgets) {
      if (item.id && item.data && typeof item.data === 'object' && !Array.isArray(item.data)) {
        dataMap.set(item.id, unescapeJsonStrings(item.data) as Record<string, unknown>);
      }
    }

    const updatedWidgetIds = batch
      .map((widget) => widget.id)
      .filter((widgetId) => dataMap.has(widgetId));
    const failedWidgets = batch
      .filter((widget) => !dataMap.has(widget.id))
      .map((widget) => ({
        id: widget.id,
        reason: options.requireGroundedData
          ? '未能为该组件生成可验证的真实数据'
          : 'LLM 未返回该组件的数据',
      }));

    await mergeWidgetData(workspaceId, dataMap);
    return {
      updated: updatedWidgetIds.length,
      updatedWidgetIds,
      failedWidgets,
    };
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[WorkspaceInit] Batch init failed for ${workspaceId}:`, errMsg);
    return {
      updated: 0,
      updatedWidgetIds: [],
      failedWidgets: batch.map((widget) => ({ id: widget.id, reason: errMsg })),
    };
  }
}

async function initializeWorkspaceWithLLM(
  workspaceId: string,
  workspaceName: string,
  templateName: string,
  initPrompt: string,
  widgets: InitWidget[],
  options: LLMInitOptions = {}
): Promise<WorkspaceInitResult> {
  console.log(`[WorkspaceInit] Starting LLM init for workspace=${workspaceId}, widgets=${widgets.length}`);
  const llmConnector = connectionManager.getConnectorByCapability('llm-chat');
  console.log(`[WorkspaceInit] LLM connector lookup result: ${llmConnector ? llmConnector.type + '/' + llmConnector.connectionId : 'null'}`);
  if (!llmConnector || !llmConnector.chat) {
    const errMsg = options.requireGroundedData
      ? '当前没有可用的大模型连接，无法按要求获取真实数据'
      : '当前没有可用的大模型连接，无法初始化模板数据';
    console.warn(`[WorkspaceInit] ${errMsg}, skipping LLM init for ${workspaceId}`);
    await markWidgetsInitFailed(
      workspaceId,
      widgets.map((widget) => ({ id: widget.id, reason: errMsg }))
    );
    return {
      success: false,
      updated: 0,
      total: widgets.length,
      mode: options.requireGroundedData ? 'real-data' : 'llm',
      updatedWidgetIds: [],
      failedWidgetIds: widgets.map((widget) => widget.id),
      error: errMsg,
      message: errMsg,
    };
  }

  const BATCH_SIZE = 4;
  let totalUpdated = 0;
  const updatedWidgetIds: string[] = [];
  const failedWidgets: WidgetInitFailure[] = [];
  const orderedWidgets = sortWidgetsByDataIntent(widgets);
  const progressTotal = options.progressTotal ?? widgets.length;
  const progressOffset = options.progressOffset ?? 0;

  for (let i = 0; i < orderedWidgets.length; i += BATCH_SIZE) {
    const batch = orderedWidgets.slice(i, i + BATCH_SIZE);
    publishInitProgress(
      workspaceId,
      Math.min(progressOffset + i + 1, progressTotal),
      progressTotal,
      batch[0]?.title || ''
    );

    const result = await initializeBatchWithLLM(
      workspaceId,
      workspaceName,
      templateName,
      initPrompt,
      batch,
      llmConnector,
      options
    );

    totalUpdated += result.updated;
    updatedWidgetIds.push(...result.updatedWidgetIds);
    failedWidgets.push(...result.failedWidgets);
  }

  if (failedWidgets.length > 0) {
    await markWidgetsInitFailed(workspaceId, failedWidgets);
    const failureMessage = options.requireGroundedData
      ? `仅完成 ${totalUpdated}/${widgets.length} 个组件的真实数据初始化`
      : `${failedWidgets.length}/${widgets.length} 个组件初始化失败`;
    return {
      success: false,
      updated: totalUpdated,
      total: widgets.length,
      mode: options.requireGroundedData ? 'real-data' : 'llm',
      updatedWidgetIds,
      failedWidgetIds: failedWidgets.map((widget) => widget.id),
      error: failedWidgets[0]?.reason || failureMessage,
      message: failureMessage,
    };
  }

  console.log(`[WorkspaceInit] Workspace ${workspaceId} initialized, ${totalUpdated}/${widgets.length} widgets updated`);
  return {
    success: true,
    updated: totalUpdated,
    total: widgets.length,
    mode: options.requireGroundedData ? 'real-data' : 'llm',
    updatedWidgetIds,
    failedWidgetIds: [],
    message: options.requireGroundedData
      ? `已完成 ${totalUpdated}/${widgets.length} 个组件的真实数据初始化`
      : `已完成 ${totalUpdated}/${widgets.length} 个组件的模板初始化`,
  };
}

async function initializeWorkspaceWithDataSources(
  workspaceId: string,
  widgets: InitWidget[],
  progressOffset = 0,
  progressTotal = widgets.length
): Promise<WorkspaceInitResult> {
  const sourceWidgets = sortWidgetsByDataIntent(widgets.filter(hasRefreshableDataSource));
  if (sourceWidgets.length === 0) {
    return {
      success: false,
      updated: 0,
      total: widgets.length,
      mode: 'data-source',
      updatedWidgetIds: [],
      failedWidgetIds: widgets.map((widget) => widget.id),
      error: '模板中的组件未配置可刷新的真实数据源',
      message: '模板中的组件未配置可刷新的真实数据源',
    };
  }

  const updatedWidgetIds: string[] = [];
  const failures: WidgetInitFailure[] = [];

  for (let index = 0; index < sourceWidgets.length; index++) {
    const widget = sourceWidgets[index];
    publishInitProgress(
      workspaceId,
      Math.min(progressOffset + index + 1, progressTotal),
      progressTotal,
      widget.title
    );

    try {
      const result = await resolveWidgetData(
        workspaceId,
        widget as any,
        connectionManager,
        undefined,
        false
      );

      const supportsRealSource = result.source === 'skill' || result.source === 'query';
      const hasObjectPayload = !!result.data && typeof result.data === 'object' && !Array.isArray(result.data);
      if (supportsRealSource && hasObjectPayload) {
        await mergeWidgetData(workspaceId, new Map([[widget.id, result.data as Record<string, unknown>]]));
        updatedWidgetIds.push(widget.id);
      } else {
        failures.push({
          id: widget.id,
          reason: supportsRealSource
            ? '真实数据源返回的结果格式暂不支持当前组件'
            : `未能从真实数据源获取数据（source=${result.source}）`,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ id: widget.id, reason: message || '数据源刷新失败' });
    }
  }

  await markWidgetsInitFailed(workspaceId, failures);

  return {
    success: failures.length === 0,
    updated: updatedWidgetIds.length,
    total: sourceWidgets.length,
    mode: 'data-source',
    updatedWidgetIds,
    failedWidgetIds: failures.map((failure) => failure.id),
    error: failures.length > 0 ? failures[0]?.reason || '部分组件未能从真实数据源获取数据' : undefined,
    message: updatedWidgetIds.length > 0
      ? `已从真实数据源更新 ${updatedWidgetIds.length}/${sourceWidgets.length} 个组件`
      : '未能从真实数据源获取组件数据',
  };
}

async function restoreDemoDataFallback(workspaceId: string): Promise<void> {
  const workspace = await workspaceStore.getWorkspace(workspaceId);
  if (!workspace || workspace.useDemoDataFallback !== false) return;
  await workspaceStore.updateWorkspace(workspaceId, { useDemoDataFallback: true });
}

export async function initializeWorkspaceFromRequest(
  request: WorkspaceInitializationRequest
): Promise<WorkspaceInitResult> {
  const { workspaceId, workspaceName, templateName, initPrompt, widgets, useDemoDataFallback } = request;
  const realDataRequested = detectRealDataIntent(initPrompt);
  const sourceName = templateName || workspaceName || '驾驶舱';

  if (!realDataRequested) {
    return initializeWorkspaceWithLLM(
      workspaceId,
      workspaceName,
      sourceName,
      initPrompt,
      widgets
    );
  }

  const updatedWidgetIds = new Set<string>();
  const errors: string[] = [];
  const refreshableWidgets = widgets.filter(hasRefreshableDataSource);

  if (refreshableWidgets.length > 0) {
    const dataSourceResult = await initializeWorkspaceWithDataSources(
      workspaceId,
      widgets,
      0,
      widgets.length
    );
    for (const widgetId of dataSourceResult.updatedWidgetIds) {
      updatedWidgetIds.add(widgetId);
    }
    if (!dataSourceResult.success && dataSourceResult.error) {
      errors.push(dataSourceResult.error);
    }
  } else {
    errors.push('模板未配置可刷新的真实数据源');
  }

  const currentWorkspace = await workspaceStore.getWorkspace(workspaceId);
  const latestWidgets = (currentWorkspace?.widgets || widgets) as InitWidget[];
  const remainingWidgets = latestWidgets.filter((widget) => !updatedWidgetIds.has(widget.id));

  if (remainingWidgets.length > 0) {
    const llmResult = await initializeWorkspaceWithLLM(
      workspaceId,
      workspaceName,
      sourceName,
      initPrompt,
      remainingWidgets,
      {
        requireGroundedData: true,
        progressOffset: updatedWidgetIds.size,
        progressTotal: widgets.length,
      }
    );
    for (const widgetId of llmResult.updatedWidgetIds) {
      updatedWidgetIds.add(widgetId);
    }
    if (!llmResult.success && llmResult.error) {
      errors.push(llmResult.error);
    }
  }

  const success = updatedWidgetIds.size === widgets.length;
  const message = success
    ? `已完成 ${updatedWidgetIds.size}/${widgets.length} 个组件的真实数据初始化`
    : updatedWidgetIds.size > 0
      ? `仅完成 ${updatedWidgetIds.size}/${widgets.length} 个组件的真实数据初始化`
      : '未能获取真实数据';

  let fallbackApplied = false;
  if (!success && useDemoDataFallback) {
    await restoreDemoDataFallback(workspaceId);
    fallbackApplied = true;
  }

  return {
    success,
    updated: updatedWidgetIds.size,
    total: widgets.length,
    mode: 'real-data',
    updatedWidgetIds: Array.from(updatedWidgetIds),
    failedWidgetIds: widgets
      .map((widget) => widget.id)
      .filter((widgetId) => !updatedWidgetIds.has(widgetId)),
    error: success ? undefined : errors.join('；') || message,
    message: !success && fallbackApplied
      ? `${message}，已回退显示模板演示数据`
      : message,
    fallbackApplied,
  };
}

export function startWorkspaceInitialization(
  request: WorkspaceInitializationRequest
): WorkspaceInitializationStartResult {
  const realDataRequested = detectRealDataIntent(request.initPrompt);
  const initializationMode = realDataRequested ? 'real-data' : 'llm';
  const job = createWorkspaceInitJob(request, initializationMode);

  eventBus.publish({
    id: `evt-${Date.now()}`,
    source: 'cockpit-agent',
    sourceType: 'yonclaw',
    type: 'workspace.initializing',
    payload: {
      workspaceId: request.workspaceId,
      name: request.workspaceName,
      mode: initializationMode,
      sourceType: request.sourceType || 'template',
      jobId: job.id,
    },
    timestamp: new Date().toISOString(),
  });

  void runWorkspaceInitializationJob(job.id);

  return {
    initializing: true,
    initializationMode,
    jobId: job.id,
  };
}

async function markWorkspaceInitializing(job: WorkspaceInitJob): Promise<void> {
  await workspaceStore.updateWorkspace(job.workspaceId, {
    initializing: true,
    initializationMode: job.initializationMode,
    initializationJobId: job.id,
    initializationError: undefined,
  });
}

async function markWorkspaceInitialized(job: WorkspaceInitJob, result: WorkspaceInitResult): Promise<void> {
  await workspaceStore.updateWorkspace(job.workspaceId, {
    initializing: false,
    initializationMode: job.initializationMode,
    initializationJobId: job.id,
    initializationError: undefined,
    initializedAt: new Date().toISOString(),
  });

  eventBus.publish({
    id: `evt-${Date.now()}`,
    source: 'cockpit-agent',
    sourceType: 'yonclaw',
    type: 'workspace.initialized',
    payload: {
      workspaceId: job.workspaceId,
      name: job.workspaceName,
      result,
      jobId: job.id,
    },
    timestamp: new Date().toISOString(),
  });

  recordAuditEvent({
    actor: 'cockpit-agent',
    source: 'workspace-init',
    action: 'workspace.initialize',
    targetType: 'workspace',
    targetId: job.workspaceId,
    status: 'success',
    details: {
      jobId: job.id,
      mode: job.initializationMode,
      updated: result.updated,
      total: result.total,
    },
  });
}

async function markWorkspaceInitFailed(job: WorkspaceInitJob, error: string, result?: WorkspaceInitResult): Promise<void> {
  await workspaceStore.updateWorkspace(job.workspaceId, {
    initializing: false,
    initializationMode: job.initializationMode,
    initializationJobId: job.id,
    initializationError: error,
  });

  eventBus.publish({
    id: `evt-${Date.now()}`,
    source: 'cockpit-agent',
    sourceType: 'yonclaw',
    type: 'workspace.init_failed',
    payload: {
      workspaceId: job.workspaceId,
      name: job.workspaceName,
      error,
      result,
      sourceType: job.request.sourceType || 'template',
      jobId: job.id,
    },
    timestamp: new Date().toISOString(),
  });

  recordAuditEvent({
    actor: 'cockpit-agent',
    source: 'workspace-init',
    action: 'workspace.initialize',
    targetType: 'workspace',
    targetId: job.workspaceId,
    status: 'failure',
    details: {
      jobId: job.id,
      mode: job.initializationMode,
      error,
      updated: result?.updated,
      total: result?.total,
    },
  });
}

export async function runWorkspaceInitializationJob(jobId: string): Promise<void> {
  const existing = getWorkspaceInitJob(jobId);
  if (!existing) {
    return;
  }
  if (existing.status === 'succeeded') {
    return;
  }
  // 防御：任何已耗尽重试次数的 job（无论 pending 还是 running）都应被清理
  if (existing.attempts >= existing.maxAttempts) {
    console.warn(`[WorkspaceInit] Job ${jobId} attempts(${existing.attempts}) >= maxAttempts(${existing.maxAttempts}), marking as failed`);
    await markWorkspaceInitFailed(existing, existing.lastError || '重试次数已耗尽，初始化失败');
    return;
  }
  // 防御：running 且 attempts 超限的僵尸 job（理论上已被上一条处理，但保留双保险）
  if (existing.status === 'running' && existing.attempts >= existing.maxAttempts) {
    await markWorkspaceInitFailed(existing, existing.lastError || '僵尸任务，强制失败');
    return;
  }

  const attempts = existing.attempts + 1;
  const running = updateWorkspaceInitJob(jobId, {
    status: 'running',
    attempts,
    startedAt: existing.startedAt || new Date().toISOString(),
    lastError: undefined,
  });

  if (!running) {
    return;
  }

  await markWorkspaceInitializing(running);

  try {
    const result = await initializeWorkspaceFromRequest(running.request);
    if (result.success) {
      updateWorkspaceInitJob(jobId, {
        status: 'succeeded',
        result,
        finishedAt: new Date().toISOString(),
        lastError: undefined,
      });
      await markWorkspaceInitialized(running, result);
      return;
    }

    const errorMessage = result.error || result.message || '初始化失败';
    const failed = updateWorkspaceInitJob(jobId, {
      status: attempts < running.maxAttempts ? 'pending' : 'failed',
      lastError: errorMessage,
      result,
      finishedAt: attempts < running.maxAttempts ? undefined : new Date().toISOString(),
    });

    if (failed && failed.status === 'pending') {
      setTimeout(() => {
        void runWorkspaceInitializationJob(jobId);
      }, 1500);
      return;
    }

    await markWorkspaceInitFailed(running, errorMessage, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = updateWorkspaceInitJob(jobId, {
      status: attempts < running.maxAttempts ? 'pending' : 'failed',
      lastError: message,
      finishedAt: attempts < running.maxAttempts ? undefined : new Date().toISOString(),
    });

    if (failed && failed.status === 'pending') {
      setTimeout(() => {
        void runWorkspaceInitializationJob(jobId);
      }, 1500);
      return;
    }

    console.error(`[WorkspaceInit] Exception for ${running.workspaceId}:`, message);
    await markWorkspaceInitFailed(running, message);
  }
}

export async function resumeWorkspaceInitializationJobs(): Promise<void> {
  const jobs = listRecoverableWorkspaceInitJobs();
  for (const job of jobs) {
    void runWorkspaceInitializationJob(job.id);
  }
}

export const __testables = {
  getWidgetPriorityScore,
  sortWidgetsByDataIntent,
};
