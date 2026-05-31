// ─── CockpitAgent ───
// 驾驶舱智能体：智能驾驶舱的「大脑」
// 职责：意图识别 → 任务规划 → 连接路由 → 执行 → 结果聚合

import type { ConnectionManager } from '../connection/manager';
import type { Connector, ChatMessage } from '../connection/types';
import type {
  Intent,
  TaskPlan,
  SubTask,
  SubTaskResult,
  CockpitAgentResponse,
  CockpitAgentChunk,
  ExecutionContext,
} from './types';
import { recognizeIntent, recognizeIntents, recognizeByLLM, recognizeByRule, extractEntities } from './intent';
import type { RecognizeResult } from './engine';
import { planTasks, planByRule, buildDefaultCockpitSpec, sanitizeCockpitName } from './planner';
import { generateCockpitSpec } from './engine/llm-enhancer';
import * as workspaceStore from '../data/workspaceStore';
import type { WorkspaceData } from '../data/workspacesData';
import { eventBus } from '../services/event-bus';
import { getAgentRouter } from '../services/agent-router';
import { normalizeWidgets } from '../services/widget-normalizer';
import { createWorkspaceWithLifecycle } from '../services/workspace-creation';
import { contextBuilder } from '../services/context-builder';

function scalarToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizeLooseText(value: unknown): string {
  return scalarToText(value).replace(/\s+/g, '').toLowerCase();
}

function normalizeHistoryRole(role: string): ChatMessage['role'] {
  if (role === 'assistant' || role === 'system' || role === 'tool' || role === 'user') {
    return role;
  }
  if (role === 'agent') {
    return 'assistant';
  }
  return 'user';
}

function isGenericReplyText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  return (
    /^查询结果如下[:：]?$/.test(normalized) ||
    /^命令执行成功[。.]?$/.test(normalized) ||
    /^任务执行完毕[。.]?$/.test(normalized) ||
    /^ok$/i.test(normalized) ||
    /^success$/i.test(normalized)
  );
}

function summarizeLabelValuePairs(labels: unknown[], values: unknown[], limit = 4): string {
  return labels
    .slice(0, Math.min(limit, values.length))
    .map((label, index) => {
      const left = scalarToText(label);
      const right = scalarToText(values[index]);
      return [left, right].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join('；');
}

function hasMeaningfulRecordData(record: Record<string, unknown>): boolean {
  const preferredKeys = [
    'message',
    'summary',
    'value',
    'rows',
    'items',
    'metrics',
    'highlights',
    'alerts',
    'stages',
    'steps',
    'labels',
    'values',
    'points',
    'data',
    'result',
    'results',
    'payload',
  ];

  for (const key of preferredKeys) {
    if (hasMeaningfulTaskData(record[key])) {
      return true;
    }
  }

  return Object.entries(record)
    .filter(([key]) => {
      const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
      if (
        normalizedKey === 'sessionid' ||
        normalizedKey === 'requestid' ||
        normalizedKey === 'traceid' ||
        normalizedKey === 'taskid' ||
        normalizedKey === 'status' ||
        normalizedKey === 'success' ||
        normalizedKey === 'ok' ||
        normalizedKey === 'code' ||
        normalizedKey === 'latency' ||
        normalizedKey === 'duration' ||
        normalizedKey === 'elapsed'
      ) {
        return false;
      }
      if (normalizedKey.endsWith('id') || normalizedKey.endsWith('ids')) {
        return false;
      }
      return true;
    })
    .some(([, value]) => hasMeaningfulTaskData(value));
}

function hasMeaningfulTaskData(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (typeof data === 'string') return !isGenericReplyText(data);
  if (typeof data === 'number') return true;
  if (typeof data === 'boolean') return data;
  if (Array.isArray(data)) return data.some((item) => hasMeaningfulTaskData(item));
  if (typeof data === 'object') {
    return hasMeaningfulRecordData(data as Record<string, unknown>);
  }
  return true;
}

function summarizeArrayValues(items: unknown[], limit = 3): string {
  return items
    .slice(0, limit)
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return String(item);
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const label = scalarToText(record.label ?? record.title ?? record.name ?? record.status ?? record.key);
        const value = scalarToText(record.value ?? record.summary ?? record.description ?? record.detail);
        return [label, value].filter(Boolean).join(' ');
      }
      return '';
    })
    .filter(Boolean)
    .join('；');
}

function summarizeWidgetForReply(widget: any): string | null {
  if (!widget || typeof widget !== 'object') return null;
  const title = scalarToText(widget.title) || '未命名组件';
  const data = widget.data && typeof widget.data === 'object' ? widget.data as Record<string, unknown> : {};

  if (scalarToText(data.value)) {
    const value = scalarToText(data.value);
    const change = scalarToText(data.change);
    return `${title}：${value}${change ? `（变化 ${change}）` : ''}`;
  }

  if (Array.isArray(data.metrics) && data.metrics.length > 0) {
    const metrics = summarizeArrayValues(data.metrics, 4);
    if (metrics) return `${title}：${metrics}`;
  }

  if (Array.isArray(data.highlights) && data.highlights.length > 0) {
    const highlights = summarizeArrayValues(data.highlights, 4);
    if (highlights) return `${title}：${highlights}`;
  }

  if (scalarToText(data.summary)) {
    return `${title}：${scalarToText(data.summary).slice(0, 140)}`;
  }

  if (Array.isArray(data.labels) && Array.isArray(data.values) && data.labels.length > 0 && data.values.length > 0) {
    const points = summarizeLabelValuePairs(data.labels, data.values as unknown[], 4);
    if (points) return `${title}：${points}`;
  }

  if (Array.isArray(data.rows) && data.rows.length > 0) {
    const rows = summarizeArrayValues(data.rows, 2);
    if (rows) return `${title}：${rows}`;
  }

  if (Array.isArray(data.items) && data.items.length > 0) {
    const items = summarizeArrayValues(data.items, 3);
    if (items) return `${title}：${items}`;
  }

  if (Array.isArray(data.alerts) && data.alerts.length > 0) {
    const alerts = summarizeArrayValues(data.alerts, 3);
    if (alerts) return `${title}：${alerts}`;
  }

  if (Array.isArray(data.stages) && data.stages.length > 0) {
    const stages = summarizeArrayValues(data.stages, 4);
    if (stages) return `${title}：${stages}`;
  }

  if (Array.isArray(data.steps) && data.steps.length > 0) {
    const steps = summarizeArrayValues(data.steps, 4);
    if (steps) return `${title}：${steps}`;
  }

  return null;
}

