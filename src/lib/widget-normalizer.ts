import type { Widget, WidgetType } from '@/types';
import { inferWidgetType, isTypeMismatched } from './widget-type-inferer';
import { applyRecommendedWidgetData, recommendWidgetSize } from './widget-recommendation';

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
  'business',
]);

const LEGACY_TOP_LEVEL_DATA_FIELDS = new Set([
  'value', 'change', 'trend', 'caption', 'variant', 'accentColor', 'status',
  'styleConfig', 'visualMapping',
  'label', 'labels', 'values', 'series', 'datasets', 'categories', 'names',
  'xAxis', 'xaxis', 'yAxis', 'yaxis', 'yValues', 'numbers',
  'rows', 'columns', 'records', 'entries',
  'items', 'list', 'tasks', 'todos',
  'stages', 'statuses', 'phases',
  'steps', 'milestones', 'events', 'nodes',
  'summary', 'highlights', 'keyPoints', 'metrics', 'stats', 'overview',
  'content', 'text', 'markdown', 'body', 'html', 'detailHtml', 'fullHtml', 'htmlContent', 'reportHtml',
  'metric', 'primaryMetric', 'headline', 'sections', 'blocks', 'cards',
  'detail', 'fullContent', 'detailContent',
  'detailUrl', 'reportUrl', 'url', 'htmlUrl', 'reportPath', 'htmlPath', 'filePath', 'reportFile', 'fileName', 'filename',
  'description', 'subtitle',
  '摘要', '概述', '概览', '总览',
  '正文', '全文', '详情', '报告内容',
  '要点', '重点', '亮点', '指标',
  'min', 'max', 'unit', 'thresholds', 'sparkline',
  'compareValue', 'compareLabel', 'previous', 'previousLabel', 'target', 'targetLabel',
  'current', 'percentage', 'percent', 'goal', 'maximum',
  'alerts', 'notifications', 'message', 'severity', 'level', 'time', 'timestamp',
  'points', 'locations', 'regions', 'cities',
  'businessType', 'business', 'approvals', 'messages', 'schedules', 'insights', 'reports',
  'color', 'colors',
]);

const REPORT_SUMMARY_FIELDS = [
  'summary', '摘要', '概述', '概览', '总览', 'executiveSummary', 'summaryText', 'description',
] as const;

const REPORT_HIGHLIGHT_FIELDS = [
  'highlights', 'keyPoints', 'metrics', 'stats', 'overview', 'insights',
  '要点', '重点', '亮点', '指标',
] as const;

const REPORT_DETAIL_FIELDS = [
  'detail', 'fullContent', 'content', 'text', 'markdown', 'body',
  'html', 'detailHtml', 'fullHtml', 'htmlContent', 'reportHtml', 'detailContent',
  '正文', '全文', '详情', '报告内容',
] as const;

const REPORT_RESERVED_FIELDS = new Set<string>([
  ...LEGACY_TOP_LEVEL_DATA_FIELDS,
  ...REPORT_SUMMARY_FIELDS,
  ...REPORT_HIGHLIGHT_FIELDS,
  ...REPORT_DETAIL_FIELDS,
  'detailUrl', 'reportUrl', 'url', 'htmlUrl', 'reportPath', 'htmlPath', 'filePath', 'reportFile', 'fileName', 'filename',
  'title', 'source', 'metadata', 'detailText', 'contentType',
  '__source', '__error', '__widgetTitle', '__initStatus', '__initError',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function scalarToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(value);
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstNonEmptyScalar(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const text = scalarToText(record[key]);
    if (text) return text;
  }
  return '';
}

function buildSummarySnippet(value: string, maxLength = 180): string {
  const normalized = stripHtmlTags(value);
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function normalizeHighlightItem(value: unknown, index: number): { label: string; value: string } | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    const match = text.match(/^([^:：]{1,24})[:：]\s*(.+)$/);
    if (match) {
      return { label: match[1].trim(), value: match[2].trim() };
    }
    return { label: `要点 ${index + 1}`, value: text };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return { label: `要点 ${index + 1}`, value: String(value) };
  }

  if (!isPlainRecord(value)) {
    return null;
  }

  const label = firstNonEmptyScalar(value, ['label', 'name', 'title', 'key', 'metric', '指标', '项目', '名称']);
  const highlightValue = firstNonEmptyScalar(value, [
    'value', 'val', 'num', 'amount', 'result', '数值', '结果',
    'content', 'description', 'summary', '摘要', '说明',
  ]);

  if (!label && !highlightValue) {
    return null;
  }

  return {
    label: label || `要点 ${index + 1}`,
    value: highlightValue || '—',
  };
}

