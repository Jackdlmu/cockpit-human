// ─── LLM Enhancer ───
// Phase 3: LLM 协同策略
// 规则打底 → LLM 增强（生成 patch）→ 校验应用

import type { Connector, ChatMessage } from '../../connection/types';
import { inferWidgetType, isTypeMismatched } from '../../services/widget-type-inferer';
import { normalizeWidgets } from '../../services/widget-normalizer';

/**
 * LLM 增强 patch 结构
 * LLM 只能修改 description 和建议额外 widgets，不能修改核心配置
 */
export interface CockpitEnhancement {
  /** 优化后的驾驶舱描述 */
  description?: string;
  /** LLM 建议额外增加的 widgets */
  suggestedWidgets?: Array<{
    type: string;
    title: string;
    position: { x: number; y: number; w: number; h: number };
    data: Record<string, unknown>;
    dataSource?: Record<string, unknown>;
    reason: string;
  }>;
  /** LLM 对整体布局的评价 */
  layoutComment?: string;
  /** 是否建议修改（如果被拒绝则返回 null） */
  apply: boolean;
  /** 是否建议替换所有 widgets（而非追加） */
  replaceWidgets?: boolean;
}

/** 不可被 LLM 修改的字段（锚定字段） */
const ANCHOR_FIELDS = ['name', 'icon', 'color', 'agentIds', 'primaryAgentId'];

// ── 生成 Prompt ──

/**
 * 构建生成 Prompt：让 LLM 直接根据用户指令生成完整的驾驶舱配置
 */
export function buildGenerationPrompt(
  userCommand: string,
  baseSpec: Record<string, unknown>
): string {
  return `你是一位智能驾驶舱架构师。请根据用户指令，直接设计一个完整的驾驶舱配置。

用户指令："""${userCommand}"""

【核心原则】
1. **分析用户指令的主题和意图**，生成与之高度相关的组件，禁止使用与主题无关的通用组件
2. 如果用户要求查询真实数据（如天气、股票、新闻等），请配置 dataSource 让系统知道如何获取数据
3. 如果无法配置真实数据源，可以生成合理的模拟数据，但数据必须与主题相关

【主题组件设计示例】
- 天气查询 → metric(当前温度/湿度/风速)、chart(七日温度趋势)、list(七日天气预报)、map(城市位置)
- 股票追踪 → metric(股价/涨跌幅)、chart(K线/成交量)、table(持仓明细)、alert(价格预警)
- 项目进度 → kanban(任务看板)、timeline(里程碑)、progress(完成度)、metric(剩余工时)
- 销售分析 → metric(销售额/订单数)、chart(月度趋势)、funnel(转化漏斗)、table(Top客户)
- 系统监控 → gauge(CPU/内存使用率)、status(服务状态)、alert(异常告警)、chart(流量趋势)

【禁止】
- 禁止生成与主题无关的通用组件（如"核心指标1,248"、"趋势分析1-6月"、"完成Q3目标"等默认数据）
- 禁止生成占位符数据：value: "—"、"N/A"、"null"、列表项"步骤1"、"事项1"

【组件类型说明】
- metric: 关键指标数字卡，data = { value: "具体数值", change: "+/-百分比", trend: "up|down|flat" }
- chart: 趋势图表，data = { labels: ["标签1","标签2"], values: [10,20] }
- table: 数据表格，data = { rows: [["列1","列2"],["数据A","数据B"]] }
- kanban: 状态看板，data = { stages: ["待处理","进行中","已完成"] }
- timeline: 时间线，data = { steps: ["事件1","事件2","事件3"] }
- list: 列表，data = { items: ["事项A","事项B"] }
- report: 报告摘要，data = { summary: "摘要文本", highlights: [{label:"指标",value:"数值"}], detail: { content: "# 详细报告\n..." } }
- html: HTML报告（完整网页内容），data = { html: "<完整的HTML报告内容...>", title: "报告标题" }
- progress: 进度条，data = { value: 65, max: 100, label: "完成度", color: "indigo|emerald|amber|red|blue|purple" }
- status: 状态面板，data = { items: [{label:"服务A", status:"ok|warning|error", value:"运行中"}] }
- universal: 通用容器，data = { content: "markdown文本", contentType: "markdown" }
- adaptive: 智能自适应容器，data = { headline: { title: "概览" }, sections: [{ type: "metrics", metrics: [{ label: "指标", value: "数值" }] }] }
- gauge: 仪表盘，data = { value: 68, min: 0, max: 100, unit: "%", thresholds: [{value:70,color:"#f59e0b"}] }
- funnel: 漏斗图，data = { stages: [{name:"曝光",value:10000,rate:100},{name:"点击",value:3500,rate:35}] }
- radar: 雷达图，data = { labels: ["速度","质量","成本"], values: [80,90,75] }
- heatmap: 热力图，data = { rows: [{x:"周一",y:"上午",value:30},{x:"周二",y:"下午",value:50}] }
- bullet: 子弹图，data = { value: 75, target: 80, max: 100, label: "目标达成率" }
- alert: 告警列表，data = { alerts: [{level:"warning",message:"库存不足",time:"10:30"}] }
- map: 地图，data = { points: [{name:"北京",value:120},{name:"上海",value:95}] }

【数据源配置】
当前环境默认至少可使用以下内置工具：
- 天气查询：{ "type": "skill", "skillId": "weather_query", "input": { "city": "北京", "days": 7 } }

数据源策略：
- 如果用户明确要求真实数据、实时数据、最新数据，请优先配置 dataSource
- 如果是天气类主题，优先使用内置 "weather_query"
- 如果暂时无法确定真实数据源，再退回写入与主题相关的静态 data

【布局规则（网格 12 列）】
- metric: w=3 h=2 | gauge: w=3 h=3 | bullet: w=6 h=2
- chart/table/kanban/timeline/list/funnel/radar/heatmap/alert/map: w=6 h=4
- report: w=8 h=4 或 w=12 h=4 | universal/adaptive: w=6 h=4
- 位置避免重叠，y 坐标优先放在最下方

【关联/穿透配置（可选 link 字段）】
- link = { type: "workspace|widget|url", targetId?: "...", targetTemplate?: "...", url?: "https://...", title?: "..." }

【详情配置（可选 detail 字段）】
- detail = { type: "slide-out", content?: "markdown或html详细内容", width?: "480px" }

请只输出以下 JSON 格式，不要其他内容：
{
  "name": "驾驶舱名称",
  "description": "驾驶舱描述",
  "widgets": [
    {
      "type": "metric|chart|table|kanban|timeline|list|report|html|progress|status|universal|adaptive|gauge|funnel|radar|heatmap|bullet|alert|map",
      "title": "组件标题",
      "position": {"x":0,"y":0,"w":3,"h":2},
      "data": {...},
      "dataSource": { "type": "skill|query|static", ... }
    }
  ]
}`;
}

