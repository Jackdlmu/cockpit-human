// ─── Transform 引擎 ───
// 将 skill/查询的原始输出映射为 widget 需要的格式
// 安全策略：仅支持 JSONPath，彻底移除所有代码执行能力

/**
 * 判断是否是 JSONPath 表达式（以 $ 开头）
 */
export function isJsonPath(expr: string): boolean {
  return expr.trim().startsWith('$');
}

/**
 * 简易 JSONPath 实现（只支持 .key 和 [index]）
 * 示例：$.revenue 或 $.data.rows[0]
 */
export function evalJsonPath(obj: unknown, path: string): unknown {
  const tokens = path
    .trim()
    .replace(/^\$\.?/, '')
    .split(/\.|\[(\d+)\]/)
    .filter(Boolean);

  let current: unknown = obj;
  for (const token of tokens) {
    if (current == null) return undefined;
    const idx = Number(token);
    if (Number.isNaN(idx)) {
      current = (current as Record<string, unknown>)[token];
    } else {
      current = (current as unknown[])[idx];
    }
  }
  return current;
}

/**
 * 应用 transform 表达式将原始数据映射为 widget 格式
 *
 * @param rawData  原始数据（skill 返回或查询结果）
 * @param expr     transform 表达式（仅支持 JSONPath）
 * @returns        映射后的数据；失败时返回原始数据
 */
export function applyTransform(rawData: unknown, expr?: string): unknown {
  if (!expr || !expr.trim()) return rawData;

  try {
    if (isJsonPath(expr)) {
      return evalJsonPath(rawData, expr);
    }
    console.warn('[Transform] Only JSONPath expressions are supported. Skipping:', expr.slice(0, 50));
    return rawData;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Transform] Error:', msg);
    return rawData;
  }
}
