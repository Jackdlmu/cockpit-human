// ─── Widget Data Service ───
// Phase 4: 统一数据管道 —— 根据 widget.dataSource 路由到正确的能力
// 改进：通过 AgentRouter 按 agentId 路由到正确的 Connector

import type { ConnectionManager } from '../connection/manager';
import { applyTransform } from './transform';
import { getAgentRouter } from './agent-router';
import { executeTool } from '../tools/registry';

// 最小化类型定义（兼容模板、存储和前端格式）
interface WidgetDataSource {
  type: 'skill' | 'query' | 'static' | 'event';
  skillId?: string;
  agentId?: string;
  connectionId?: string;
  input?: Record<string, unknown>;
  query?: { connectionId?: string; method?: 'GET' | 'POST'; endpoint?: string; sql?: string; params?: Record<string, unknown> };
  eventFilter?: { source?: string; sourceType?: string; type?: string };
  transform?: string;
  fallbackToStatic?: boolean;
}

interface Widget {
  id: string;
  type: string;
  title: string;
  data?: Record<string, unknown>;
  dataSource?: WidgetDataSource;
  detail?: Record<string, unknown>;
}

export interface WidgetDataResult {
  data: unknown;
  source: string;   // 'static' | 'skill' | 'query' | 'event' | 'fallback' | 'llm-proxy'
  latency: number;
  routingInfo?: {
    strategy: string;
    connectionId?: string;
    connectionType?: string;
    reason: string;
  };
}

/**
 * 解析 widget 数据
 * 根据 dataSource.type 路由到不同能力
 */
export async function resolveWidgetData(
  workspaceId: string,
  widget: Widget,
  connectionManager: ConnectionManager,
  context?: Record<string, unknown>,
  useDemoDataFallback?: boolean
): Promise<WidgetDataResult> {
  const start = Date.now();
  const dataSource = widget.dataSource;

  // 没有 dataSource → 直接返回静态 data
  if (!dataSource) {
    return { data: widget.data ?? null, source: 'static', latency: Date.now() - start };
  }

  try {
    switch (dataSource.type) {
      case 'static':
        return resolveStatic(widget, start);
      case 'skill':
        return await resolveSkill(dataSource, widget, connectionManager, start, context, useDemoDataFallback);
      case 'query':
        return await resolveQuery(dataSource, connectionManager, start, context, useDemoDataFallback);
      case 'event':
        return resolveEvent(widget, start);
      default:
        console.warn(`[WidgetData] Unknown dataSource.type: ${(dataSource as any).type}`);
        return fallback(widget, start, useDemoDataFallback);
    }
  } catch (err: any) {
    console.warn(`[WidgetData] Error resolving widget "${widget.title}":`, err.message);
    return fallback(widget, start, useDemoDataFallback, err.message);
  }
}

/** type='static' */
function resolveStatic(widget: Widget, start: number): WidgetDataResult {
  return { data: widget.data ?? null, source: 'static', latency: Date.now() - start };
}

/** type='skill' —— 调用 agent/skill（通过 AgentRouter 路由） */
async function resolveSkill(
  ds: WidgetDataSource,
  widget: Widget,
  cm: ConnectionManager,
  start: number,
  context?: Record<string, unknown>,
  useDemoDataFallback?: boolean
): Promise<WidgetDataResult> {
  if (ds.skillId === 'weather_query') {
    const args = { ...(ds.input || {}), ...(context || {}) };
    const toolResult = await executeTool('weather_query', args);
    if (!toolResult.success) {
      return fallback(widget, start, useDemoDataFallback, toolResult.error || '天气工具执行失败');
    }

    const adapted = adaptToolResultForWidget(widget, toolResult.data);
    return {
      data: adapted,
      source: 'skill',
      latency: Date.now() - start,
      routingInfo: {
        strategy: 'builtin-tool',
        connectionType: 'generic-llm',
        reason: '使用内置 weather_query 工具',
      },
    };
  }

  const router = getAgentRouter();

  // 如果有 AgentRouter，尝试精确路由
  if (router) {
    const route = await router.resolveWidgetRoute(ds, { allowLLMFallback: true });

    if (route) {
      // A. 精确路由到 agent-invoke connector
      if (route.strategy === 'exact' || route.strategy === 'capability') {
        if (route.connector.invokeAgent) {
          const command = ds.skillId
            ? `invoke_skill:${ds.skillId}`
            : (ds.input?.command as string) || '';

          console.log(`[WidgetData] Skill routed: ${ds.agentId || ds.skillId || 'default'} → ${route.connectionId} (${route.connectionType})`);

          const raw = await route.connector.invokeAgent({
            agentId: ds.agentId || ds.skillId || 'default',
            command,
            context: { ...context, ...ds.input },
          });

          const transformed = applyTransform(raw, ds.transform);
          return {
            data: transformed,
            source: 'skill',
            latency: Date.now() - start,
            routingInfo: {
              strategy: route.strategy,
              connectionId: route.connectionId,
              connectionType: route.connectionType,
              reason: route.reason,
            },
          };
        }
      }

      // B. Fallback 到 LLM（connector 支持 chat）
      if (route.strategy === 'fallback-llm' && route.connector.chat) {
        console.log(`[WidgetData] Skill fallback to LLM for "${widget.title}": ${route.reason}`);
        const prompt = buildLLMProxyPrompt(widget, ds, context);
        const raw = await route.connector.chat([
          { role: 'system', content: '你是一个数据代理。根据请求生成模拟数据或执行简单分析。' },
          { role: 'user', content: prompt },
        ], { temperature: 0.3, maxTokens: 1024 });

        const parsed = tryParseLLMResponse(raw);
        return {
          data: parsed ?? raw,
          source: 'llm-proxy',
          latency: Date.now() - start,
          routingInfo: {
            strategy: route.strategy,
            connectionId: route.connectionId,
            connectionType: route.connectionType,
            reason: route.reason,
          },
        };
      }
    }
  }

  // C. 无 AgentRouter 或路由失败：兼容旧逻辑
  const connector = cm.getConnectorByCapability('agent-invoke');
  if (!connector || !connector.invokeAgent) {
    return fallback(widget, start, useDemoDataFallback, 'No connector supports agent-invoke');
  }

  const command = ds.skillId
    ? `invoke_skill:${ds.skillId}`
    : (ds.input?.command as string) || '';

  console.log(`[WidgetData] Skill invoke (legacy): ${ds.skillId || ds.agentId || 'default'} → ${command.slice(0, 60)}`);

  const raw = await connector.invokeAgent({
    agentId: ds.agentId || 'default',
    command,
    context: { ...context, ...ds.input },
  });

  const transformed = applyTransform(raw, ds.transform);
  return { data: transformed, source: 'skill', latency: Date.now() - start };
}

