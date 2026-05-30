import type { Widget, WidgetType } from '@/types';
import { inferWidgetType, isTypeMismatched } from './widget-type-inferer';

const SUPPORTED_WIDGET_TYPES = new Set<WidgetType>([
  'metric',
  'chart',
  'table',
  'kanban',
  'timeline',
  'list',
  'report',
  'html',
  'progress',
  'status',
  'universal',
  'adaptive',
  'gauge',
  'funnel',
  'radar',
  'heatmap',
  'bullet',
  'alert',
  'map',
]);

const LEGACY_TOP_LEVEL_DATA_FIELDS = new Set([
  'value', 'change', 'trend', 'caption', 'variant', 'accentColor', 'status',
  'label', 'labels', 'values', 'series', 'datasets', 'categories', 'names',
  'xAxis', 'xaxis', 'yAxis', 'yaxis', 'yValues', 'numbers',
  'rows', 'columns', 'records', 'entries',
  'items', 'list', 'tasks', 'todos',
  'stages', 'statuses', 'phases',
  'steps', 'milestones', 'events', 'nodes',
  'summary', 'highlights', 'keyPoints', 'metrics', 'stats', 'overview',
  'content', 'text', 'markdown', 'body', 'html',
  'metric', 'primaryMetric', 'headline', 'sections', 'blocks', 'cards',
  'detail', 'fullContent',
  'min', 'max', 'unit', 'thresholds', 'sparkline',
  'compareValue', 'compareLabel', 'previous', 'previousLabel', 'target', 'targetLabel',
  'current', 'percentage', 'percent', 'goal', 'maximum',
  'alerts', 'notifications', 'message', 'severity', 'level', 'time', 'timestamp',
  'points', 'locations', 'regions', 'cities',
  'color', 'colors',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractLegacyMatrixRows(data: Record<string, unknown>): unknown[][] | null {
  const keys = Object.keys(data);
  if (keys.length < 2 || !keys.every((key) => /^\d+$/.test(key))) {
    return null;
  }

  const sortedKeys = [...keys].sort((a, b) => Number(a) - Number(b));
  const rows = sortedKeys.map((key) => data[key]);
  if (!rows.every(Array.isArray)) {
    return null;
  }

  return rows as unknown[][];
}

function normalizeLegacyDataPayload(data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };

  if ((!('value' in next) || next.value === undefined || next.value === null || next.value === '') && isPlainRecord(next.metric) && next.metric.value !== undefined) {
    next.value = next.metric.value;
    if (next.change === undefined && next.metric.change !== undefined) next.change = next.metric.change;
    if (next.caption === undefined && next.metric.label !== undefined) next.caption = next.metric.label;
    if (next.trend === undefined && next.metric.changeType !== undefined) {
      const changeType = String(next.metric.changeType);
      next.trend = changeType === 'positive' ? 'up' : changeType === 'negative' ? 'down' : 'flat';
    }
  }

  if ((!('value' in next) || next.value === undefined || next.value === null || next.value === '') && isPlainRecord(next.primaryMetric) && next.primaryMetric.value !== undefined) {
    next.value = next.primaryMetric.value;
  }

  if (!Array.isArray(next.alerts)) {
    const message = typeof next.message === 'string' && next.message.trim()
      ? next.message.trim()
      : typeof next.content === 'string' && next.content.trim()
        ? next.content.trim()
        : '';
    if (message) {
      next.alerts = [{
        level: next.level || next.severity || 'info',
        message,
        time: next.time || next.timestamp || '',
      }];
    }
  }

  const matrixRows = extractLegacyMatrixRows(next);
  if (matrixRows && !Array.isArray(next.rows) && !Array.isArray(next.labels) && !Array.isArray(next.items) && !Array.isArray(next.alerts)) {
    next.rows = matrixRows;
  }

  return next;
}

function buildWidgetData(widget: Record<string, unknown>): Record<string, unknown> {
  const data = isPlainRecord(widget.data) ? { ...widget.data } : {};

  for (const [key, value] of Object.entries(widget)) {
    if (key === 'data' || !LEGACY_TOP_LEVEL_DATA_FIELDS.has(key) || value === undefined) {
      continue;
    }
    data[key] = value;
  }

  return normalizeLegacyDataPayload(data);
}

export function getDefaultWidgetSize(type: WidgetType): Widget['position'] {
  const sizeMap: Record<WidgetType, { w: number; h: number }> = {
    metric: { w: 4, h: 2 },
    chart: { w: 6, h: 4 },
    table: { w: 6, h: 4 },
    kanban: { w: 6, h: 4 },
    timeline: { w: 6, h: 4 },
    list: { w: 4, h: 3 },
    report: { w: 8, h: 4 },
    html: { w: 8, h: 4 },
    universal: { w: 6, h: 4 },
    adaptive: { w: 6, h: 4 },
    progress: { w: 4, h: 2 },
    status: { w: 4, h: 3 },
    gauge: { w: 4, h: 3 },
    funnel: { w: 6, h: 4 },
    radar: { w: 5, h: 4 },
    heatmap: { w: 6, h: 4 },
    bullet: { w: 6, h: 2 },
    alert: { w: 5, h: 3 },
    map: { w: 6, h: 4 },
  };

  const size = sizeMap[type] || sizeMap.universal;
  return { x: 0, y: 0, w: size.w, h: size.h };
}

function normalizeWidgetType(rawType: unknown, data: Record<string, unknown>): WidgetType {
  const type = typeof rawType === 'string' ? rawType.trim() : '';
  const inferred = inferWidgetType(data);

  if (type && SUPPORTED_WIDGET_TYPES.has(type as WidgetType) && !isTypeMismatched(type, data)) {
    return type as WidgetType;
  }

  if (SUPPORTED_WIDGET_TYPES.has(inferred as WidgetType)) {
    return inferred as WidgetType;
  }

  if (type && SUPPORTED_WIDGET_TYPES.has(type as WidgetType)) {
    return type as WidgetType;
  }

  return 'universal';
}

function normalizePosition(raw: unknown, index: number): Widget['position'] {
  if (raw && typeof raw === 'object') {
    const pos = raw as Record<string, unknown>;
    const x = Number(pos.x);
    const y = Number(pos.y);
    const w = Number(pos.w);
    const h = Number(pos.h);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)) {
      return {
        x: Math.max(0, Math.floor(x)),
        y: Math.max(0, Math.floor(y)),
        w: Math.min(12, Math.max(1, Math.floor(w))),
        h: Math.max(1, Math.floor(h)),
      };
    }
  }

  const fallback = getDefaultWidgetSize('universal');
  return {
    x: (index * fallback.w) % 12,
    y: Math.floor(index / 2) * 4,
    w: fallback.w,
    h: fallback.h,
  };
}

