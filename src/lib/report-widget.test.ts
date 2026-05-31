import { describe, expect, it } from 'vitest';
import { buildReportDisplayData, shouldRenderReportAsHtml } from './report-widget';

describe('report-widget helpers', () => {
  it('builds stable display data from yonclaw-style report payloads', () => {
    const report = buildReportDisplayData({
      摘要: '这是集团经营的核心摘要',
      报告内容: '<article><h1>经营分析</h1><p>净利润提升 18%</p></article>',
      年度营收: '329.75万',
      合并净利润: '8,598.96万',
      highlights: '5 重点',
    }, 'report');

    expect(report.summary).toContain('核心摘要');
    expect(report.html).toContain('<article>');
    expect(report.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '年度营收', value: '329.75万' }),
        expect.objectContaining({ label: '合并净利润', value: '8,598.96万' }),
      ])
    );
    expect(report.metadata.年度营收).toBe('329.75万');
  });

  it('detects html rendering for report widgets with html detail', () => {
    expect(shouldRenderReportAsHtml({
      detail: { content: '<section><p>完整 HTML 报告</p></section>', contentType: 'html' },
    }, 'report')).toBe(true);
  });

  it('does not treat boolean-like detailUrl flags as report URLs', () => {
    const report = buildReportDisplayData({
      detailUrl: 'true',
      summary: 'YonClaw 生成的报告摘要',
      highlights: [{ label: '结论', value: '保持增长' }],
    }, 'report');

    expect(report.detailUrl).toBe('');
    expect(report.wantsHtmlDetail).toBe(true);
    expect(report.metadata.detailUrl).toBeUndefined();
    expect(shouldRenderReportAsHtml({
      detailUrl: 'true',
      summary: 'YonClaw 生成的报告摘要',
    }, 'report')).toBe(true);
  });

  it('keeps real absolute and relative report URLs', () => {
    expect(buildReportDisplayData({ detailUrl: 'https://example.com/report' }, 'report').detailUrl)
      .toBe('https://example.com/report');
    expect(buildReportDisplayData({ detailUrl: 'file:///Users/jiang/report/full-report.html' }, 'report').detailUrl)
      .toBe('file:///Users/jiang/report/full-report.html');
    expect(buildReportDisplayData({ reportUrl: '/reports/abc' }, 'report').detailUrl)
      .toBe('/reports/abc');
    expect(buildReportDisplayData({ reportFile: 'full-report.html' }, 'report').detailUrl)
      .toBe('full-report.html');
  });

  it('renders embedded detailHtml as html instead of plain report metadata', () => {
    const report = buildReportDisplayData({
      summary: '完整深度分析报告',
      detailHtml: '<!DOCTYPE html><html><body><h1>杜邦分析</h1><p>ROE 拆解</p></body></html>',
      detailUrl: '/__openclaw__/canvas/documents/yonyou-analysis/full-report.html',
    }, 'report');

    expect(report.html).toContain('<!DOCTYPE html>');
    expect(report.detailUrl).toBe('');
    expect(report.metadata.detailHtml).toBeUndefined();
    expect(shouldRenderReportAsHtml(report.normalized, 'report')).toBe(true);
  });
});
