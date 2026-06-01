import { describe, expect, it } from 'vitest';
import { autoGroupWidgets, remapTemplateGrouping } from './grouping';

describe('autoGroupWidgets', () => {
  it('returns undefined when widgets <= 4', () => {
    const widgets = [
      { id: 'w1', title: '销售额' },
      { id: 'w2', title: '订单量' },
      { id: 'w3', title: '转化率' },
      { id: 'w4', title: '客单价' },
    ];
    expect(autoGroupWidgets(widgets)).toBeUndefined();
  });

  it('groups by title keywords for ungrouped widgets', () => {
    const widgets = [
      { id: 'w1', title: '营业收入' },
      { id: 'w2', title: '毛利率' },
      { id: 'w3', title: '现金流' },
      { id: 'w4', title: '本月入职' },
      { id: 'w5', title: '员工绩效' },
      { id: 'w6', title: '销售趋势' },
      { id: 'w7', title: '客户留存' },
      { id: 'w8', title: '系统可用性' },
    ];
    const result = autoGroupWidgets(widgets);
    expect(result).toBeDefined();
    expect(result!.enabled).toBe(true);
    expect(result!.mode).toBe('tabs-flow');
    expect(result!.groups!.length).toBeGreaterThanOrEqual(2);
    // 财务相关应该在同一组
    const financeGroup = result!.groups!.find((g) => g.name === '财务指标');
    expect(financeGroup).toBeDefined();
    expect(financeGroup!.widgetIds).toContain('w1');
    expect(financeGroup!.widgetIds).toContain('w2');
    expect(financeGroup!.widgetIds).toContain('w3');
  });

  it('respects existing group field', () => {
    const widgets = [
      { id: 'w1', title: 'A', group: 'group-alpha' },
      { id: 'w2', title: 'B', group: 'group-alpha' },
      { id: 'w3', title: 'C', group: 'group-beta' },
      { id: 'w4', title: 'D', group: 'group-beta' },
      { id: 'w5', title: 'E', group: 'group-beta' },
      { id: 'w6', title: 'F' },
      { id: 'w7', title: 'G' },
    ];
    const result = autoGroupWidgets(widgets);
    expect(result).toBeDefined();
    const alpha = result!.groups!.find((g) => g.id === 'group-alpha');
    const beta = result!.groups!.find((g) => g.id === 'group-beta');
    expect(alpha?.widgetIds).toEqual(['w1', 'w2']);
    expect(beta?.widgetIds).toEqual(['w3', 'w4', 'w5']);
  });

  it('merges to max 6 groups', () => {
    // 使用带有关键词的 title，确保至少分到 2 个组
    const keywords = ['财务', '人力', '销售', '运营', '市场', '战略', '研发', '供应链'];
    const widgets = Array.from({ length: 20 }, (_, i) => ({
      id: `w${i}`,
      title: `${keywords[i % keywords.length]} Widget ${i}`,
    }));
    const result = autoGroupWidgets(widgets);
    expect(result).toBeDefined();
    expect(result!.groups!.length).toBeLessThanOrEqual(6);
    expect(result!.groups!.length).toBeGreaterThanOrEqual(2);
  });

  it('manual mode: only uses predefined manualGroups', () => {
    const widgets = [
      { id: 'w1', title: '营业收入', group: '财务' },
      { id: 'w2', title: '毛利率', group: '财务' },
      { id: 'w3', title: '本月入职', group: '人力' },
      { id: 'w4', title: '员工绩效', group: '人力' },
      { id: 'w5', title: '销售趋势' },
      { id: 'w6', title: '客户留存' },
      { id: 'w7', title: '系统可用性' },
    ];
    const result = autoGroupWidgets(widgets, {
      enabled: true,
      strategy: 'manual',
      manualGroups: ['财务', '人力'],
      mode: 'tabs-flow',
    });
    expect(result).toBeDefined();
    expect(result!.groups!.length).toBe(3); // 财务, 人力, 综合分析
    const finance = result!.groups!.find((g) => g.name === '财务');
    const hr = result!.groups!.find((g) => g.name === '人力');
    const fallback = result!.groups!.find((g) => g.name === '综合分析');
    expect(finance?.widgetIds).toEqual(['w1', 'w2']);
    expect(hr?.widgetIds).toEqual(['w3', 'w4']);
    expect(fallback?.widgetIds).toEqual(['w5', 'w6', 'w7']);
  });

  it('manual mode: title keywords can match manualGroups', () => {
    const widgets = [
      { id: 'w1', title: '财务收入' },
      { id: 'w2', title: '财务预算' },
      { id: 'w3', title: '人力资源' },
      { id: 'w4', title: '销售趋势' },
      { id: 'w5', title: '随机指标' },
    ];
    const result = autoGroupWidgets(widgets, {
      enabled: true,
      strategy: 'manual',
      manualGroups: ['财务', '人力'],
      mode: 'tabs-flow',
    });
    expect(result).toBeDefined();
    const finance = result!.groups!.find((g) => g.name === '财务');
    const hr = result!.groups!.find((g) => g.name === '人力');
    const fallback = result!.groups!.find((g) => g.name === '综合分析');
    // 财务收入/财务预算 标题包含 "财务" 关键词，匹配到财务组
    expect(finance?.widgetIds).toContain('w1');
    expect(finance?.widgetIds).toContain('w2');
    // 人力资源 标题包含 "人力" 关键词
    expect(hr?.widgetIds).toContain('w3');
    // 未匹配到预定义标签的归入综合分析
    expect(fallback?.widgetIds).toContain('w4');
    expect(fallback?.widgetIds).toContain('w5');
  });

  it('manual mode: returns undefined when less than 2 groups have widgets', () => {
    const widgets = [
      { id: 'w1', title: 'A', group: '财务' },
      { id: 'w2', title: 'B', group: '财务' },
    ];
    const result = autoGroupWidgets(widgets, {
      enabled: true,
      strategy: 'manual',
      manualGroups: ['财务'],
      mode: 'tabs-flow',
    });
    expect(result).toBeUndefined();
  });
});

describe('remapTemplateGrouping', () => {
  it('remaps widgetIds based on id map', () => {
    const grouping = {
      enabled: true as const,
      mode: 'tabs-flow' as const,
      groups: [
        { id: 'g1', name: 'Group 1', widgetIds: ['old-1', 'old-2'] },
        { id: 'g2', name: 'Group 2', widgetIds: ['old-3'] },
      ],
    };
    const idMap = new Map([
      ['old-1', 'new-1'],
      ['old-2', 'new-2'],
      ['old-3', 'new-3'],
    ]);
    const result = remapTemplateGrouping(grouping, idMap);
    expect(result).toBeDefined();
    expect(result!.groups![0].widgetIds).toEqual(['new-1', 'new-2']);
    expect(result!.groups![1].widgetIds).toEqual(['new-3']);
  });

  it('filters out groups with no mapped widgets', () => {
    const grouping = {
      enabled: true as const,
      mode: 'tabs-flow' as const,
      groups: [
        { id: 'g1', name: 'Group 1', widgetIds: ['old-1'] },
        { id: 'g2', name: 'Group 2', widgetIds: ['old-missing'] },
      ],
    };
    const idMap = new Map([['old-1', 'new-1']]);
    const result = remapTemplateGrouping(grouping, idMap);
    expect(result!.groups!.length).toBe(1);
    expect(result!.groups![0].id).toBe('g1');
  });

  it('returns undefined for undefined input', () => {
    expect(remapTemplateGrouping(undefined, new Map())).toBeUndefined();
  });
});