/**
 * 构建增强 Prompt
 */
export function buildEnhancementPrompt(
  userCommand: string,
  baseSpec: Record<string, unknown>,
  extractedEntities: Record<string, string>
): string {
  const specJson = JSON.stringify(baseSpec, null, 2);

  return `你是一位驾驶舱设计顾问。用户指令如下：
"""
${userCommand}
"""

规则引擎已根据指令自动生成了基础驾驶舱配置：
${specJson}

提取到的实体：${JSON.stringify(extractedEntities)}

你的任务是在此基础上进行"增强"，而不是重新设计。请分析用户指令中是否有以下未被基础配置覆盖的需求：
1. **主题相关性检查**：如果基础配置的 widget 与用户指令主题完全不相关（如用户要天气却给了企业管理组件），必须设置 replaceWidgets: true 替换所有 widgets
2. 描述文案优化（体现用户提到的特定关注点）
3. 额外 widget 建议（用户明确要求的特定指标或视图）
4. **widget 数据增强**：为建议的新 widget 生成与主题相关的有意义数据，禁止占位符（如"—"、"步骤1"）
5. **数据源配置**：如果组件需要获取实时数据，请配置 dataSource 字段

【主题相关性检查（最重要）】
如果基础配置中的 widget 明显与用户指令主题无关，例如：
- 用户要"天气"但基础配置是"核心指标1,248"、"趋势分析"、"Q3目标"
- 用户要"股票"但基础配置是"系统服务状态"、"数据同步"
→ 这种情况必须设置 replaceWidgets: true，并提供完全相关的 widgets

【数据质量要求】
- 禁止占位符数据（如"—"、"示例数据"、"步骤1"、"事项1"）
- 所有数据必须与用户指令的主题相关
- metric: value 为真实数字和单位（如"25°C"、"¥3,200"）
- chart: values 为有趋势的数据
- table/list/timeline: 内容为具体、相关的项目

【数据源配置】
如果组件需要获取实时/真实数据，请配置 dataSource：
- skill: { type: "skill", skillId: "技能名称", input: {参数} }
- query: { type: "query", query: { endpoint: "/api/xxx", method: "GET", params: {} } }
- static: { type: "static" }

【新增widget类型布局尺寸】
- gauge: w=3 h=3 | funnel/radar/heatmap/alert/map: w=6 h=4 | bullet: w=6 h=2

【关联/穿透与详情配置】
- link: { type: "workspace|widget|url", targetId?: "...", targetTemplate?: "...", url?: "...", title?: "..." }
- detail: { type: "slide-out", content?: "详细内容", width?: "480px" }

约束（绝对不可修改）：
- 名称：${baseSpec.name}
- 图标：${baseSpec.icon}
- 主题色：${baseSpec.color}
- 智能体绑定：${JSON.stringify(baseSpec.agentIds)}
- 主智能体：${baseSpec.primaryAgentId}

输出 JSON 格式：
{
  "apply": true,
  "replaceWidgets": false,
  "description": "优化后的描述（可选，不修改则省略）",
  "suggestedWidgets": [
    {
      "type": "metric|chart|table|kanban|timeline|list|report|universal",
      "title": "标题",
      "position": {"x": 0, "y": 0, "w": 3, "h": 2},
      "data": { "value": "25°C", "change": "+2°C", "trend": "up" },
      "dataSource": { "type": "skill", "skillId": "weather_query", "input": { "city": "北京", "days": 7 } },
      "reason": "为什么建议增加这个widget"
    }
  ],
  "layoutComment": "对布局的评价（可选）"
}

如果认为基础配置已足够好，不需要任何增强，请输出：
{"apply": false}

只输出 JSON，不要其他内容。`;
}

