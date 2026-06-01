import { describe, expect, it } from 'vitest';
import { recommendWidgetSize, recommendWidgetStyleConfig, recommendWidgetType } from './widget-recommendation';
import { inferWidgetType } from './widget-type-inferer';

describe('widget recommendation', () => {
  it('keeps target data as bullet instead of falling back to metric', () => {
    const data = { value: 76, target: 90, max: 100 };

    expect(inferWidgetType(data)).toBe('bullet');
    expect(recommendWidgetType('metric', data)).toBe('bullet');
    expect(recommendWidgetSize('bullet', data)).toEqual({ w: 6, h: 2 });
  });

  it('recommends donut style for compact composition data', () => {
    const data = { labels: ['华东', '华南', '华北'], values: [45, 32, 23] };

    expect(recommendWidgetStyleConfig('chart', data)).toEqual(
      expect.objectContaining({ variant: 'donut' })
    );
    expect(recommendWidgetSize('chart', data)).toEqual({ w: 6, h: 4 });
  });

  it('expands dense tables to a full-width layout', () => {
    const data = {
      columns: ['部门', '收入', '成本', '利润', '利润率', '同比'],
      rows: Array.from({ length: 12 }, (_, index) => ['部门' + index, 1, 2, 3, '10%', '+2%']),
    };

    expect(recommendWidgetSize('table', data)).toEqual({ w: 12, h: 6 });
  });

  it('keeps business widgets independent from generic chart and metric inference', () => {
    const data = {
      businessType: 'message-center',
      messages: [
        { title: '采购合同审批', status: 'pending', priority: 'high' },
      ],
      value: 12,
      labels: ['审批', '通知'],
      values: [8, 4],
    };

    expect(inferWidgetType(data)).toBe('business');
    expect(recommendWidgetType('business', data)).toBe('business');
    expect(recommendWidgetSize('business', data)).toEqual({ w: 6, h: 5 });
  });

  it('recommends dedicated sizes for business subtypes', () => {
    expect(recommendWidgetSize('business', { businessType: 'calendar' })).toEqual({ w: 5, h: 5 });
    expect(recommendWidgetSize('business', { businessType: 'insight-hub' })).toEqual({ w: 6, h: 5 });
  });
});
