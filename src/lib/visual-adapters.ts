export interface DivergingBarItem {
  label: string;
  value: number;
  zeroPct: number;
  negativePct: number;
  positivePct: number;
  tone: 'negative' | 'positive' | 'neutral';
}

export interface MetricDetailDisplay {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'flat' | '';
  caption: string;
  comparisonLabel: string;
  comparisonValue: string;
  targetLabel: string;
  targetValue: string;
  unit: string;
  status: string;
  description: string;
  secondaryMetrics: Array<{ label: string; value: string; change?: string; trend?: string }>;
}

export const DETAIL_RESERVED_FIELDS = new Set([
  'chartType', 'variant', 'styleConfig', 'visualMapping',
  'label', 'labels', 'values', 'series', 'datasets', 'categories', 'names',
  'xAxis', 'xaxis', 'yAxis', 'yaxis', 'yValues', 'numbers',
  'rows', 'columns', 'records', 'entries', 'data',
  'value', 'change', 'trend', 'caption', 'unit', 'status',
  'compareValue', 'compareLabel', 'previous', 'previousLabel', 'target', 'targetLabel',
  'primaryMetric', 'metric', 'metrics', 'kpis', 'stats', 'items',
  'summary', 'highlights', 'keyPoints', 'overview', 'insights',
  'content', 'text', 'markdown', 'body', 'html', 'detailHtml', 'fullHtml', 'htmlContent', 'reportHtml',
  'detail', 'fullContent', 'detailContent', 'description', 'subtitle',
  'detailUrl', 'reportUrl', 'url', 'htmlUrl', 'reportPath', 'htmlPath', 'filePath', 'reportFile', 'fileName', 'filename',
  'title', 'source', 'metadata', 'detailText', 'contentType',
  '__source', '__error', '__widgetTitle', '__initStatus', '__initError',
]);

export const DETAIL_FIELD_LABELS: Record<string, string> = {
  value: '当前值',
  change: '变化',
  trend: '趋势',
  unit: '单位',
  status: '状态',
  caption: '说明',
  description: '说明',
  compareValue: '对比值',
  compareLabel: '对比项',
  previous: '上期值',
  previousLabel: '上期',
  target: '目标值',
  targetLabel: '目标',
};

export function computeDivergingBars(labels: string[], values: number[]): DivergingBarItem[] {
  const paired = labels.map((label, index) => ({
    label,
    value: Number.isFinite(values[index]) ? values[index] : 0,
  }));
  const min = Math.min(0, ...paired.map((item) => item.value));
  const max = Math.max(0, ...paired.map((item) => item.value));
  const negativeSpan = Math.abs(min);
  const positiveSpan = max;
  const totalSpan = negativeSpan + positiveSpan || 1;
  const zeroPct = negativeSpan > 0 && positiveSpan > 0
    ? (negativeSpan / totalSpan) * 100
    : negativeSpan > 0
      ? 100
      : 0;

  return paired.map((item) => {
    const negativePct = item.value < 0 ? (Math.abs(item.value) / totalSpan) * 100 : 0;
    const positivePct = item.value > 0 ? (item.value / totalSpan) * 100 : 0;
    return {
      ...item,
      zeroPct,
      negativePct: clampPct(negativePct),
      positivePct: clampPct(positivePct),
      tone: item.value < 0 ? 'negative' : item.value > 0 ? 'positive' : 'neutral',
    };
  });
}

export function scalarToDisplayText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function parseDisplayNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/,/g, '');
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatDisplayNumber(value: number | undefined): string {
  if (value === undefined) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

export function localizeDetailFieldLabel(key: string): string {
  return DETAIL_FIELD_LABELS[key] || key;
}

export function extractSafeDetailMetadata(data: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key, value]) => !DETAIL_RESERVED_FIELDS.has(key) && !key.startsWith('__') && !Array.isArray(value) && !isRecord(value))
      .map(([key, value]) => [localizeDetailFieldLabel(key), scalarToDisplayText(value)] as const)
      .filter(([, value]) => !!value)
      .slice(0, 8)
  );
}

export function buildMetricDetailDisplay(
  data: Record<string, unknown>,
  title: string,
  drillContext?: Record<string, unknown>
): MetricDetailDisplay {
  const primaryMetric = isRecord(data.primaryMetric) ? data.primaryMetric : isRecord(data.metric) ? data.metric : {};
  const contextValue = drillContext ? drillContext.value : undefined;
  const value = scalarToDisplayText(data.value ?? primaryMetric.value ?? contextValue);
  const comparisonValue = scalarToDisplayText(data.compareValue ?? data.previous);
  const targetValue = scalarToDisplayText(data.target);

  return {
    title,
    value: value || '—',
    change: scalarToDisplayText(data.change ?? primaryMetric.change),
    trend: normalizeTrend(data.trend ?? primaryMetric.trend),
    caption: scalarToDisplayText(data.caption ?? primaryMetric.caption),
    comparisonLabel: scalarToDisplayText(data.compareLabel ?? data.previousLabel) || '对比',
    comparisonValue,
    targetLabel: scalarToDisplayText(data.targetLabel) || '目标',
    targetValue,
    unit: scalarToDisplayText(data.unit),
    status: scalarToDisplayText(data.status),
    description: scalarToDisplayText(data.description ?? data.summary ?? data.subtitle),
    secondaryMetrics: normalizeMetricCollection(data.secondaryMetrics ?? data.metrics ?? data.kpis ?? data.stats),
  };
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTrend(value: unknown): MetricDetailDisplay['trend'] {
  const text = String(value || '').toLowerCase();
  if (text === 'up' || text === 'increase' || text === 'positive') return 'up';
  if (text === 'down' || text === 'decrease' || text === 'negative') return 'down';
  if (text === 'flat' || text === 'stable') return 'flat';
  return '';
}

function normalizeMetricCollection(value: unknown): MetricDetailDisplay['secondaryMetrics'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return { label: `指标 ${index + 1}`, value: scalarToDisplayText(item) };
      }
      if (!isRecord(item)) return null;
      const label = scalarToDisplayText(item.label ?? item.name ?? item.title ?? item.key ?? item.metric);
      const itemValue = scalarToDisplayText(item.value ?? item.val ?? item.amount ?? item.num ?? item.result);
      if (!label && !itemValue) return null;
      return {
        label: label || `指标 ${index + 1}`,
        value: itemValue || '—',
        change: scalarToDisplayText(item.change ?? item.delta ?? item.comparison ?? item.diff) || undefined,
        trend: scalarToDisplayText(item.trend ?? item.direction) || undefined,
      };
    })
    .filter((item): item is { label: string; value: string; change?: string; trend?: string } => item !== null)
    .slice(0, 6);
}
