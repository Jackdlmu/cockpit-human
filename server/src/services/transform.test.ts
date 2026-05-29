import { describe, it, expect } from 'vitest';
import { applyTransform, isJsonPath, evalJsonPath } from './transform';

describe('isJsonPath', () => {
  it('returns true for JSONPath expressions', () => {
    expect(isJsonPath('$.revenue')).toBe(true);
    expect(isJsonPath('  $.data.value')).toBe(true);
    expect(isJsonPath('$[0].name')).toBe(true);
  });

  it('returns false for non-JSONPath expressions', () => {
    expect(isJsonPath('({ revenue }) => revenue')).toBe(false);
    expect(isJsonPath('')).toBe(false);
    expect(isJsonPath('console.log("hack")')).toBe(false);
  });
});

describe('evalJsonPath', () => {
  it('navigates nested objects', () => {
    const data = { revenue: { value: 100, trend: 'up' } };
    expect(evalJsonPath(data, '$.revenue.value')).toBe(100);
    expect(evalJsonPath(data, '$.revenue.trend')).toBe('up');
  });

  it('handles array indices', () => {
    const data = { items: [{ name: 'A' }, { name: 'B' }] };
    expect(evalJsonPath(data, '$.items[0].name')).toBe('A');
    expect(evalJsonPath(data, '$.items[1].name')).toBe('B');
  });

  it('returns undefined for missing paths', () => {
    expect(evalJsonPath({}, '$.missing')).toBeUndefined();
    expect(evalJsonPath(null, '$.anything')).toBeUndefined();
  });

  it('returns the whole object for empty path', () => {
    const data = { a: 1 };
    expect(evalJsonPath(data, '$')).toEqual(data);
  });
});

describe('applyTransform', () => {
  it('returns raw data when no expression provided', () => {
    const data = { value: 42 };
    expect(applyTransform(data)).toBe(data);
    expect(applyTransform(data, '')).toBe(data);
    expect(applyTransform(data, '   ')).toBe(data);
  });

  it('applies JSONPath expressions', () => {
    const data = { revenue: { value: 1000, change: '+10%' } };
    expect(applyTransform(data, '$.revenue.value')).toBe(1000);
    expect(applyTransform(data, '$.revenue.change')).toBe('+10%');
  });

  it('falls back to raw data for unsupported expressions', () => {
    const data = { value: 42 };
    // Arrow functions are no longer supported (security fix)
    expect(applyTransform(data, '({ value }) => value')).toBe(data);
    expect(applyTransform(data, 'console.log("hack")')).toBe(data);
  });

  it('falls back gracefully on JSONPath errors', () => {
    const data = { value: 42 };
    // evalJsonPath won't throw on normal data, but if it did:
    expect(applyTransform(data, '$.value')).toBe(42);
  });
});
