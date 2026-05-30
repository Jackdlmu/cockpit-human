import { describe, expect, it } from 'vitest';
import { inferWidgetType } from './widget-type-inferer';
import { __testables } from './workspace-initializer';

describe('workspace initializer data-first helpers', () => {
  it('sortWidgetsByDataIntent prioritizes required and high-priority widgets first', () => {
    const widgets = [
      { id: 'w-low', type: 'metric', title: '低优先级', dataIntent: { priority: 'low' as const } },
      { id: 'w-required', type: 'metric', title: '必需数据', dataIntent: { required: true, priority: 'medium' as const, sourcePreference: 'real-time' as const } },
      { id: 'w-tool', type: 'chart', title: '工具优先', dataIntent: { priority: 'high' as const, sourcePreference: 'tool-first' as const } },
    ];

    const ordered = __testables.sortWidgetsByDataIntent(widgets as any);
    expect(ordered.map((widget) => widget.id)).toEqual(['w-required', 'w-tool', 'w-low']);
  });

  it('inferWidgetType can guide runtime widget adaptation for obvious mismatches', () => {
    const adaptedType = inferWidgetType({
      labels: ['周一', '周二', '周三'],
      values: [18, 21, 19],
    });

    expect(adaptedType).toBe('chart');
  });
});
