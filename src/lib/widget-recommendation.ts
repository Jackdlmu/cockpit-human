import type { WidgetType } from '@/types';
import { inferWidgetType, isTypeMismatched } from './widget-type-inferer';

export type WidgetSize = { w: number; h: number };

const BASE_SIZE: Record<WidgetType, WidgetSize> = {
  metric: { w: 3, h: 2 },
  chart: { w: 6, h: 4 },
  table: { w: 6, h: 4 },
  kanban: { w: 6, h: 4 },
  timeline: { w: 8, h: 4 },
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

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
}

function firstArray(data: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function numericValues(data: Record<string, unknown>): number[] {
  return firstArray(data, ['values', 'data', 'series', 'yValues', 'yaxis', 'yAxis', 'numbers'])
    .map((value) => typeof value === 'number' ? value : Number(value))
    .filter((value) => Number.isFinite(value));
}

function labelCount(data: Record<string, unknown>): number {
  return firstArray(data, ['labels', 'categories', 'dimensions', 'names', 'xaxis', 'xAxis']).length;
}

function rowCount(data: Record<string, unknown>): number {
  return firstArray(data, ['rows', 'data', 'records', 'entries']).length;
}

function columnCount(data: Record<string, unknown>): number {
  const columns = firstArray(data, ['columns']);
  if (columns.length > 0) return columns.length;
  const rows = firstArray(data, ['rows', 'data', 'records', 'entries']);
  const first = rows[0];
  if (Array.isArray(first)) return first.length;
  if (first && typeof first === 'object') return Object.keys(first).length;
  return 0;
}

function textLength(data: Record<string, unknown>): number {
  return ['html', 'content', 'body', 'summary', 'markdown', 'text']
    .map((key) => typeof data[key] === 'string' ? (data[key] as string).length : 0)
    .reduce((sum, len) => sum + len, 0);
}

export function recommendWidgetType(rawType: unknown, rawData: unknown): WidgetType {
  const type = typeof rawType === 'string' ? rawType.trim() : '';
  const data = asRecord(rawData);
  const inferred = inferWidgetType(data);

  if (type && !isTypeMismatched(type, data)) return type as WidgetType;
  if (inferred && inferred !== 'universal') return inferred as WidgetType;
  if (type) return type as WidgetType;
  return (inferred || 'universal') as WidgetType;
}

export function recommendWidgetStyleConfig(type: string, rawData: unknown): Record<string, unknown> | undefined {
  const data = asRecord(rawData);
  if (type !== 'chart') return undefined;

  const values = numericValues(data);
  const count = Math.max(labelCount(data), values.length);
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  const isComposition = count >= 2 && count <= 5 && total > 0 && values.every((value) => value >= 0);
  const variant = data.styleConfig && typeof data.styleConfig === 'object'
    ? String((data.styleConfig as Record<string, unknown>).variant || '')
    : String(data.variant || '');

  if (variant === 'bar' || variant === 'donut') {
    return { variant, donut: { innerRatio: 0.58, legendRatio: 0.42, maxSlices: 5 } };
  }
  return {
    variant: isComposition ? 'donut' : 'bar',
    donut: { innerRatio: 0.58, legendRatio: 0.42, maxSlices: 5 },
  };
}

export function recommendWidgetSize(type: string, rawData?: unknown): WidgetSize {
  const data = asRecord(rawData);
  const base = BASE_SIZE[type as WidgetType] || BASE_SIZE.universal;
  const labels = labelCount(data);
  const rows = rowCount(data);
  const cols = columnCount(data);
  const len = textLength(data);

  if (type === 'chart') {
    const style = recommendWidgetStyleConfig(type, data);
    if (style?.variant === 'donut') return { w: 6, h: 4 };
    if (labels > 8) return { w: 8, h: 5 };
    return base;
  }
  if (type === 'table') {
    if (cols >= 6) return { w: 12, h: rows > 8 ? 6 : 5 };
    if (rows > 6 || cols >= 4) return { w: 8, h: 5 };
    return base;
  }
  if (type === 'metric') {
    const items = firstArray(data, ['items', 'metrics', 'stats']);
    return items.length > 2 ? { w: 4, h: 3 } : base;
  }
  if (type === 'html' || type === 'report') {
    if (len > 800) return { w: 12, h: 6 };
    if (len > 260) return { w: 8, h: 5 };
    return base;
  }
  if (type === 'list' || type === 'alert') {
    const items = firstArray(data, type === 'alert' ? ['alerts', 'events', 'items'] : ['items', 'list', 'tasks', 'todos']);
    return items.length > 5 ? { w: 6, h: 4 } : base;
  }
  if (type === 'heatmap') return { w: 7, h: 4 };
  if (type === 'timeline') return { w: 8, h: 4 };

  return base;
}

export function applyRecommendedWidgetData(type: string, rawData: unknown): Record<string, unknown> {
  const data = { ...asRecord(rawData) };
  const styleConfig = recommendWidgetStyleConfig(type, data);
  if (styleConfig && (!data.styleConfig || typeof data.styleConfig !== 'object')) {
    data.styleConfig = styleConfig;
  }
  return data;
}
