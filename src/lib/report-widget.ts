import { normalizeWidgetDataPayload } from './widget-normalizer';

export interface ReportHighlightItem {
  label: string;
  value: string;
}

export interface ReportDisplayData {
  normalized: Record<string, unknown>;
  summary: string;
  highlights: ReportHighlightItem[];
  detail: string;
  html: string;
  detailUrl: string;
  wantsHtmlDetail: boolean;
  metadata: Record<string, string>;
}

const REPORT_RESERVED_FIELDS = new Set([
  'summary', 'highlights', 'keyPoints', 'metrics', 'stats', 'overview', 'insights',
  'content', 'text', 'markdown', 'body', 'html', 'detailHtml', 'fullHtml', 'htmlContent', 'reportHtml',
  'detail', 'fullContent', 'detailContent', 'description', 'subtitle',
  'detailUrl', 'reportUrl', 'url', 'htmlUrl', 'reportPath', 'htmlPath', 'filePath', 'reportFile', 'fileName', 'filename',
  'title', 'source', 'metadata', 'detailText', 'contentType',
  '摘要', '概述', '概览', '总览', '正文', '全文', '详情', '报告内容',
  '要点', '重点', '亮点', '指标',
  '__source', '__error', '__widgetTitle', '__initStatus', '__initError',
]);

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isUsableReportUrl(value: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (['true', 'false', 'yes', 'no', '1', '0', 'null', 'undefined'].includes(normalized)) {
    return false;
  }
  if (normalized.startsWith('/__openclaw__/') || normalized.startsWith('/__yonclaw__/')) {
    return false;
  }
  return /^(https?:\/\/|file:\/\/|\/(?!\/)|\.{1,2}\/|#)/i.test(value.trim()) || /\.html?($|[?#])/i.test(value.trim());
}

function isTruthyDetailMarker(value: string): boolean {
  return ['true', 'yes', '1'].includes(value.trim().toLowerCase());
}

export function scalarToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(value);
}

function normalizeHighlightItem(value: unknown, index: number): ReportHighlightItem | null {
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

  const record = toRecord(value);
  if (!record) return null;

  const label = scalarToText(record.label || record.name || record.title || record.key || record.metric || record.指标 || record.项目 || record.名称);
  const detail = scalarToText(record.value || record.val || record.num || record.amount || record.result || record.content || record.description || record.summary || record.摘要 || record.说明);
  if (!label && !detail) return null;

  return {
    label: label || `要点 ${index + 1}`,
    value: detail || '—',
  };
}

function normalizeHighlightList(value: unknown): ReportHighlightItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeHighlightItem(item, index))
    .filter((item): item is ReportHighlightItem => item !== null);
}

function extractMetadata(normalized: Record<string, unknown>): Record<string, string> {
  const fromMetadata = toRecord(normalized.metadata);
  if (fromMetadata) {
    const entries = Object.entries(fromMetadata)
      .map(([key, value]) => [key, scalarToText(value)] as const)
      .filter(([key, value]) => !!value && !REPORT_RESERVED_FIELDS.has(key) && !key.startsWith('__'));
    if (entries.length > 0) {
      return Object.fromEntries(entries);
    }
  }

  return Object.fromEntries(
    Object.entries(normalized)
      .filter(([key, value]) => !REPORT_RESERVED_FIELDS.has(key) && !key.startsWith('__') && !Array.isArray(value) && !toRecord(value))
      .map(([key, value]) => [key, scalarToText(value)] as const)
      .filter(([, value]) => !!value)
      .slice(0, 8)
  );
}

export function buildReportDisplayData(data: Record<string, unknown> | null | undefined, widgetType: string): ReportDisplayData {
  const normalized = normalizeWidgetDataPayload(data && typeof data === 'object' && !Array.isArray(data) ? data : {}, widgetType);
  const detailRecord = toRecord(normalized.detail);
  const html = scalarToText(
    normalized.html
      || normalized.detailHtml
      || normalized.fullHtml
      || normalized.htmlContent
      || normalized.reportHtml
      || detailRecord?.html
      || detailRecord?.detailHtml
      || detailRecord?.fullHtml
      || detailRecord?.htmlContent
      || detailRecord?.reportHtml
  );
  const rawDetailUrl = scalarToText(
    normalized.detailUrl
      || normalized.reportUrl
      || normalized.htmlUrl
      || normalized.reportPath
      || normalized.htmlPath
      || normalized.filePath
      || normalized.reportFile
      || normalized.fileName
      || normalized.filename
      || normalized.url
      || detailRecord?.url
      || detailRecord?.detailUrl
      || detailRecord?.reportUrl
      || detailRecord?.htmlUrl
      || detailRecord?.reportPath
      || detailRecord?.htmlPath
      || detailRecord?.filePath
      || detailRecord?.reportFile
      || detailRecord?.fileName
      || detailRecord?.filename
  );
  const detailUrl = isUsableReportUrl(rawDetailUrl) ? rawDetailUrl : '';
  const wantsHtmlDetail = isTruthyDetailMarker(rawDetailUrl);
  const detail = scalarToText(
    detailRecord?.content
      || detailRecord?.text
      || detailRecord?.body
      || detailRecord?.markdown
      || normalized.fullContent
      || normalized.detailContent
      || normalized.content
      || normalized.text
      || normalized.markdown
      || normalized.body
  );
  const summary = scalarToText(normalized.summary || normalized.description || normalized.subtitle) || detail;
  const highlights = normalizeHighlightList(normalized.highlights);

  return {
    normalized,
    summary,
    highlights,
    detail,
    html,
    detailUrl,
    wantsHtmlDetail,
    metadata: extractMetadata(normalized),
  };
}

export function shouldRenderReportAsHtml(data: Record<string, unknown> | null | undefined, widgetType: string): boolean {
  if (widgetType === 'html') return true;
  const report = buildReportDisplayData(data, widgetType);
  if (report.html) return true;
  if (report.detailUrl) return true;
  if (report.wantsHtmlDetail) return true;
  const detailRecord = toRecord(report.normalized.detail);
  const detailType = scalarToText(detailRecord?.contentType || report.normalized.contentType);
  if (detailType.toLowerCase() === 'html') return true;
  return looksLikeHtml(report.detail);
}