export function normalizeWidget(rawWidget: unknown, index: number): Widget | null {
  if (!rawWidget || typeof rawWidget !== 'object') {
    return null;
  }

  const widget = rawWidget as Record<string, unknown>;
  const data = buildWidgetData(widget);

  return {
    ...(widget as unknown as Partial<Widget>),
    id: typeof widget.id === 'string' && widget.id.trim() ? widget.id : `widget-fallback-${index + 1}`,
    type: normalizeWidgetType(widget.type, data),
    title: typeof widget.title === 'string' && widget.title.trim() ? widget.title.trim() : `组件 ${index + 1}`,
    position: widget.position && typeof widget.position === 'object'
      ? normalizePosition(widget.position, index)
      : (() => {
          const type = normalizeWidgetType(widget.type, data);
          const size = getDefaultWidgetSize(type);
          return {
            x: (index * size.w) % 12,
            y: Math.floor(index / 2) * Math.max(size.h, 3),
            w: size.w,
            h: size.h,
          };
        })(),
    data,
  };
}

export function normalizeWidgets(rawWidgets: unknown): Widget[] {
  if (!Array.isArray(rawWidgets)) {
    return [];
  }

  return rawWidgets
    .map((widget, index) => normalizeWidget(widget, index))
    .filter((widget): widget is Widget => widget !== null);
}
