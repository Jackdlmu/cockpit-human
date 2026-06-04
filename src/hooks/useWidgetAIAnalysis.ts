// ─── useWidgetAIAnalysis ───
// 根据组件数据 + 工作区上下文生成 AI 分析建议

import { useMemo } from 'react';
import type { Widget, Workspace } from '@/types';

export interface AIAnalysisResult {
  summary: string;
  overview: string;
  insights: string[];
  recommendations: string[];
  confidence: 'high' | 'medium' | 'low';
}

const DATA_WIDGET_TYPES = new Set([
  'chart', 'table', 'metric', 'gauge', 'funnel', 'radar',
  'heatmap', 'bullet', 'alert', 'map', 'kanban', 'timeline',
  'progress', 'status', 'list',
]);

function isDataWidget(widget: Widget): boolean {
  if (widget.enableAIAnalysis !== undefined) return widget.enableAIAnalysis;
  return DATA_WIDGET_TYPES.has(widget.type);
}

function extractNumbers(data: unknown): number[] {
  const nums: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'number') nums.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(data);
  return nums;
}

function extractStrings(data: unknown): string[] {
  const strs: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string' && v.length > 1 && !v.startsWith('#')) strs.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(data);
  return strs;
}

function detectTrend(values: number[]): 'up' | 'down' | 'flat' | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  const change = (last - first) / Math.abs(first || 1);
  if (change > 0.05) return 'up';
  if (change < -0.05) return 'down';
  return 'flat';
}

function formatChangeRate(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '大幅增长' : '持平';
  const rate = ((current - previous) / previous) * 100;
  const absRate = Math.abs(rate).toFixed(1);
  if (rate > 0) return `↑ ${absRate}%`;
  return `↓ ${absRate}%`;
}

function generateMetricAnalysis(data: Record<string, unknown>, title: string): AIAnalysisResult {
  const value = data.value as string | number | undefined;
  const change = data.change as string | undefined;
  const trend = data.trend as string | undefined;
  const target = data.target as string | number | undefined;
  const compareLabel = data.compareLabel as string | undefined;

  const insights: string[] = [];
  const recommendations: string[] = [];

  let overview = `${title}当前值为 ${value ?? '—'}`;
  if (target) overview += `，目标为 ${target}`;
  if (change) overview += `，较${compareLabel ?? '上期'}${change}`;
  overview += '。';

  if (target && value) {
    const vNum = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    const tNum = parseFloat(String(target).replace(/[^0-9.-]/g, ''));
    if (!isNaN(vNum) && !isNaN(tNum)) {
      const ratio = vNum / tNum;
      if (ratio >= 1) {
        insights.push(`已超额完成目标，达成率为 ${(ratio * 100).toFixed(1)}%，表现优异。`);
      } else if (ratio >= 0.8) {
        insights.push(`目标达成率为 ${(ratio * 100).toFixed(1)}%，距离目标还有 ${((1 - ratio) * 100).toFixed(1)}% 的差距，需要持续关注。`);
        recommendations.push('建议拆解未达成原因，重点排查影响指标的关键因素。');
      } else {
        insights.push(`目标达成率仅为 ${(ratio * 100).toFixed(1)}%，显著低于预期，存在较大提升空间。`);
        recommendations.push('建议立即召开专项复盘，定位根因并制定追赶计划。');
      }
    }
  }

  if (trend === 'down') {
    insights.push('指标呈下降趋势，需警惕业务风险。');
    recommendations.push('建议对比历史同期数据，分析下降的核心驱动因素。');
  } else if (trend === 'up') {
    insights.push('指标持续向好，增长动力充足。');
  }

  if (insights.length === 0) {
    insights.push('数据整体平稳，建议持续监控关键指标波动。');
  }
  if (recommendations.length === 0) {
    recommendations.push('建议设定下一阶段目标，并建立定期跟踪机制。');
  }

  const summary = `${title}${value ? ` ${value}` : ''}${change ? `，${change}` : ''}${trend === 'up' ? '，增长势头良好' : trend === 'down' ? '，呈下降趋势需关注' : ''}`;

  return { summary, overview, insights, recommendations, confidence: 'high' };
}