function normalizeHighlightCollection(value: unknown): Array<{ label: string; value: string }> {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => normalizeHighlightItem(item, index))
      .filter((item): item is { label: string; value: string } => item !== null);
  }

  if (isPlainRecord(value)) {
    return Object.entries(value)
      .map(([label, itemValue]) => {
        const text = scalarToText(itemValue);
        return text ? { label, value: text } : null;
      })
      .filter((item): item is { label: string; value: string } => item !== null);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || !/[\n;；•]/.test(text)) {
      return [];
    }

    return text
      .split(/[\n;；•]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item, index) => normalizeHighlightItem(item, index))
      .filter((item): item is { label: string; value: string } => item !== null);
  }

  return [];
}

function extractScalarHighlights(data: Record<string, unknown>): Array<{ label: string; value: string }> {
  return Object.entries(data)
    .filter(([key, value]) => !REPORT_RESERVED_FIELDS.has(key) && !key.startsWith('__') && !Array.isArray(value) && !isPlainRecord(value))
    .map(([label, value]) => {
      const text = scalarToText(value);
      return text ? { label, value: text } : null;
    })
    .filter((item): item is { label: string; value: string } => item !== null)
    .slice(0, 8);
}

function detectHtmlContent(data: Record<string, unknown>, detailRecord: Record<string, unknown>): string {
  const candidates = [
    scalarToText(data.html),
    scalarToText(data.detailHtml),
    scalarToText(data.fullHtml),
    scalarToText(data.htmlContent),
    scalarToText(data.reportHtml),
    scalarToText(detailRecord.html),
    scalarToText(detailRecord.detailHtml),
    scalarToText(detailRecord.fullHtml),
    scalarToText(detailRecord.htmlContent),
    scalarToText(detailRecord.reportHtml),
    scalarToText(detailRecord.content),
    scalarToText(data.body),
    scalarToText(data.content),
    scalarToText(data.fullContent),
    scalarToText(data.正文),
    scalarToText(data.报告内容),
    scalarToText(data.全文),
  ];

  return candidates.find((candidate) => candidate && looksLikeHtml(candidate)) || '';
}

function isReportLikeData(data: Record<string, unknown>): boolean {
  if (REPORT_HIGHLIGHT_FIELDS.some((field) => field in data)) return true;
  if (['html', 'detailHtml', 'fullHtml', 'htmlContent', 'reportHtml', 'fullContent', '正文', '全文', '详情', '报告内容', '摘要'].some((field) => field in data)) return true;

  const detailRecord = isPlainRecord(data.detail) ? data.detail : {};
  const detailText = scalarToText(detailRecord.content || detailRecord.text || detailRecord.body || detailRecord.markdown);
  if (detailText && (looksLikeHtml(detailText) || detailText.length > 80)) return true;

  const content = firstNonEmptyScalar(data, ['content', 'body', 'text', 'markdown']);
  return !!content && (looksLikeHtml(content) || content.length > 120 || /[\n;；•]/.test(content));
}

function normalizeHtmlLikePayload(data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };
  const detailRecord = isPlainRecord(next.detail) ? { ...next.detail } : {};
  const htmlContent = detectHtmlContent(next, detailRecord);
  const plainContent = firstNonEmptyScalar(next, ['fullContent', 'detailContent', 'content', 'text', 'markdown', 'body', '正文', '全文', '报告内容']);
  const fallbackDetail = scalarToText(detailRecord.content || detailRecord.text || detailRecord.body || detailRecord.markdown);
  const summary = firstNonEmptyScalar(next, REPORT_SUMMARY_FIELDS) || buildSummarySnippet(htmlContent || plainContent || fallbackDetail);

  if (summary && !scalarToText(next.summary)) {
    next.summary = summary;
  }
  if (htmlContent) {
    next.html = htmlContent;
  }

  const detailContent = htmlContent || plainContent || fallbackDetail;
  if (detailContent) {
    next.detail = {
      ...detailRecord,
      content: detailContent,
      contentType: htmlContent ? 'html' : scalarToText(detailRecord.contentType) || 'text',
    };
  }

  if (!scalarToText(next.fullContent) && detailContent && !htmlContent) {
    next.fullContent = detailContent;
  }

  return next;
}