// ── 解析 ──

function tryParseJson(raw: string): unknown {
  try {
    const cleaned = raw.trim();
    const codeBlock = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlock ? codeBlock[1].trim() : cleaned;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : jsonStr);
  } catch {
    return null;
  }
}

function parseEnhancement(raw: string): CockpitEnhancement | null {
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (!p.apply) return null;
  return {
    apply: true,
    replaceWidgets: !!p.replaceWidgets,
    description: p.description as string | undefined,
    suggestedWidgets: (p.suggestedWidgets as any[])?.map((w: any) => ({
      type: String(w.type || 'metric'),
      title: String(w.title || '新组件'),
      position: w.position || { x: 0, y: 0, w: 3, h: 2 },
      data: w.data || {},
      ...(w.dataSource ? { dataSource: w.dataSource } : {}),
      reason: String(w.reason || ''),
    })),
    layoutComment: p.layoutComment as string | undefined,
  };
}

function parseGeneratedSpec(raw: string): Record<string, unknown> | null {
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (!p.widgets || !Array.isArray(p.widgets)) return null;

  const widgets = normalizeWidgets(p.widgets, { idPrefix: 'w-gen' });
  if (widgets.length === 0) return null;

  return {
    name: p.name || '新驾驶舱',
    description: p.description || '',
    widgets,
  };
}

// ── 校验 ──