/** type='query' —— 直连查询 */
async function resolveQuery(
  ds: WidgetDataSource,
  cm: ConnectionManager,
  start: number,
  context?: Record<string, unknown>,
  useDemoDataFallback?: boolean
): Promise<WidgetDataResult> {
  if (!ds.query) {
    throw new Error('dataSource.query is required for type=query');
  }

  let connector;
  if (ds.query.connectionId) {
    connector = cm.getConnector(ds.query.connectionId);
  } else {
    // 自动路由：优先找支持 cockpit-execute 的 connector，其次是 agent-invoke
    connector = cm.getConnectorByCapability('cockpit-execute')
      || cm.getConnectorByCapability('agent-invoke');
  }

  if (!connector) {
    throw new Error(`No connector available for query (connectionId=${ds.query.connectionId || 'auto'})`);
  }

  console.log(`[WidgetData] Query: ${ds.query.method || 'GET'} ${ds.query.endpoint || ds.query.sql?.slice(0, 40) || ''}`);

  // 合并外部 context 到 query 参数
  const mergedParams = { ...context, ...ds.query.params };

  let raw: unknown;

  // 如果 connector 支持 cockpit-execute，用它执行命令
  if (connector.executeOnCockpit && ds.query.endpoint) {
    raw = await connector.executeOnCockpit(
      ds.query.endpoint,
      ds.query.method || 'GET',
      mergedParams
    );
  }
  // 否则通过 agent-invoke 代理查询
  else if (connector.invokeAgent) {
    raw = await connector.invokeAgent({
      agentId: 'data-query-agent',
      command: ds.query.sql || ds.query.endpoint || '',
      context: mergedParams,
    });
  } else {
    return fallback(widget, start, useDemoDataFallback, 'Connector does not support query operations');
  }

  const transformed = applyTransform(raw, ds.transform);
  return { data: transformed, source: 'query', latency: Date.now() - start };
}

/** type='event' —— 返回初始数据，前端通过 WebSocket 实时更新 */
function resolveEvent(widget: Widget, start: number): WidgetDataResult {
  // event 类型：后端只提供初始数据，实时更新走 EventBus → WebSocket
  return { data: widget.data ?? null, source: 'event', latency: Date.now() - start };
}

/** 回退到静态数据 */
function fallback(
  widget: Widget,
  start: number,
  useDemoDataFallback?: boolean,
  reason?: string
): WidgetDataResult {
  const ds = widget.dataSource;

  // Widget 级别显式禁用 fallback
  if (ds && ds.fallbackToStatic === false) {
    return {
      data: { __error: reason || 'Data source failed', __widgetTitle: widget.title },
      source: 'fallback',
      latency: Date.now() - start,
    };
  }

  // Workspace 级别禁用 demo 数据 fallback → 优先保留已有的静态数据，仅在无数据时返回空结构
  if (useDemoDataFallback === false) {
    if (widget.data && typeof widget.data === 'object' && !Array.isArray(widget.data) && Object.keys(widget.data).length > 0) {
      return {
        data: widget.data,
        source: 'fallback',
        latency: Date.now() - start,
      };
    }
    return {
      data: buildEmptyData(widget.type),
      source: 'fallback',
      latency: Date.now() - start,
    };
  }

  // 回退到 demo 数据（默认行为，兼容旧数据）
  if (reason) {
    console.log(`[WidgetData] Fallback to static data for "${widget.title}": ${reason}`);
  }
  const staticData = widget.data ?? null;
  if (staticData && typeof staticData === 'object' && !Array.isArray(staticData)) {
    (staticData as Record<string, unknown>).__source = 'static';
  }
  return { data: staticData, source: 'fallback', latency: Date.now() - start };
}

