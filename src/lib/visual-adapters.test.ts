import { describe, expect, it } from 'vitest';
import {
  buildMetricDetailDisplay,
  computeDivergingBars,
  extractSafeDetailMetadata,
  formatDisplayNumber,
  getSignedValueSemanticClasses,
  getTrendSemanticClasses,
  shouldUseTrendSeriesChart,
  parseDisplayNumber,
} from './visual-adapters';

describe('visual adapters', () => {
  it('computes diverging bar geometry around a zero baseline', () => {
    const bars = computeDivergingBars(['2022', '2023', '2024', '2025'], [-4.36, -2.32, -1.53, 1.03]);

    expect(bars[0].zeroPct).toBeCloseTo(80.88, 1);
    expect(bars[0].negativePct).toBeCloseTo(80.88, 1);
    expect(bars[3].positivePct).toBeCloseTo(19.11, 1);
    expect(bars[0].tone).toBe('negative');
    expect(bars[3].tone).toBe('positive');
  });

  it('keeps all-negative bars anchored to the right-side zero baseline', () => {
    const bars = computeDivergingBars(['A', 'B'], [-10, -5]);

    expect(bars[0].zeroPct).toBe(100);
    expect(bars[0].negativePct).toBe(100);
    expect(bars[1].negativePct).toBe(50);
    expect(bars[0].positivePct).toBe(0);
  });

  it('normalizes metric detail data without exposing developer fields', () => {
    const metric = buildMetricDetailDisplay({
      value: '67.1%',
      change: '同比提升2.0个百分点',
      trend: 'up',
      unit: '%',
      target: '70%',
      compareLabel: '上年同期',
      compareValue: '65.1%',
      description: '毛利率持续提升',
      chartType: 'metric',
      styleConfig: { variant: 'kpi' },
    }, '毛利率');
    const metadata = extractSafeDetailMetadata({
      value: '67.1%',
      change: '同比提升2.0个百分点',
      trend: 'up',
      chartType: 'metric',
      styleConfig: { variant: 'kpi' },
      owner: 'CFO',
    });

    expect(metric.title).toBe('毛利率');
    expect(metric.value).toBe('67.1%');
    expect(metric.trend).toBe('up');
    expect(metric.targetValue).toBe('70%');
    expect(metadata).toEqual({ owner: 'CFO' });
  });

  it('parses and formats numeric display values consistently', () => {
    expect(parseDisplayNumber('1,234.50万')).toBe(1234.5);
    expect(parseDisplayNumber('-4.36亿港币')).toBe(-4.36);
    expect(formatDisplayNumber(67.1)).toBe('67.1');
    expect(formatDisplayNumber(undefined)).toBe('—');
  });

  it('uses Chinese dashboard trend colors', () => {
    expect(getTrendSemanticClasses('up').text).toBe('text-red-500');
    expect(getTrendSemanticClasses('down').text).toBe('text-emerald-500');
    expect(getSignedValueSemanticClasses(10).bar).toBe('bg-red-400');
    expect(getSignedValueSemanticClasses(-10).bar).toBe('bg-emerald-400');
  });

  it('prefers trend charts for temporal trend data', () => {
    expect(shouldUseTrendSeriesChart(['2022', '2023', '2024', '2025'], '年营业额趋势')).toBe(true);
    expect(shouldUseTrendSeriesChart(['产品A', '产品B', '产品C'], '收入结构')).toBe(false);
    expect(shouldUseTrendSeriesChart(['2022', '2023', '2024'], '收入结构', 'donut')).toBe(false);
    expect(shouldUseTrendSeriesChart(['2022', '2023', '2024'], '收入趋势', 'donut')).toBe(true);
  });
});