function validateEnhancement(
  enhancement: CockpitEnhancement,
  baseSpec: Record<string, unknown>
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  if (enhancement.suggestedWidgets) {
    for (const w of enhancement.suggestedWidgets) {
      if (!w.title || w.title.length < 1) {
        violations.push(`widget "${w.title || '?'}" 标题不能为空`);
      }
      if (!['metric', 'chart', 'table', 'kanban', 'timeline', 'list', 'report', 'html', 'progress', 'status', 'universal', 'adaptive', 'gauge', 'funnel', 'radar', 'heatmap', 'bullet', 'alert', 'map'].includes(w.type)) {
        violations.push(`widget "${w.title}" 类型 "${w.type}" 不支持`);
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

// ── 应用 ──

export function applyEnhancement(
  baseSpec: Record<string, unknown>,
  enhancement: CockpitEnhancement
): Record<string, unknown> {
  const result = { ...baseSpec };

  if (enhancement.description) {
    result.description = enhancement.description;
  }

  if (enhancement.suggestedWidgets && enhancement.suggestedWidgets.length > 0) {
    const ts = Date.now();
    let counter = 0;
    const nextId = () => `w-${ts}-${++counter}`;

    const newWidgets = enhancement.suggestedWidgets.map((w) => ({
      id: nextId(),
      type: w.type,
      title: w.title,
      position: w.position,
      data: { ...w.data },
      ...(w.dataSource ? { dataSource: w.dataSource } : {}),
    }));

    if (enhancement.replaceWidgets) {
      result.widgets = newWidgets;
    } else {
      const existingWidgets = (result.widgets as any[]) || [];
      result.widgets = [...existingWidgets, ...newWidgets];
    }
  }

  return result;
}

// ── 核心 API ──

/**
 * LLM 直接生成完整驾驶舱配置（根本性改造）
 */
export async function generateCockpitSpec(
  userCommand: string,
  baseSpec: Record<string, unknown>,
  llmConnector: Connector
): Promise<{
  spec: Record<string, unknown>;
  usedLLM: boolean;
}> {
  const prompt = buildGenerationPrompt(userCommand, baseSpec);

  const messages: ChatMessage[] = [
    { role: 'system', content: '你是一位智能驾驶舱架构师，擅长根据用户需求设计数据可视化方案。' },
    { role: 'user', content: prompt },
  ];

  try {
    console.log('[LLMEnhancer] Calling LLM for full spec generation...');
    const content = await llmConnector.chat!(messages, { temperature: 0.5, maxTokens: 2048 });
    console.log('[LLMEnhancer] LLM generation response:', content.slice(0, 400));

    const generated = parseGeneratedSpec(content);
    if (!generated) {
      console.log('[LLMEnhancer] Generation parse failed, fallback to enhancement');
      return { spec: baseSpec, usedLLM: false };
    }

    // 合并：保留 baseSpec 的核心配置（icon, color 等），用生成的内容替换 name/description/widgets
    const mergedSpec = {
      ...baseSpec,
      name: generated.name || baseSpec.name,
      description: generated.description || baseSpec.description,
      widgets: generated.widgets,
    };

    console.log('[LLMEnhancer] Full spec generated:', {
      name: mergedSpec.name,
      widgetCount: (mergedSpec.widgets as any[])?.length || 0,
    });

    return { spec: mergedSpec, usedLLM: true };
  } catch (err: any) {
    console.warn('[LLMEnhancer] Full spec generation failed:', err.message);
    return { spec: baseSpec, usedLLM: false };
  }
}

/**
 * 完整的 LLM 增强流程（保留，作为 fallback）
 */
export async function enhanceCockpitSpec(
  userCommand: string,
  baseSpec: Record<string, unknown>,
  extractedEntities: Record<string, string>,
  llmConnector: Connector
): Promise<{
  spec: Record<string, unknown>;
  enhancement: CockpitEnhancement | null;
  usedLLM: boolean;
}> {
  const prompt = buildEnhancementPrompt(userCommand, baseSpec, extractedEntities);

  const messages: ChatMessage[] = [
    { role: 'system', content: '你是一个驾驶舱设计顾问，擅长在已有方案基础上进行精细化增强。' },
    { role: 'user', content: prompt },
  ];

  try {
    console.log('[LLMEnhancer] Calling LLM for enhancement...');
    const content = await llmConnector.chat!(messages, { temperature: 0.3, maxTokens: 1024 });
    console.log('[LLMEnhancer] LLM response:', content.slice(0, 300));

    const enhancement = parseEnhancement(content);
    if (!enhancement) {
      console.log('[LLMEnhancer] No enhancement needed or parse failed');
      return { spec: baseSpec, enhancement: null, usedLLM: true };
    }

    const validation = validateEnhancement(enhancement, baseSpec);
    if (!validation.valid) {
      console.warn('[LLMEnhancer] Validation failed:', validation.violations);
      return { spec: baseSpec, enhancement: null, usedLLM: true };
    }

    const enhancedSpec = applyEnhancement(baseSpec, enhancement);
    console.log('[LLMEnhancer] Enhancement applied:', {
      descriptionChanged: !!enhancement.description,
      widgetsAdded: enhancement.suggestedWidgets?.length || 0,
      widgetsReplaced: enhancement.replaceWidgets,
    });

    return { spec: enhancedSpec, enhancement, usedLLM: true };
  } catch (err: any) {
    console.warn('[LLMEnhancer] LLM enhancement failed:', err.message);
    return { spec: baseSpec, enhancement: null, usedLLM: false };
  }
}