function buildWorkspaceContextFallbackMessage(command: string, workspace?: WorkspaceData): string | null {
  if (!workspace || !Array.isArray(workspace.widgets) || workspace.widgets.length === 0) {
    return null;
  }

  const normalizedCommand = normalizeLooseText(command);
  const ranked = workspace.widgets
    .map((widget) => {
      let score = 0;
      const title = normalizeLooseText(widget?.title);
      if (title && normalizedCommand.includes(title)) score += 5;

      const data = widget?.data && typeof widget.data === 'object' ? widget.data as Record<string, unknown> : {};
      const metricLabels = Array.isArray(data.metrics)
        ? data.metrics.map((item) => normalizeLooseText((item as Record<string, unknown>)?.label))
        : [];
      const matchedMetric = metricLabels.some((label) => label && normalizedCommand.includes(label));
      if (matchedMetric) score += 4;

      const highlightLabels = Array.isArray(data.highlights)
        ? data.highlights.map((item) => normalizeLooseText((item as Record<string, unknown>)?.label ?? (item as Record<string, unknown>)?.title))
        : [];
      const matchedHighlight = highlightLabels.some((label) => label && normalizedCommand.includes(label));
      if (matchedHighlight) score += 4;

      const chartLabels = Array.isArray(data.labels)
        ? data.labels.map((item) => normalizeLooseText(item))
        : [];
      const matchedChartLabel = chartLabels.some((label) => label && normalizedCommand.includes(label));
      if (matchedChartLabel) score += 3;

      if (/(当前|这个|该|此|这里|上面|驾驶舱|组件|卡片|图上|页面|已有|现有)/.test(command)) score += 1;
      return { widget, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected = (ranked.some((item) => item.score > 0) ? ranked.filter((item) => item.score > 0) : ranked)
    .map((item) => summarizeWidgetForReply(item.widget))
    .filter((item): item is string => !!item)
    .slice(0, 4);

  if (selected.length === 0) return null;
  return `我没有拿到新的外部查询结果，但当前驾驶舱里已有这些信息：\n${selected.map((line, index) => `${index + 1}. ${line}`).join('\n')}`;
}

export class CockpitAgent {
  // 会话缓存：保存每个 session 的 planning 结果（用于 create 时复用 spec）
  private sessionCache = new Map<string, any>();

  constructor(private connectionManager: ConnectionManager) {}

  // ── 构建带 workspace 上下文的 system prompt ──

  private buildSystemPrompt(context: ExecutionContext, basePrompt: string): string {
    const parts: string[] = [basePrompt];
    parts.push('\n\n回答要求：如果用户询问当前驾驶舱中的具体组件、具体数值、排行、趋势、摘要，请优先引用当前驾驶舱上下文和组件数据回答；没有明确数据时要明确说明，不要编造。');
    if (context.promptContext) {
      parts.push('\n\n' + context.promptContext);
    } else if (context.workspace) {
      const ws = context.workspace;
      const widgets = ws.widgets || [];
      const widgetSummary = widgets.slice(0, 20).map((w: any) => {
        const dataHint = w.data?.value ? ` (数据: ${w.data.value})` : '';
        return `- [${w.type}] ${w.title}${dataHint}`;
      }).join('\n');
      parts.push(`\n\n【当前驾驶舱上下文】
名称：${ws.name}
描述：${ws.description || '无'}
组件概况：共 ${widgets.length} 个组件
${widgetSummary ? '组件列表：\n' + widgetSummary : ''}
主控智能体：${ws.primaryAgentId || '无'}
协作智能体：${(ws.agentIds || []).join('、') || '无'}`);
    }
    return parts.join('');
  }

  // ── 获取 LLM 连接器（用于意图识别和规划）─

  private getLLMConnector(): Connector | undefined {
    const connectors = this.connectionManager.getAllConnectorsByCapability('llm-chat');
    // 优先使用 generic-llm（OpenAI 兼容格式，支持最广泛，包括 Kimi / OpenAI / 本地模型）
    // openclaw/yonclaw 是平台特定协议，仅在明确配置且 generic-llm 不可用时使用
    return connectors.find(c => c.type === 'generic-llm')
      || connectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw')
      || connectors[0];
  }

  private shouldPreferWorkspaceContextAnswer(command: string, context: ExecutionContext, intent: Intent): boolean {
    if (!context.workspace || (intent.type !== 'chat' && intent.type !== 'query_data')) {
      return false;
    }

    if (/(刷新|更新|同步|重新获取|重新查询|联网|调用|抓取|拉取|执行|最新|实时)/.test(command)) {
      return false;
    }

    if (intent.type === 'chat') {
      return true;
    }

    if (/(当前|这个|该|此|这里|上面|驾驶舱|组件|卡片|图上|页面|已有|现有|显示|里面)/.test(command)) {
      return true;
    }

    const normalizedCommand = normalizeLooseText(command);
    return (context.workspace.widgets || []).some((widget: any) => {
      const title = normalizeLooseText(widget?.title);
      if (title && normalizedCommand.includes(title)) return true;
      const data = widget?.data && typeof widget.data === 'object' ? widget.data as Record<string, unknown> : {};
      if (Array.isArray(data.metrics)) {
        return data.metrics.some((item) => {
          const label = normalizeLooseText((item as Record<string, unknown>)?.label);
          return label && normalizedCommand.includes(label);
        });
      }
      if (Array.isArray(data.highlights)) {
        const matchedHighlight = data.highlights.some((item) => {
          const label = normalizeLooseText((item as Record<string, unknown>)?.label ?? (item as Record<string, unknown>)?.title);
          return label && normalizedCommand.includes(label);
        });
        if (matchedHighlight) return true;
      }
      if (Array.isArray(data.labels)) {
        const matchedLabel = data.labels.some((item) => {
          const label = normalizeLooseText(item);
          return label && normalizedCommand.includes(label);
        });
        if (matchedLabel) return true;
      }
      return intent.type === 'query_data';
    });
  }

  private async answerFromWorkspaceContext(command: string, context: ExecutionContext, llmConnector: Connector): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(
      context,
      '你是一个智能驾驶舱助手。你可以查看驾驶舱中的数据、分析趋势、回答用户关于当前驾驶舱的问题。'
    );
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...((context.history || []).map((h) => ({ role: normalizeHistoryRole(h.role), content: h.content }))),
      { role: 'user', content: command },
    ];
    const reply = (await llmConnector.chat!(messages, { temperature: 0.3, maxTokens: 1200 })).trim();
    if (!reply || isGenericReplyText(reply)) {
      const fallback = buildWorkspaceContextFallbackMessage(command, context.workspace);
      if (fallback) {
        return fallback;
      }
    }
    return reply || '当前驾驶舱里还没有足够的数据来回答这个问题，请先刷新或补充数据。';
  }

  private formatQueryResultMessage(results: SubTaskResult[], context: ExecutionContext): string | null {
    const summarizeResultData = (data: unknown): string => {
      if (typeof data === 'string') {
        return isGenericReplyText(data) ? '' : data.trim();
      }
      if (Array.isArray(data)) {
        return summarizeArrayValues(data, 4);
      }
      if (data && typeof data === 'object') {
        const record = data as Record<string, unknown>;
        const message = scalarToText(record.message);
        if (message && !isGenericReplyText(message)) {
          return message;
        }

        const nested = record.data ?? record.result ?? record.results ?? record.payload;
        if (nested) {
          const nestedSummary = summarizeResultData(nested);
          if (nestedSummary) {
            return nestedSummary;
          }
        }

        if (scalarToText(record.summary)) {
          return scalarToText(record.summary);
        }
        if (scalarToText(record.value)) {
          return scalarToText(record.value);
        }
        const rows = Array.isArray(record.rows) ? summarizeArrayValues(record.rows, 3) : '';
        if (rows) return rows;
        const items = Array.isArray(record.items) ? summarizeArrayValues(record.items, 4) : '';
        if (items) return items;
        const metrics = Array.isArray(record.metrics) ? summarizeArrayValues(record.metrics, 4) : '';
        if (metrics) return metrics;
        const highlights = Array.isArray(record.highlights) ? summarizeArrayValues(record.highlights, 4) : '';
        if (highlights) return highlights;
        if (Array.isArray(record.labels) && Array.isArray(record.values)) {
          const points = summarizeLabelValuePairs(record.labels, record.values as unknown[], 4);
          if (points) return points;
        }
      }
      return '';
    };

    const lines = results
      .filter((result) => result.success && hasMeaningfulTaskData(result.data))
      .map((result) => {
        const summary = summarizeResultData(result.data);
        if (!summary) {
          return '';
        }
        if (/^查询结果如下[:：]/.test(summary) || /[。！？\n]$/.test(summary) || summary.length > 80) {
          return summary;
        }
        return `查询结果如下：${summary}`;
      })
      .filter(Boolean);

    if (lines.length > 0) {
      return lines[0];
    }

    return buildWorkspaceContextFallbackMessage(context.command || '', context.workspace);
  }

  // ── 流式处理入口 ──

  async *handleCommandStream(
    command: string,
    context: ExecutionContext
  ): AsyncGenerator<CockpitAgentChunk, CockpitAgentResponse, unknown> {
    const llmConnector = this.getLLMConnector();
    const startTime = Date.now();

    const llmStatus = llmConnector
      ? `已连接（${llmConnector.type} · ${llmConnector.connectionId}）`
      : '未配置 — 请在设置中添加支持 llm-chat 能力的连接（如通用大模型）';
    console.log(`[CockpitAgent] LLM connector: ${llmConnector ? llmConnector.type + ' (' + llmConnector.connectionId + ')' : 'none (rule-based)'}`);

    // 将原始指令注入 context，供 executeSubTask 使用
    context.command = command;

    // ── Stage 1: 意图识别（Phase 2/3：多意图引擎） ──
    yield { chunk: `🤔 分析意图中...（LLM 状态：${llmStatus}）\n`, stage: 'thinking', done: false };

    let intent: Intent;
    let multiResult: RecognizeResult | null = null;
    let intentError: string | undefined;

    try {
      multiResult = await recognizeIntents(command, llmConnector || undefined);
      intent = multiResult.primary;

      const ruleMatchDesc = multiResult.diagnostics.ruleMatches
        .slice(0, 3)
        .map((m) => `${m.type}(${Math.round(m.score * 100)}%)`)
        .join(', ');
      const sourceTag = multiResult.diagnostics.llmUsed ? '🧠+📋' : '📋';
      yield { chunk: `💡 识别到意图：${intentLabel(intent.type)} ${sourceTag}（置信度 ${Math.round(intent.confidence * 100)}%，规则匹配：${ruleMatchDesc}）\n`, stage: 'thinking', done: false };

      if (multiResult.secondary.length > 0) {
        const secondaryDesc = multiResult.secondary.map((s) => `${intentLabel(s.type)}(${Math.round(s.confidence * 100)}%)`).join(', ');
        yield { chunk: `   └─ 多意图检测：${secondaryDesc}\n`, stage: 'thinking', done: false };
      }
    } catch (err: any) {
      intentError = err.message;
      console.warn('[CockpitAgent] Intent engine failed:', err.message, '→ fallback to legacy');
      if (llmConnector && llmConnector.chat) {
        try {
          const llmIntent = await recognizeByLLM(command, llmConnector);
          if (llmIntent && llmIntent.confidence > 0.6) {
            intent = llmIntent;
          } else {
            const ruleResult = recognizeByRule(command);
            intent = ruleResult || { type: 'chat', confidence: 0.5, entities: extractEntities(command), raw: command };
          }
        } catch {
          const ruleResult = recognizeByRule(command);
          intent = ruleResult || { type: 'chat', confidence: 0.5, entities: extractEntities(command), raw: command };
        }
      } else {
        const ruleResult = recognizeByRule(command);
        intent = ruleResult || { type: 'chat', confidence: 0.5, entities: extractEntities(command), raw: command };
      }
      yield { chunk: `💡 识别到意图：${intentLabel(intent.type)} 📋（置信度 ${Math.round(intent.confidence * 100)}%，来源：规则 fallback）\n`, stage: 'thinking', done: false };
    }

    // ── Phase 2: chat 意图短路路径（高置信度 + 无次要意图） ──
    const canShortcutByContext = llmConnector && llmConnector.chat
      && (!multiResult || multiResult.secondary.length === 0)
      && ((intent.type === 'chat' && intent.confidence >= 0.7) || this.shouldPreferWorkspaceContextAnswer(command, context, intent));
    if (canShortcutByContext && llmConnector && llmConnector.chat) {
      yield { chunk: `💬 基于「${context.workspace?.name || '当前驾驶舱'}」上下文直接回答...\n`, stage: 'thinking', done: false };
      const chatStart = Date.now();
      try {
        const reply = await this.answerFromWorkspaceContext(command, context, llmConnector);
        const latency = Date.now() - chatStart;
        yield { chunk: `\n`, stage: 'summarizing', done: false };
        yield {
          chunk: '\n',
          stage: 'summarizing',
          done: true,
          message: reply,
          card: null,
          suggestedCommands: this.suggestCommands(intent.type),
          results: [{ taskId: 'direct-chat', success: true, data: reply, latency }],
          usedLLM: true,
        };
        return {
          message: reply,
          card: null,
          suggestedCommands: this.suggestCommands(intent.type),
          plan: undefined,
          results: [{ taskId: 'direct-chat', success: true, data: reply, latency }],
          sessionId: context.sessionId,
        };
      } catch (err: any) {
        console.warn('[CockpitAgent] Context shortcut failed:', err.message, '→ falling back to full pipeline');
        yield { chunk: `⚠️ 直接对话失败，回退到标准流程...\n`, stage: 'thinking', done: false };
      }
    }

    // ── Stage 2: 任务规划（Phase 3: 规则打底 + LLM 增强） ──
    yield { chunk: '📋 规划任务...\n', stage: 'planning', done: false };

    // ── 已有 Workspace 上下文保护 ──
    // 如果指定了 workspaceId，将 create_cockpit 意图降级为 execute_command，避免重复创建
    if (context.workspaceId && (intent.type === 'create_cockpit' || intent.type === 'plan_cockpit')) {
      console.log(`[CockpitAgent] Workspace context detected (${context.workspaceId}), downgrading ${intent.type} → execute_command`);
      intent = { ...intent, type: 'execute_command', confidence: intent.confidence };
    }

    // 构建意图列表：主意图 + 次要意图
    const allIntents: Intent[] = [intent];
    if (multiResult && multiResult.secondary.length > 0) {
      allIntents.push(...multiResult.secondary);
    }

    let plan: TaskPlan | undefined;
    let planError: string | undefined;

    // ── 外部平台规划优先：如果存在 cockpit-plan 能力，直接调用外部规划 ──
    if (intent.type === 'create_cockpit' || intent.type === 'plan_cockpit') {
      const planConnectors = this.connectionManager.getAllConnectorsByCapability('cockpit-plan');
      const planConnector = planConnectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw') || planConnectors[0];
      if (planConnector && planConnector.planCockpit) {
        try {
          yield { chunk: `📋 正在调用外部规划平台（${planConnector.type} · ${planConnector.connectionId}）...\n`, stage: 'planning', done: false };
          const planResult = await planConnector.planCockpit({ goal: command, constraints: [] });
          console.log(`[CockpitAgent] External plan result from ${planConnector.connectionId}:`, JSON.stringify(planResult).slice(0, 300));

          // 从外部规划结果中提取 spec
          const externalSpec = (planResult as any)?.cockpitSpec || (planResult as any)?.spec || planResult;
          if (externalSpec && typeof externalSpec === 'object') {
            // 补全缺失字段
            const enrichedEntities = { ...extractEntities(intent.raw), ...intent.entities };
            const baseSpec = buildDefaultCockpitSpec(
              externalSpec.name || enrichedEntities.cockpitType || '新驾驶舱',
              command,
              enrichedEntities
            );
            const mergedSpec = { ...baseSpec, ...externalSpec };

            plan = {
              intent,
              tasks: [{
                id: `external-plan-${Date.now()}`,
                description: `创建驾驶舱：${mergedSpec.name}`,
                capability: 'cockpit-create',
                params: { spec: mergedSpec },
              }],
              reasoning: `外部平台规划（${planConnector.connectionId}）→ 本地补全执行`,
              usedLLM: true,
            };
            yield { chunk: `📋 外部规划完成，生成驾驶舱「${mergedSpec.name}」\n`, stage: 'planning', done: false };
          }
        } catch (err: any) {
          console.warn('[CockpitAgent] External planCockpit failed:', err.message, '→ fallback to local planning');
          yield { chunk: `📋 外部规划不可用，回退到本地规划...\n`, stage: 'planning', done: false };
        }
      }
    }

    // 本地规划兜底
    if (!plan) {
      try {
        plan = await planTasks(allIntents, context, llmConnector);
        console.log(`[CockpitAgent] Plan: ${plan.tasks.length} tasks, usedLLM: ${plan.usedLLM}`);
      } catch (err: any) {
        planError = err.message;
        console.warn('[CockpitAgent] Plan failed:', err.message, '→ fallback to rule');
        plan = planByRule(allIntents, context);
        plan.usedLLM = false;
      }
    }

    // 简洁的规划结果输出
    const planTag = plan.usedLLM ? '🧠+📋 规则打底 + LLM 增强' : '📋 规则模板';
    yield { chunk: `📋 ${planTag}：${plan.reasoning}，共 ${plan.tasks.length} 个子任务\n`, stage: 'planning', done: false };

    // 显示 LLM 增强详情（如果有）
    if (plan.usedLLM && plan.reasoning.includes('LLM 增强')) {
      const enhancements: string[] = [];
      if (plan.reasoning.includes('描述优化')) enhancements.push('描述优化');
      if (plan.reasoning.includes('widget')) enhancements.push('widget 增强');
      if (enhancements.length > 0) {
        yield { chunk: `   └─ LLM 增强项：${enhancements.join('，')}\n`, stage: 'planning', done: false };
      }
    }

    // ── Stage 3: 执行子任务 ──
    const results: SubTaskResult[] = [];

    for (const task of plan.tasks) {
      const execName = (task.params.spec as any)?.name || '(无名称)';
      yield { chunk: `⚙️ 执行：${task.description}（spec.name=${execName}）...`, stage: 'executing', done: false };

      const taskStart = Date.now();
      let result: SubTaskResult;

      try {
        const data = await this.executeSubTask(task, context);
        result = {
          taskId: task.id,
          success: true,
          data,
          latency: Date.now() - taskStart,
        };
        yield { chunk: ` ✅（${result.latency}ms）\n`, stage: 'executing', done: false };
      } catch (err: any) {
        result = {
          taskId: task.id,
          success: false,
          error: err.message || '执行失败',
          latency: Date.now() - taskStart,
        };
        yield { chunk: ` ❌ ${result.error}\n`, stage: 'executing', done: false };
      }

      results.push(result);
    }

    // ── Stage 4: 结果聚合 ──
    yield { chunk: '📝 整理结果...\n', stage: 'summarizing', done: false };

    const response = await this.aggregateResponse(plan, results, context, llmConnector);
    const createResult = results.find((result) => {
      if (!result.success || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
        return false;
      }
      const task = plan.tasks.find((item) => item.id === result.taskId);
      return task?.capability === 'cockpit-create';
    });
    const createdWorkspace = createResult?.data as (WorkspaceData & {
      initializing?: boolean;
      initializationMode?: 'llm' | 'real-data';
    }) | undefined;

    // 最终 chunk 包含完整响应数据（SSE 通过 yield 传递，return 值无法被 for await 捕获）
    const usedLLM = plan.usedLLM ?? false;
    const finalMessage = usedLLM
      ? response.message
      : response.message;
    yield {
      chunk: '\n',
      stage: 'summarizing',
      done: true,
      message: finalMessage,
      card: response.card,
      suggestedCommands: response.suggestedCommands,
      results,
      usedLLM,
      workspace: createdWorkspace,
      initializing: createdWorkspace?.initializing,
      initializationMode: createdWorkspace?.initializationMode,
    };

    return {
      ...response,
      plan,
      results,
      workspace: createdWorkspace,
      initializing: createdWorkspace?.initializing,
      initializationMode: createdWorkspace?.initializationMode,
      sessionId: context.sessionId,
    };
  }

  // ── 非流式处理入口（兼容旧接口）─

  async handleCommand(
    command: string,
    context: ExecutionContext
  ): Promise<CockpitAgentResponse> {
    // 直接内联执行，避免重复执行（generator 遍历一次 + 重新执行一次）
    const llmConnector = this.getLLMConnector();
    context.command = command;

    let intent = await recognizeIntent(command, llmConnector);

    if (llmConnector && llmConnector.chat && this.shouldPreferWorkspaceContextAnswer(command, context, intent)) {
      try {
        const reply = await this.answerFromWorkspaceContext(command, context, llmConnector);
        return {
          message: reply,
          card: null,
          suggestedCommands: this.suggestCommands(intent.type),
          results: [{ taskId: 'direct-context-chat', success: true, data: reply, latency: 0 }],
          sessionId: context.sessionId,
        };
      } catch (err: any) {
        console.warn('[CockpitAgent] Non-stream context shortcut failed:', err.message, '→ falling back to pipeline');
      }
    }

    // 已有 Workspace 上下文保护
    if (context.workspaceId && (intent.type === 'create_cockpit' || intent.type === 'plan_cockpit')) {
      console.log(`[CockpitAgent] Workspace context detected (${context.workspaceId}), downgrading ${intent.type} → execute_command`);
      intent = { ...intent, type: 'execute_command', confidence: intent.confidence };
    }

    let plan: TaskPlan;

    // 外部平台规划优先
    if (intent.type === 'create_cockpit' || intent.type === 'plan_cockpit') {
      const planConnectors = this.connectionManager.getAllConnectorsByCapability('cockpit-plan');
      const planConnector = planConnectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw') || planConnectors[0];
      if (planConnector && planConnector.planCockpit) {
        try {
          const planResult = await planConnector.planCockpit({ goal: command, constraints: [] });
          const externalSpec = (planResult as any)?.cockpitSpec || (planResult as any)?.spec || planResult;
          if (externalSpec && typeof externalSpec === 'object') {
            const enrichedEntities = { ...extractEntities(intent.raw), ...intent.entities };
            const baseSpec = buildDefaultCockpitSpec(
              externalSpec.name || enrichedEntities.cockpitType || '新驾驶舱',
              command,
              enrichedEntities
            );
            const mergedSpec = { ...baseSpec, ...externalSpec };
            plan = {
              intent,
              tasks: [{
                id: `external-plan-${Date.now()}`,
                description: `创建驾驶舱：${mergedSpec.name}`,
                capability: 'cockpit-create',
                params: { spec: mergedSpec },
              }],
              reasoning: `外部规划完成（${planConnector.connectionId}）`,
              usedLLM: true,
            };
          } else {
            plan = await planTasks(intent, context, llmConnector);
          }
        } catch (err: any) {
          console.warn('[CockpitAgent] External planCockpit failed:', err.message, '→ fallback to local');
          plan = await planTasks(intent, context, llmConnector);
        }
      } else {
        plan = await planTasks(intent, context, llmConnector);
      }
    } else {
      plan = await planTasks(intent, context, llmConnector);
    }
    const results: SubTaskResult[] = [];

    for (const task of plan.tasks) {
      const taskStart = Date.now();
      try {
        const data = await this.executeSubTask(task, context);
        results.push({ taskId: task.id, success: true, data, latency: Date.now() - taskStart });
      } catch (err: any) {
        results.push({ taskId: task.id, success: false, error: err.message, latency: Date.now() - taskStart });
      }
    }

    const response = await this.aggregateResponse(plan, results, context, llmConnector);
    const createResult = results.find((result) => {
      if (!result.success || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
        return false;
      }
      const task = plan.tasks.find((item) => item.id === result.taskId);
      return task?.capability === 'cockpit-create';
    });
    const createdWorkspace = createResult?.data as (WorkspaceData & {
      initializing?: boolean;
      initializationMode?: 'llm' | 'real-data';
    }) | undefined;
    return {
      ...response,
      plan,
      results,
      workspace: createdWorkspace,
      initializing: createdWorkspace?.initializing,
      initializationMode: createdWorkspace?.initializationMode,
      sessionId: context.sessionId,
    };
  }

  // ── 子任务执行 ──

  private async executeSubTask(task: SubTask, context: ExecutionContext): Promise<unknown> {
    // 内部能力（不依赖外部 Connector）
    if (task.capability === 'cockpit-create') {
      const cachedSpec = context.sessionId ? this.sessionCache.get(context.sessionId) : undefined;
      // 支持两种参数格式：params.spec（嵌套）或 params 直接包含配置字段（扁平）
      const flatParams = task.params.spec ? undefined : task.params;
      let spec = (task.params.spec as any) || cachedSpec || {
        name: (flatParams?.name as string) || (task.params.name as string) || '新驾驶舱',
        description: (flatParams?.description as string) || (task.params.description as string) || '',
        icon: (flatParams?.icon as string) || undefined,
        color: (flatParams?.color as string) || undefined,
        widgets: (flatParams?.widgets as any[]) || undefined,
        agentIds: (flatParams?.agentIds as string[]) || undefined,
        primaryAgentId: (flatParams?.primaryAgentId as string) || undefined,
      };
      // 最终防线：如果名称是默认的"新驾驶舱"，从原始指令中重新提取
      if ((spec.name === '新驾驶舱' || !sanitizeCockpitName(spec.name)) && context.command) {
        const ruleEntities = extractEntities(context.command);
        let forcedName = ruleEntities.cockpitType
          ? `${ruleEntities.cockpitType}驾驶舱`
          : (context.command.match(/["']([^"']+?)["']/)?.[1] || '');

        // 增强：尝试从"查询/展示/查看/分析/监控"等动词后面的内容提取主题
        if (!forcedName || forcedName === '新驾驶舱' || forcedName.length < 3) {
          const topicMatch = context.command.match(/(?:查询|展示|查看|分析|监控|统计|关于|针对|聚焦)(.+?)(?:的|数据|情况|驾驶舱|仪表盘|$)/i);
          if (topicMatch) {
            const topic = topicMatch[1].trim().replace(/^[的\s]+/, '').replace(/[\s,，]+$/, '');
            if (topic && topic.length > 1) {
              forcedName = `${topic}驾驶舱`;
            }
          }
        }

        if (forcedName && forcedName !== '新驾驶舱' && forcedName !== '驾驶舱') {
          spec.name = sanitizeCockpitName(forcedName);
        }
      }
      // 统一清理名称
      spec.name = sanitizeCockpitName(spec.name);
      // 确保名称有效：过短或只剩介词时恢复默认值
      if (!spec.name || spec.name.length < 2 || /^[在从对往向于的]/.test(spec.name)) {
        spec.name = '新驾驶舱';
      }
      // 如果 spec 缺少 widgets，先尝试用 LLM 生成合适的组件
      if (!spec.widgets || spec.widgets.length === 0) {
        const llm = this.getLLMConnector();
        if (llm && llm.chat) {
          try {
            console.log(`[CockpitAgent] Spec has no widgets, trying LLM generation for "${spec.name}"`);
            const { spec: generatedSpec, usedLLM } = await generateCockpitSpec(
              context.command || task.description || '',
              spec,
              llm
            );
            if (usedLLM && generatedSpec.widgets && (generatedSpec.widgets as any[]).length > 0) {
              spec = { ...spec, ...generatedSpec };
              console.log(`[CockpitAgent] LLM generated ${(generatedSpec.widgets as any[]).length} widgets`);
            }
          } catch (err: any) {
            console.warn('[CockpitAgent] LLM widget generation failed:', err.message);
          }
        }
        // 如果 LLM 生成后仍然为空，保留空 widgets（不再 fallback 到演示数据）
        if (!spec.widgets || spec.widgets.length === 0) {
          console.warn('[CockpitAgent] No widgets available after all attempts, creating empty cockpit');
        }
      }

      spec.widgets = normalizeWidgets(spec.widgets, { idPrefix: 'w' });
      spec = this.enrichWeatherWidgets(spec, context.command || task.description || '');

      // ── 多智能体适配：根据实际可用连接调整 agentIds ──
      const router = getAgentRouter();
      if (router) {
        try {
          const { mode, reason, availableAgentCount } = await router.suggestAgentMode();
          const domain = extractEntities(context.command || '').domain || spec.domain || '通用';
          const { matched, suggested, unavailable } = await router.suggestAgentsForDomain(
            domain,
            spec.agentIds
          );

          console.log(`[CockpitAgent] Agent mode: ${mode} (${reason}), available: ${availableAgentCount}`);

          if (mode === 'llm-only') {
            // 纯 LLM 模式：清空 agentIds，保留为 llm-only
            spec.agentMode = 'llm-only';
            spec.agentIds = [];
            spec.primaryAgentId = '';
            if (spec.description && !spec.description.includes('(LLM)')) {
              spec.description += '（由 LLM 驱动）';
            }
          } else if (matched.length > 0) {
            // 有匹配的智能体：使用实际可用的
            spec.agentIds = matched.map((a) => a.id);
            spec.primaryAgentId = matched[0].id;
            spec.agentMode = matched.length === 1 ? 'single' : mode;

            // 补充建议的智能体
            if (suggested.length > 0 && mode !== 'single') {
              const extra = suggested.slice(0, 2);
              spec.agentIds = [...spec.agentIds, ...extra.map((a) => a.id)];
              console.log(`[CockpitAgent] Auto-added suggested agents: ${extra.map((a) => a.id).join(', ')}`);
            }
          } else if (suggested.length > 0) {
            // 没有模板匹配的，用领域推荐的
            spec.agentIds = suggested.slice(0, 2).map((a) => a.id);
            spec.primaryAgentId = spec.agentIds[0];
            spec.agentMode = suggested.length === 1 ? 'single' : mode;
          }

          // 如果有不可用的，在描述中提示
          if (unavailable.length > 0) {
            console.warn(`[CockpitAgent] Template agents unavailable: ${unavailable.join(', ')}`);
          }
        } catch (err: any) {
          console.warn('[CockpitAgent] Agent adaptation failed:', err.message);
        }
      }

      // ── 外部平台增强：优先调用 OpenClaw/YonClaw 的 planCockpit ──
      const planConnectors = this.connectionManager.getAllConnectorsByCapability('cockpit-plan');
      const planConnector = planConnectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw') || planConnectors[0];
      if (planConnector && planConnector.planCockpit) {
        try {
          console.log(`[CockpitAgent] Routing cockpit-plan to external connector: ${planConnector.connectionId}`);
          const planResult = await planConnector.planCockpit({
            goal: spec.name,
            constraints: [spec.description || ''],
          });
          if (planResult && typeof planResult === 'object') {
            // 合并外部规划结果到本地 spec
            if ((planResult as any).name) spec.name = (planResult as any).name;
            if ((planResult as any).description) spec.description = (planResult as any).description;
            if ((planResult as any).widgets) spec.widgets = (planResult as any).widgets;
            if ((planResult as any).agents) spec.agentIds = (planResult as any).agents;
            spec.widgets = normalizeWidgets(spec.widgets, { idPrefix: 'w' });
            spec = this.enrichWeatherWidgets(spec, context.command || task.description || '');
            console.log(`[CockpitAgent] External plan merged: ${JSON.stringify(planResult).slice(0, 200)}`);
          }
        } catch (err: any) {
          console.warn('[CockpitAgent] External planCockpit failed:', err.message, '→ using local spec');
        }
      }

      // ── 外部平台创建：如果存在 cockpit-create 能力，路由到外部 ──
      const createConnectors = this.connectionManager.getAllConnectorsByCapability('cockpit-create');
      const createConnector = createConnectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw') || createConnectors[0];
      if (createConnector && createConnector.createCockpit) {
        try {
          console.log(`[CockpitAgent] Routing cockpit-create to external connector: ${createConnector.connectionId}`);
          const externalResult = await createConnector.createCockpit(spec);
          console.log(`[CockpitAgent] External createCockpit result:`, externalResult);
          // 外部创建成功，也同步到本地存储
        } catch (err: any) {
          console.warn('[CockpitAgent] External createCockpit failed:', err.message, '→ falling back to local');
        }
      }

      if (context.sessionId) this.sessionCache.delete(context.sessionId);
      const initPrompt = typeof spec.initPrompt === 'string' && spec.initPrompt.trim()
        ? spec.initPrompt.trim()
        : (context.command || '').trim();
      const creation = await createWorkspaceWithLifecycle(
        {
          ...spec,
          initPrompt,
          templateName: spec.templateName || spec.name,
          useDemoDataFallback: spec.useDemoDataFallback ?? false,
        },
        {
          source: 'cockpit-agent',
          connectionManager: this.connectionManager,
          initSourceType: 'agent',
          resetAgentsWithoutConnection: true,
        }
      );

      if (creation.initializationMode !== undefined) {
        return {
          ...creation.workspace,
          initializing: creation.initializing,
          initializationMode: creation.initializationMode,
        };
      }

      return creation.workspace;
    }

    let connector = task.targetConnection
      ? this.connectionManager.getConnector(task.targetConnection)
      : this.connectionManager.getConnectorByCapability(task.capability);

    // agent-invoke 降级：如果没有 agent-invoke 连接，尝试用 LLM 代理
    if (!connector && task.capability === 'agent-invoke') {
      connector = this.getLLMConnector() || undefined;
    }

    if (!connector) {
      throw new Error(`未找到支持能力「${task.capability}」的连接`);
    }

    switch (task.capability) {
      case 'llm-chat': {
        const msg = (task.params.message as string) || (task.params.input as string) || '';
        const systemPrompt = this.buildSystemPrompt(context,
          '你是一个智能驾驶舱助手。你可以查看驾驶舱中的数据、分析趋势、回答用户关于当前驾驶舱的问题。');
        const messages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: msg },
        ];
        if (!connector.chat) throw new Error('连接器不支持 chat');
        return connector.chat(messages);
      }

      case 'agent-list': {
        if (!connector.listAgents) throw new Error('连接器不支持 agent-list');
        return connector.listAgents();
      }

      case 'agent-invoke': {
        try {
          if (!connector.invokeAgent) throw new Error('连接器不支持 agent-invoke');
          return await connector.invokeAgent({
            agentId: (task.params.agentId as string) || 'default',
            command: (task.params.command as string) || '',
            context: task.params,
          });
        } catch (err: any) {
          // 降级到 llm-chat：agent-invoke 失败后，尝试用 LLM 代理
          const llm = this.getLLMConnector();
          if (llm && llm.chat) {
            console.log(`[CockpitAgent] agent-invoke failed (${err.message}), fallback to LLM`);
            const cmd = (task.params.command as string) || '';
            const ws = context.workspace;
            const widgetDesc = ws && ws.widgets
              ? ws.widgets.map((w: any) => `- ${w.title}（${w.type}）`).join('\n')
              : '无';
            const systemPrompt = this.buildSystemPrompt(context,
              '你是一个数据查询代理。根据用户请求返回简洁的结果。如果查询结果可以填充到驾驶舱组件中，请在回答末尾附加JSON代码块，格式：{"widgets":[{"title":"组件标题","data":{...}}]}');
            const messages: ChatMessage[] = [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `当前驾驶舱组件：\n${widgetDesc}\n\n用户请求：${cmd}` },
            ];
            const reply = await llm.chat(messages, { temperature: 0.3, maxTokens: 2048 });

            // 尝试从回复中提取 widget 数据更新
            if (ws && ws.id) {
              try {
                const dataUpdate = this.tryExtractWidgetUpdate(reply, ws.widgets || []);
                if (dataUpdate && dataUpdate.length > 0) {
                  const updatedWidgets = (ws.widgets || []).map((w: any) => {
                    const patch = dataUpdate.find((u: any) => u.title === w.title);
                    if (patch && patch.data && typeof patch.data === 'object') {
                      return { ...w, data: { ...(w.data || {}), ...patch.data } };
                    }
                    return w;
                  });
                  await workspaceStore.updateWorkspace(ws.id, { widgets: updatedWidgets });
                  const refreshed = await workspaceStore.getWorkspace(ws.id);
                  if (refreshed) {
                    await contextBuilder.build(refreshed);
                  }
                  eventBus.publish({
                    id: `evt-${Date.now()}`,
                    source: 'cockpit-agent-query',
                    sourceType: 'yonclaw',
                    type: 'workspace.updated',
                    payload: { workspaceId: ws.id, name: ws.name },
                    timestamp: new Date().toISOString(),
                  });
                }
              } catch (e) {
                // 解析失败不影响正常回复
              }
            }
            return reply;
          }
          throw err;
        }
      }

      case 'cockpit-plan': {
        if (!connector.planCockpit) throw new Error('连接器不支持 cockpit-plan');
        const planResult = await connector.planCockpit({
          goal: (task.params.goal as string) || context.workspaceId || '',
          constraints: (task.params.constraints as string[]) || [],
          context: task.params,
        });
        // 缓存 planning 结果中的 cockpitSpec，供后续 create 使用
        if (planResult.cockpitSpec && context.sessionId) {
          this.sessionCache.set(context.sessionId, planResult.cockpitSpec);
        }
        return planResult;
      }

      case 'cockpit-execute': {
        if (!connector.executeOnCockpit) throw new Error('连接器不支持 cockpit-execute');
        return connector.executeOnCockpit(
          (task.params.workspaceId as string) || context.workspaceId || '',
          (task.params.command as string) || '',
          task.params
        );
      }

      default:
        throw new Error(`未识别的能力「${task.capability}」— 请检查 LLM 返回的任务格式是否正确`);
    }
  }

  // ── 结果聚合 ──

  private async aggregateResponse(
    plan: TaskPlan,
    results: SubTaskResult[],
    context: ExecutionContext,
    llmConnector?: Connector
  ): Promise<Pick<CockpitAgentResponse, 'message' | 'card' | 'suggestedCommands'>> {
    // 所有任务成功
    const allSuccess = results.every((r) => r.success);
    const successResults = results.filter((r) => r.success);
    const hasMeaningfulSuccessData = successResults.some((result) => hasMeaningfulTaskData(result.data));

    // 先通过规则聚合获取 card（LLM 聚合可能丢失结构化数据）
    const ruleResult = this.aggregateByRule(plan, results, context);

    // chat 意图：executeSubTask 的 llm-chat 已返回完整回答，无需再次总结
    if (plan.intent.type === 'chat') {
      // 如果 llm-chat 子任务成功，直接使用其结果作为 message
      const chatResult = successResults.find((r) => {
        const task = plan.tasks.find((t) => t.id === r.taskId);
        return task?.capability === 'llm-chat' && typeof r.data === 'string';
      });
      if (chatResult) {
        return {
          message: String(chatResult.data),
          card: ruleResult.card,
          suggestedCommands: this.suggestCommands(plan.intent.type),
        };
      }
      // 否则 fallback 到规则聚合
      return ruleResult;
    }

    if (plan.intent.type === 'query_data' && !hasMeaningfulSuccessData) {
      if (llmConnector && llmConnector.chat && context.workspace) {
        try {
          const reply = await this.answerFromWorkspaceContext(context.command || plan.intent.raw, context, llmConnector);
          return {
            message: reply,
            card: ruleResult.card,
            suggestedCommands: this.suggestCommands(plan.intent.type),
          };
        } catch (err: any) {
          console.warn('[CockpitAgent] Query fallback to context chat failed:', err.message);
        }
      }

      const fallback = buildWorkspaceContextFallbackMessage(context.command || plan.intent.raw, context.workspace);
      if (fallback) {
        return {
          message: fallback,
          card: ruleResult.card,
          suggestedCommands: this.suggestCommands(plan.intent.type),
        };
      }
    }

    // 尝试用 LLM 生成优美的聚合回复
    if (llmConnector && llmConnector.chat && allSuccess && successResults.length > 0) {
      try {
        const prompt = this.buildAggregationPrompt(plan, results, context);
        const messages: ChatMessage[] = [
          { role: 'system', content: '你是一个结果汇总助手。将执行结果整理成简洁友好的回复。' },
          { role: 'user', content: prompt },
        ];
        const summary = await llmConnector.chat(messages, { temperature: 0.5, maxTokens: 800 });
        return {
          message: summary,
          card: ruleResult.card,        // 保留规则聚合生成的 card
          suggestedCommands: this.suggestCommands(plan.intent.type),
        };
      } catch {
        // fallback 到规则聚合
      }
    }

    // 规则聚合（fallback）
    return ruleResult;
  }

  private buildAggregationPrompt(
    plan: TaskPlan,
    results: SubTaskResult[],
    context: ExecutionContext
  ): string {
    const lines: string[] = [
      `用户指令：${plan.intent.raw}`,
      `意图：${plan.intent.type}`,
      `驾驶舱ID：${context.workspaceId || '无'}`,
      '',
      context.promptContext ? `当前驾驶舱上下文：\n${context.promptContext}\n` : '',
      '执行结果：',
    ];

    for (const result of results) {
      const task = plan.tasks.find((t) => t.id === result.taskId);
      lines.push(`- ${task?.description || result.taskId}: ${result.success ? '成功' : '失败'}`);
      if (result.data) lines.push(`  数据：${JSON.stringify(result.data).slice(0, 500)}`);
      if (result.error) lines.push(`  错误：${result.error}`);
    }

    lines.push('', '请用 2-3 句话总结结果，面向用户。');
    return lines.join('\n');
  }

  private aggregateByRule(
    plan: TaskPlan,
    results: SubTaskResult[],
    context: ExecutionContext
  ): Pick<CockpitAgentResponse, 'message' | 'card' | 'suggestedCommands'> {
    const successCount = results.filter((r) => r.success).length;
    const totalCount = results.length;

    // 收集各任务数据用于生成 card
    let cardData: any = null;
    for (const result of results) {
      if (result.success && result.data) {
        const task = plan.tasks.find((t) => t.id === result.taskId);
        if (task?.capability === 'agent-list' && Array.isArray(result.data)) {
          cardData = {
            type: 'table',
            title: '智能体列表',
            columns: [{ key: 'name', label: '名称' }, { key: 'status', label: '状态' }],
            rows: result.data.map((a: any) => ({ name: a.name || '-', status: a.status || '-' })),
          };
        } else if (task?.capability === 'cockpit-plan') {
          const data = result.data as any;
          // 如果有 cockpitSpec，展示完整配置预览
          if (data?.cockpitSpec) {
            const spec = data.cockpitSpec;
            cardData = {
              type: 'data',
              title: spec.name || '驾驶舱规划方案',
              subtitle: spec.description || '',
              metric: { value: String(spec.widgets?.length || 0), label: '组件数' },
              data: {
                icon: spec.icon,
                color: spec.color,
                widgets: spec.widgets?.map((w: any) => w.title).join('、') || '',
                agents: spec.agentIds?.join('、') || '',
              },
            };
          } else {
            cardData = {
              type: 'workflow',
              title: '驾驶舱规划',
              steps: data?.plan?.steps?.map((s: any, i: number) => ({
                id: s.id,
                label: s.description,
                status: i === 0 ? 'active' : 'pending',
              })) || [],
            };
          }
        } else if (task?.capability === 'cockpit-create' && result.success) {
          const ws = result.data as any;
          cardData = {
            type: 'data',
            title: ws?.name || '驾驶舱创建成功',
            subtitle: '已添加到驾驶舱列表',
            metric: { value: String(ws?.widgets?.length || 0), label: '组件数' },
          };
        }
      }
    }

    // 根据意图类型生成消息
    let message = '';
    switch (plan.intent.type) {
      case 'plan_cockpit':
        message = `已为您规划驾驶舱方案，共 ${totalCount} 个步骤，${successCount} 个成功执行。`;
        break;
      case 'create_cockpit': {
        if (successCount === totalCount) {
          message = '驾驶舱创建成功！您可以继续配置或查看详情。';
        } else {
          const firstFail = results.find((r) => !r.success);
          message = `驾驶舱创建失败（${successCount}/${totalCount}）` + (firstFail?.error ? `：${firstFail.error}` : '');
        }
        break;
      }
      case 'execute_command':
        message = successCount === totalCount
          ? '命令执行成功。'
          : `命令执行遇到问题（${totalCount - successCount} 个失败）。`;
        break;
      case 'query_data':
        message = successCount > 0
          ? (
            this.formatQueryResultMessage(results, context)
            || buildWorkspaceContextFallbackMessage(context.command || '', context.workspace)
            || '当前未返回可展示的数据，请尝试刷新数据或换个问法。'
          )
          : '查询失败，请稍后重试。';
        break;
      case 'list_agents':
        message = successCount > 0 ? '当前可用智能体：' : '无法获取智能体列表。';
        break;
      default:
        message = successCount === totalCount
          ? '任务执行完毕。'
          : `部分任务未成功（${totalCount - successCount} 个失败）。`;
    }

    return {
      message,
      card: cardData,
      suggestedCommands: this.suggestCommands(plan.intent.type),
    };
  }

  private suggestCommands(intentType: string): string[] {
    const suggestions: Record<string, string[]> = {
      plan_cockpit: ['确认创建', '调整方案', '查看详情'],
      create_cockpit: ['查看驾驶舱', '添加组件', '配置数据源'],
      execute_command: ['查看结果', '撤销操作', '继续执行'],
      query_data: ['刷新数据', '导出报表', '分析趋势'],
      list_agents: ['调用智能体', '查看详情', '刷新列表'],
      chat: ['继续对话', '查看帮助', '执行任务'],
    };
    return suggestions[intentType] || ['继续对话'];
  }

  private enrichWeatherWidgets(spec: any, command: string): any {
    if (!spec || !Array.isArray(spec.widgets)) return spec;
    const text = String(command || '');
    if (!/(天气|气温|降雨|预报|weather)/i.test(text)) {
      return spec;
    }

    const city = this.extractWeatherCity(text);
    const days = this.extractWeatherDays(text);
    if (!city) {
      return spec;
    }

    const widgets = spec.widgets.map((widget: any) => {
      if (!widget || typeof widget !== 'object') return widget;
      if (widget.dataSource?.type === 'skill' && widget.dataSource.skillId) {
        return widget;
      }

      const weatherCapableTypes = new Set(['metric', 'chart', 'table', 'list', 'status', 'map', 'report']);
      if (!weatherCapableTypes.has(widget.type)) {
        return widget;
      }

      return {
        ...widget,
        dataSource: {
          type: 'skill',
          skillId: 'weather_query',
          input: { city, days },
          fallbackToStatic: true,
        },
      };
    });

    return {
      ...spec,
      widgets,
      useDemoDataFallback: false,
    };
  }

  private extractWeatherCity(command: string): string | null {
    const patterns = [
      /(?:查询|查看|获取|展示|显示|分析)?([\u4e00-\u9fa5]{2,8})(?:七日|7日|未来七天|未来7天|天气|气温|天气预报)/,
      /([\u4e00-\u9fa5]{2,8})(?:天气|气温|天气预报)/,
      /(?:weather|forecast)\s+for\s+([a-zA-Z\s-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = command.match(pattern);
      const value = match?.[1]?.trim();
      if (value) {
        return value.replace(/^(关于|有关|一下|一下子)/, '').trim();
      }
    }

    return null;
  }

  private extractWeatherDays(command: string): number {
    const match = command.match(/(\d+)\s*(?:日|天|day|days)/i);
    const raw = match ? Number(match[1]) : NaN;
    if (Number.isFinite(raw) && raw > 0) {
      return Math.min(14, raw);
    }
    if (/(七日|7日|七天|7天|一周)/.test(command)) {
      return 7;
    }
    return 7;
  }

  // ── 辅助：从 LLM 回复中提取 widget 数据更新 ──
  private tryExtractWidgetUpdate(reply: string, widgets: any[]): Array<{ title: string; data: Record<string, unknown> }> | null {
    try {
      const codeMatch = reply.match(/```json\s*\n?([\s\S]*?)\n?```/);
      const jsonStr = codeMatch ? codeMatch[1].trim() : reply;
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
}

// ── 辅助 ──

function intentLabel(type: string): string {
  const labels: Record<string, string> = {
    plan_cockpit: '规划驾驶舱',
    create_cockpit: '创建驾驶舱',
    execute_command: '执行命令',
    query_data: '查询数据',
    list_agents: '列出智能体',
    chat: '通用对话',
  };
  return labels[type] || type;
}

// 全局单例（由 index.ts 初始化）
export let cockpitAgent: CockpitAgent | null = null;

export function initCockpitAgent(cm: ConnectionManager): CockpitAgent {
  cockpitAgent = new CockpitAgent(cm);
  return cockpitAgent;
}