function normalizeReportLikePayload(data: Record<string, unknown>): Record<string, unknown> {
  const next = normalizeHtmlLikePayload(data);
  const detailRecord = isPlainRecord(next.detail) ? { ...next.detail } : {};
  const htmlContent = detectHtmlContent(next, detailRecord);
  const detailText = typeof next.detail === 'string'
    ? scalarToText(next.detail)
    : scalarToText(detailRecord.content || detailRecord.text || detailRecord.body || detailRecord.markdown || detailRecord.summary);
  const fullContent = firstNonEmptyScalar(next, ['fullContent', 'detailContent', 'content', 'text', 'markdown', 'body', '正文', '全文', '报告内容']);
  const summary = firstNonEmptyScalar(next, REPORT_SUMMARY_FIELDS) || buildSummarySnippet(htmlContent || detailText || fullContent);

  if (summary) {
    next.summary = summary;
  }

  const reportBody = htmlContent || detailText || fullContent;
  if (reportBody) {
    next.detail = {
      ...detailRecord,
      content: reportBody,
      contentType: htmlContent ? 'html' : scalarToText(detailRecord.contentType) || 'text',
    };
  }

  if (!scalarToText(next.fullContent) && reportBody && !htmlContent) {
    next.fullContent = reportBody;
  }

  let highlights: Array<{ label: string; value: string }> = [];
  for (const field of REPORT_HIGHLIGHT_FIELDS) {
    const normalized = normalizeHighlightCollection(next[field]);
    if (normalized.length > 0) {
      highlights = normalized;
      break;
    }
  }

  const scalarHighlights = extractScalarHighlights(next);
  const mergedHighlights = [...highlights];
  const seen = new Set(highlights.map((item) => `${item.label}::${item.value}`));
  for (const item of scalarHighlights) {
    const signature = `${item.label}::${item.value}`;
    if (!seen.has(signature)) {
      seen.add(signature);
      mergedHighlights.push(item);
    }
    if (mergedHighlights.length >= 8) break;
  }
  next.highlights = mergedHighlights;

  return next;
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

function normalizeLegacyDataPayload(data: Record<string, unknown>, typeHint?: string): Record<string, unknown> {
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

  const normalizedType = (typeHint || '').trim().toLowerCase();
  if (normalizedType === 'report' || isReportLikeData(next)) {
    return normalizeReportLikePayload(next);
  }

  const htmlLike = normalizedType === 'html' || looksLikeHtml(firstNonEmptyScalar(next, ['html', 'content', 'body', 'fullContent', '正文', '报告内容']));
  if (htmlLike) {
    return normalizeHtmlLikePayload(next);
  }

  return next;
}

export function normalizeWidgetDataPayload(data: Record<string, unknown>, rawType?: unknown): Record<string, unknown> {
  const base = normalizeLegacyDataPayload(data, typeof rawType === 'string' ? rawType : undefined);
  const inferredType = normalizeWidgetType(rawType, base);
  return normalizeLegacyDataPayload(base, inferredType);
}

function buildWidgetData(widget: Record<string, unknown>): Record<string, unknown> {
  const data = isPlainRecord(widget.data) ? { ...widget.data } : {};

  for (const [key, value] of Object.entries(widget)) {
    if (key === 'data' || !LEGACY_TOP_LEVEL_DATA_FIELDS.has(key) || value === undefined) {
      continue;
    }
    data[key] = value;
  }

  return data;
}

export function getDefaultWidgetSize(type: WidgetType): Widget['position'] {
  const size = recommendWidgetSize(type);
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
  const data = normalizeWidgetDataPayload(buildWidgetData(widget), widget.type);
  const type = normalizeWidgetType(widget.type, data);
  const recommendedData = applyRecommendedWidgetData(type, data);

  return {
    ...(widget as unknown as Partial<Widget>),
    id: typeof widget.id === 'string' && widget.id.trim() ? widget.id : `widget-fallback-${index + 1}`,
    type,
    title: typeof widget.title === 'string' && widget.title.trim() ? widget.title.trim() : `组件 ${index + 1}`,
    position: widget.position && typeof widget.position === 'object'
      ? normalizePosition(widget.position, index)
      : (() => {
          const size = recommendWidgetSize(type, recommendedData);
          return {
            x: (index * size.w) % 12,
            y: Math.floor(index / 2) * Math.max(size.h, 3),
            w: size.w,
            h: size.h,
          };
        })(),
    data: recommendedData,
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