/** 根据 widget 类型构建空数据结构 */
function buildEmptyData(widgetType: string): Record<string, unknown> {
  switch (widgetType) {
    case 'metric':
      return { value: '—', change: '', trend: 'flat' };
    case 'chart':
      return { labels: [], values: [] };
    case 'table':
      return { rows: [], columns: [] };
    case 'list':
      return { items: [] };
    case 'kanban':
      return { stages: [] };
    case 'timeline':
      return { steps: [] };
    case 'report':
      return { summary: '', highlights: [] };
    case 'html':
      return { html: '', title: '' };
    case 'progress':
      return { value: 0, max: 100, label: '' };
    case 'status':
      return { items: [] };
    case 'gauge':
      return { value: 0, min: 0, max: 100, unit: '%' };
    case 'funnel':
      return { stages: [] };
    case 'radar':
      return { labels: [], values: [] };
    case 'heatmap':
      return { rows: [] };
    case 'bullet':
      return { value: 0, target: 0, max: 100, label: '' };
    case 'alert':
      return { alerts: [] };
    case 'map':
      return { points: [] };
    case 'universal':
      return {};
    case 'adaptive':
      return { sections: [] };
    default:
      return {};
  }
}

function adaptToolResultForWidget(widget: Widget, rawData: unknown): unknown {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return rawData;
  }

  const weather = rawData as Record<string, unknown>;
  const current = weather.current && typeof weather.current === 'object'
    ? weather.current as Record<string, unknown>
    : {};
  const forecast = Array.isArray(weather.forecast)
    ? weather.forecast.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : [];
  const city = String(weather.city || widget.title || '');

  switch (widget.type) {
    case 'metric':
      return {
        value: String(current.tempHigh || current.temp || current.tempLow || '—'),
        change: String(current.weather || current.wind || ''),
        trend: 'flat',
        caption: city,
      };
    case 'chart':
      return {
        labels: forecast.map((item) => String(item.date || item.dayOfWeek || '')),
        values: forecast.map((item) => {
          const raw = String(item.tempHigh || item.temp || item.tempLow || '0');
          const numeric = Number(raw.replace(/[^\d.-]/g, ''));
          return Number.isFinite(numeric) ? numeric : 0;
        }),
      };
    case 'table':
      return {
        columns: ['日期', '天气', '高温', '低温', '湿度', '风力'],
        rows: forecast.map((item) => [
          String(item.date || item.dayOfWeek || ''),
          String(item.weather || ''),
          String(item.tempHigh || ''),
          String(item.tempLow || ''),
          String(item.humidity || ''),
          String(item.wind || ''),
        ]),
      };
    case 'list':
      return {
        items: forecast.map((item) => {
          const date = String(item.date || item.dayOfWeek || '');
          const weatherText = String(item.weather || '');
          const tempHigh = String(item.tempHigh || '');
          const tempLow = String(item.tempLow || '');
          return `${date} ${weatherText} ${tempLow} ~ ${tempHigh}`.trim();
        }),
      };
    case 'status':
      return {
        items: forecast.slice(0, 4).map((item) => ({
          label: String(item.date || item.dayOfWeek || ''),
          status: 'ok',
          value: String(item.weather || item.tempHigh || ''),
        })),
      };
    case 'map':
      return {
        points: [{
          name: city,
          value: Number(String(current.tempHigh || current.temp || '0').replace(/[^\d.-]/g, '')) || 0,
        }],
      };
    case 'report':
      return {
        summary: `${city}未来${forecast.length || 1}天天气概览`,
        highlights: forecast.slice(0, 3).map((item) => ({
          label: String(item.date || item.dayOfWeek || ''),
          value: `${String(item.weather || '')} ${String(item.tempLow || '')} ~ ${String(item.tempHigh || '')}`.trim(),
        })),
      };
    default:
      return rawData;
  }
}

// ── LLM Proxy 辅助 ──

function buildLLMProxyPrompt(widget: Widget, ds: WidgetDataSource, context?: Record<string, unknown>): string {
  return `请为驾驶舱组件「${widget.title}」（类型：${widget.type}）生成数据。

请求类型：${ds.skillId ? `调用技能 ${ds.skillId}` : ds.agentId ? `代理智能体 ${ds.agentId}` : '通用数据请求'}
上下文：${JSON.stringify(context ?? {})}

请返回 JSON 格式的数据，适合 ${widget.type} 类型组件展示。`;
}

function tryParseLLMResponse(raw: string): unknown {
  try {
    const cleaned = raw.trim();
    // 尝试提取 JSON 代码块
    const codeBlock = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlock) {
      return JSON.parse(codeBlock[1].trim());
    }
    // 尝试直接解析
    if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
      return JSON.parse(cleaned);
    }
  } catch {
    // ignore parse errors
  }
  return null;
}
