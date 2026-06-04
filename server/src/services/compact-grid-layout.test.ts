import { describe, expect, it } from 'vitest';
import { compactGridLayout } from './widget-normalizer';

describe('compactGridLayout', () => {
  it('arranges widgets in a tight flow layout', () => {
    const widgets = [
      { id: '1', position: { x: 0, y: 0, w: 4, h: 2 } },
      { id: '2', position: { x: 9, y: 0, w: 3, h: 2 } },
      { id: '3', position: { x: 6, y: 0, w: 3, h: 2 } },
      { id: '4', position: { x: 3, y: 4, w: 6, h: 4 } },
      { id: '5', position: { x: 0, y: 8, w: 6, h: 4 } },
      { id: '6', position: { x: 6, y: 8, w: 6, h: 4 } },
    ];

    const result = compactGridLayout(widgets);

    // Row 0: 4 + 3 + 3 = 10
    expect(result[0].position).toEqual({ x: 0, y: 0, w: 4, h: 2 });
    expect(result[1].position).toEqual({ x: 4, y: 0, w: 3, h: 2 });
    expect(result[2].position).toEqual({ x: 7, y: 0, w: 3, h: 2 });
    // Row 1: 6 + 6 = 12
    expect(result[3].position).toEqual({ x: 0, y: 2, w: 6, h: 4 });
    expect(result[4].position).toEqual({ x: 6, y: 2, w: 6, h: 4 });
    // Row 2: 6
    expect(result[5].position).toEqual({ x: 0, y: 6, w: 6, h: 4 });
  });

  it('wraps widgets that exceed 12 columns', () => {
    const widgets = [
      { id: '1', position: { x: 0, y: 0, w: 8, h: 2 } },
      { id: '2', position: { x: 0, y: 0, w: 8, h: 2 } },
    ];

    const result = compactGridLayout(widgets);

    expect(result[0].position).toEqual({ x: 0, y: 0, w: 8, h: 2 });
    expect(result[1].position).toEqual({ x: 0, y: 2, w: 8, h: 2 });
  });

  it('handles empty array', () => {
    expect(compactGridLayout([])).toEqual([]);
  });
});
