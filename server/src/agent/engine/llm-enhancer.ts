// ─── LLM Enhancer ───
// Phase 3: LLM 协同策略
// 规则打底 → LLM 增强（生成 patch）→ 校验应用

import type { Connector, ChatMessage } from '../../connection/types';

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

【任务要求】
1. 分析用户指令的主题和意图（如天气分析、股票追踪、项目进度、行业研究等）
2. 设计驾驶舱名称、描述和组件列表
3. 每个组件必须包含有意义的示例数据，禁止使用占位符

【禁止使用的占位符】
- value: "—"、"N/A"、"null"
- 列表项: "步骤1"、"事项1"、"示例数据"
- 表格行: "示例客户"、"示例渠道"、"—"
- chart: values 全为 0 或相同的数字

【组件类型说明】
- metric: 关键指标数字卡，data = { value: "具体数值", change: "+/-百分比", trend: "up|down|flat" }
- chart: 趋势图表，data = { labels: ["标签1","标签2"], values: [10,20] }
- table: 数据表格，data = { rows: [["列1","列2"],["数据A","数据B"]] }
- kanban: 状态看板，data = { stages: ["待处理","进行中","已完成"] }
- timeline: 时间线，data = { steps: ["事件1","事件2","事件3"] }
- list: 列表，data = { items: ["事项A","事项B"] }
- report: 报告摘要，data = { summary: "摘要文本", highlights: [{label:"指标",value:"数值"}], detail: { content: "# 详细报告\n..." } }
- universal: 通用容器（当无法确定具体类型时使用），data = { content: "markdown文本", contentType: "markdown" }

【布局规则（网格 12 列）】
- metric: w=3 h=2
- chart/table/kanban/timeline/list: w=6 h=4
- report: w=9 h=4 或 w=12 h=4
- universal: w=6 h=4
- 位置避免重叠，y 坐标优先放在最下方

请只输出以下 JSON 格式，不要其他内容：
{
  "name": "驾驶舱名称",
  "description": "驾驶舱描述",
  "widgets": [
    {
      "type": "metric|chart|table|kanban|timeline|list|report|universal",
      "title": "组件标题",
      "position": {"x":0,"y":0,"w":3,"h":2},
      "data": {...}
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
1. 描述文案优化（体现用户提到的特定关注点，如"华东区"、"大客户转化率"等）
2. 额外 widget 建议（用户明确要求的特定指标或视图）
3. **widget 数据增强**：请为建议的新 widget 生成**有意义的示例数据**，而不是占位符（如"—"、"步骤1"）。例如行业分析场景应生成看起来真实的市场规模、投融资金额、企业名称等。
4. 如果基础配置中的 widget 与用户需求完全不相关，请设置 replaceWidgets: true 建议替换所有 widgets。
5. 布局微调建议（如果用户有明确的空间或排列要求）

【重要】数据质量要求：
- 禁止生成占位符数据（如"—"、"示例数据"、"步骤1"、"事项1"）
- metric 类型：value 应为看起来真实的数字和单位（如"1,860亿"、"¥320"）
- chart 类型：values 应为有趋势的真实数据（如[120,280,520,980]）
- table 类型：rows 应为真实的行数据（如[["OpenAI","GPT-4","1000亿+"]]）
- list 类型：items 应为具体的列表项（如["欧盟AI法案生效","中国生成式AI管理办法"]）
- timeline 类型：steps 应为具体的事件节点（如["Transformer诞生","ChatGPT引爆"]）
- report 类型：summary 应为完整的分析摘要，highlights 应为关键指标，支持 detail.content 存放详细报告内容

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
      "data": { "value": "1,860亿", "change": "+38.5%", "trend": "up" },
      "dataSource": {
        "type": "skill",
        "skillId": "agent.skillName",
        "agentId": "agent-id",
        "input": {},
        "transform": "({ result }) => ({ value: result })",
        "fallbackToStatic": true
      },
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

  // 标准化 widget 结构
  const widgets = (p.widgets as any[]).map((w: any, i: number) => ({
    id: w.id || `w-gen-${Date.now()}-${i}`,
    type: String(w.type || 'metric'),
    title: String(w.title || '新组件'),
    position: w.position || { x: (i * 3) % 12, y: Math.floor(i / 4) * 4, w: 3, h: 2 },
    data: w.data || {},
    ...(w.dataSource ? { dataSource: w.dataSource } : {}),
    ...(w.detail ? { detail: w.detail } : {}),
  }));

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
      if (!['metric', 'chart', 'table', 'kanban', 'timeline', 'list', 'report', 'universal'].includes(w.type)) {
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
