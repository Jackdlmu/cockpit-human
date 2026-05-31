import { describe, expect, it } from 'vitest';
import { normalizeWidgetDataPayload, normalizeWidget } from './widget-normalizer';

describe('normalizeWidgetDataPayload', () => {
  it('normalizes report payloads with chinese aliases and scalar highlights', () => {
    const normalized = normalizeWidgetDataPayload({
      highlights: '5 重点',
      摘要: '基于BIP盈利分析模型数据，以下是云领集团的核心财务洞察：',
      正文: '<section><h2>完整报告</h2><p>这里是完整正文</p></section>',
      年度营收: '329.75万',
      合并净利润: '8,598.96万',
    }, 'report');

    expect(normalized.summary).toContain('云领集团');
    expect(Array.isArray(normalized.highlights)).toBe(true);
    expect(normalized.highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '年度营收', value: '329.75万' }),
        expect.objectContaining({ label: '合并净利润', value: '8,598.96万' }),
      ])
    );
    expect(normalized.detail).toEqual(
      expect.objectContaining({
        contentType: 'html',
      })
    );
    expect(normalized.html).toContain('<section>');
  });

  it('normalizes html-like report widgets during widget normalization', () => {
    const widget = normalizeWidget({
      id: 'report-1',
      type: 'report',
      title: '集团经营概览',
      data: {
        content: '<article><h1>经营概览</h1><p>收入增长 12%</p></article>',
        highlights: '5 重点',
      },
    }, 0);

    expect(widget).not.toBeNull();
    expect(widget?.data?.summary).toContain('经营概览');
    expect(widget?.data?.html).toContain('<article>');
    expect(Array.isArray(widget?.data?.highlights)).toBe(true);
  });

  it('keeps YonClaw detailHtml as html content instead of highlight text', () => {
    const normalized = normalizeWidgetDataPayload({
      summary: '点击查看完整HTML报告',
      detailHtml: '<!DOCTYPE html><html><body><h1>完整报告</h1></body></html>',
      detailUrl: '/__openclaw__/canvas/documents/yonyou-analysis/full-report.html',
    }, 'report');

    expect(normalized.html).toContain('<!DOCTYPE html>');
    expect(normalized.detail).toEqual(expect.objectContaining({ contentType: 'html' }));
    expect(normalized.highlights).toEqual([]);
  });
});