function generateChartAnalysis(data: Record<string, unknown>, title: string): AIAnalysisResult {
  const labels = (data.labels as string[] | number[] | undefined) ?? [];
  const values = (data.values as number[] | undefined) ?? [];
  const dataset = (data.datasets as Array<{ label?: string; data?: number[] }> | undefined)?.[0];
  const actualValues = dataset?.data ?? values;

  const insights: string[] = [];
  const recommendations: string[] = [];

  if (actualValues.length === 0) {
    return {
      summary: `${title}暂无有效数据。`,
      overview: '当前数据为空或格式异常，无法生成分析。',
      insights: ['数据尚未就绪，请确认数据源配置。'],
      recommendations: ['检查数据连接状态，或等待数据同步完成。'],
      confidence: 'low',
    };
  }

  const total = actualValues.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
  const avg = total / actualValues.length;
  const max = Math.max(...actualValues);
  const min = Math.min(...actualValues);
  const maxIndex = actualValues.indexOf(max);
  const minIndex = actualValues.indexOf(min);
  const maxLabel = labels[maxIndex] ?? '峰值点';
  const minLabel = labels[minIndex] ?? '谷值点';
  const trend = detectTrend(actualValues);

  let overview = `${title}共 ${actualValues.length} 个数据点，总量为 ${total.toLocaleString('zh-CN')}`;
  if (actualValues.length > 1) {
    overview += `，平均值 ${avg.toFixed(1)}，最高值出现在「${maxLabel}」为 ${max.toLocaleString('zh-CN')}，最低值出现在「${minLabel}」为 ${min.toLocaleString('zh-CN')}`;
  }
  overview += '。';

  if (trend === 'up') {
    insights.push(`整体呈上升趋势，${formatChangeRate(actualValues[actualValues.length - 1], actualValues[0])}，增长态势良好。`);
  } else if (trend === 'down') {
    insights.push(`整体呈下降趋势，${formatChangeRate(actualValues[actualValues.length - 1], actualValues[0])}，需重点关注。`);
    recommendations.push('建议深入分析下降阶段的细分数据，定位核心影响因素。');
  } else {
    insights.push('数据整体波动平稳，未出现显著趋势性变化。');
  }

  if (maxIndex === actualValues.length - 1) {
    insights.push('最新数据点达到历史高位，当前处于峰值区间。');
  } else if (minIndex === actualValues.length - 1) {
    insights.push('最新数据点触及近期低位，需关注后续走势。');
  }

  const variance = actualValues.reduce((sum, v) => sum + Math.pow((typeof v === 'number' ? v : 0) - avg, 2), 0) / actualValues.length;
  const cv = avg !== 0 ? Math.sqrt(variance) / Math.abs(avg) : 0;
  if (cv > 0.5) {
    insights.push('数据波动幅度较大（变异系数高），业务稳定性有待提升。');
    recommendations.push('建议建立数据波动预警机制，对异常波动点进行根因分析。');
  }

  if (insights.length === 0) {
    insights.push('数据正常，建议持续观察。');
  }
  if (recommendations.length === 0) {
    recommendations.push('建议关注下一阶段数据变化，及时调整业务策略。');
  }

  const summary = `${title}${trend === 'up' ? '持续增长' : trend === 'down' ? '呈下降趋势' : '整体平稳'}，最新值${actualValues.length > 0 ? actualValues[actualValues.length - 1] : '—'}${trend ? `，${formatChangeRate(actualValues[actualValues.length - 1], actualValues[0])}` : ''}`;

  return { summary, overview, insights, recommendations, confidence: actualValues.length >= 3 ? 'high' : 'medium' };
}

function generateTableAnalysis(data: Record<string, unknown>, title: string): AIAnalysisResult {
  const columns = (data.columns as string[] | undefined) ?? [];
  const rows = (data.rows as Array<Record<string, unknown>> | undefined) ?? [];
  const insights: string[] = [];
  const recommendations: string[] = [];

  const overview = `${title}包含 ${columns.length} 个字段、${rows.length} 条记录。`;

  if (rows.length === 0) {
    return { summary: `${title}暂无数据。`, overview, insights: ['数据表为空。'], recommendations: ['确认数据源配置。'], confidence: 'low' };
  }

  // Find numeric columns
  const numericCols = columns.filter((col) => rows.some((r) => typeof r[col] === 'number'));
  if (numericCols.length > 0) {
    const firstNumCol = numericCols[0];
    const nums = rows.map((r) => Number(r[firstNumCol])).filter((n) => !isNaN(n));
    if (nums.length > 0) {
      const total = nums.reduce((a, b) => a + b, 0);
      insights.push(`「${firstNumCol}」列合计 ${total.toLocaleString('zh-CN')}，平均值 ${(total / nums.length).toFixed(1)}。`);
    }
  }

  insights.push(`数据完整度良好，共 ${rows.length} 条有效记录。`);
  recommendations.push('建议对关键字段建立排序和筛选能力，提升数据洞察效率。');

  const summary = `${title}共 ${rows.length} 条记录${numericCols.length > 0 ? '，关键指标数据完整' : ''}`;
  return { summary, overview, insights, recommendations, confidence: 'medium' };
}

function generateGenericAnalysis(data: Record<string, unknown>, widget: Widget, workspaceName?: string): AIAnalysisResult {
  const nums = extractNumbers(data);
  const strs = extractStrings(data);
  const insights: string[] = [];
  const recommendations: string[] = [];

  const overview = workspaceName
    ? `「${widget.title}」位于工作区「${workspaceName}」中，当前展示 ${widget.type === 'list' ? '列表' : widget.type === 'kanban' ? '看板' : widget.type === 'timeline' ? '时间线' : widget.type === 'alert' ? '告警' : widget.type === 'progress' ? '进度' : widget.type === 'status' ? '状态' : '数据'}类内容。`
    : `「${widget.title}」当前展示 ${widget.type} 类型内容。`;

  if (nums.length > 0) {
    const total = nums.reduce((a, b) => a + b, 0);
    const avg = total / nums.length;
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    insights.push(`数据范围内检测到 ${nums.length} 个数值，平均值为 ${avg.toFixed(1)}，区间 [${min.toFixed(1)}, ${max.toFixed(1)}]。`);
  }

  if (strs.length > 0) {
    const keywords = strs.filter((s) => s.length < 20).slice(0, 5);
    if (keywords.length > 0) {
      insights.push(`内容关键词包括：${keywords.join('、')}。`);
    }
  }

  if (insights.length === 0) {
    insights.push('当前数据以文本或结构化信息为主，建议结合定量指标进行深度分析。');
  }
  recommendations.push('建议关注与上下游组件的数据联动，形成完整分析链路。');

  const summary = `「${widget.title}」数据已加载${nums.length > 0 ? `，检测到 ${nums.length} 个关键数值` : ''}`;
  return { summary, overview, insights, recommendations, confidence: 'medium' };
}

function generateAnalysis(widget: Widget, data: Record<string, unknown>, workspace?: Workspace | null): AIAnalysisResult {
  if (!isDataWidget(widget)) {
    return {
      summary: `「${widget.title}」为非数据类组件，暂不生成分析建议。`,
      overview: '当前组件类型不适合进行数据驱动的 AI 分析。',
      insights: [],
      recommendations: ['如需分析，请将组件类型切换为数据类组件（图表、指标、表格等）。'],
      confidence: 'low',
    };
  }

  try {
    switch (widget.type) {
      case 'metric':
        return generateMetricAnalysis(data, widget.title);
      case 'chart':
      case 'gauge':
      case 'funnel':
      case 'radar':
      case 'heatmap':
      case 'bullet':
        return generateChartAnalysis(data, widget.title);
      case 'table':
        return generateTableAnalysis(data, widget.title);
      default:
        return generateGenericAnalysis(data, widget, workspace?.name);
    }
  } catch {
    return {
      summary: `「${widget.title}」数据分析中...`,
      overview: '正在解析组件数据以生成分析建议。',
      insights: ['数据解析中，请稍后刷新查看详细分析。'],
      recommendations: ['确保数据格式正确，以便 AI 引擎提取有效信息。'],
      confidence: 'low',
    };
  }
}

export function useWidgetAIAnalysis(
  widget: Widget,
  data: Record<string, unknown>,
  workspace?: Workspace | null
): { enabled: boolean; analysis: AIAnalysisResult | null; loading: boolean } {
  const enabled = isDataWidget(widget);

  const analysis = useMemo(() => {
    if (!enabled) return null;
    return generateAnalysis(widget, data, workspace);
  }, [enabled, widget, data, workspace]);

  return { enabled, analysis, loading: false };
}
