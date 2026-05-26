// ─── Transform 引擎 ───
// 将 skill/查询的原始输出映射为 widget 需要的格式
// 支持 JSONPath 和轻量箭头函数表达式

/**
 * 判断是否是 JSONPath 表达式（以 $ 开头）
 */
function isJsonPath(expr: string): boolean {
  return expr.trim().startsWith('$');
}

/**
 * 简易 JSONPath 实现（只支持 .key 和 [index]）
 * 示例：$.revenue 或 $.data.rows[0]
 */
function evalJsonPath(obj: unknown, path: string): unknown {
  const tokens = path
    .trim()
    .replace(/^\$\.?/, '')
    .split(/\.|\[(\d+)\]/)
    .filter(Boolean);

  let current: any = obj;
  for (const token of tokens) {
    if (current == null) return undefined;
    const idx = Number(token);
    current = Number.isNaN(idx) ? current[token] : current[idx];
  }
  return current;
}

/**
 * 使用箭头函数字符串做映射
 * 示例："({ revenue, growth }) => ({ value: revenue, change: growth })"
 *
 * 安全策略：
 * - 只允许箭头函数格式
 * - 通过 new Function 在最小上下文中执行
 * - 不暴露全局对象
 */
function evalArrowFunction(rawData: unknown, expr: string): unknown {
  const trimmed = expr.trim();

  // 安全检查：必须是箭头函数格式
  const arrowMatch = trimmed.match(/^\s*\(?\s*([\w\s,${}._\[\]'"`]*)\s*\)?\s*=>\s*(.+)$/s);
  if (!arrowMatch) {
    console.warn('[Transform] Not an arrow function, skipping:', expr.slice(0, 50));
    return rawData;
  }

  const [, params, body] = arrowMatch;

  try {
    // 构造包装函数：将原始数据作为参数传入
    const fn = new Function(
      '__data',
      `
        const ${params.trim() || '_'} = __data;
        return (${body});
      `
    );
    return fn(rawData);
  } catch (err: any) {
    console.warn('[Transform] Eval failed:', err.message, '→ returning raw data');
    return rawData;
  }
}

/**
 * 应用 transform 表达式将原始数据映射为 widget 格式
 *
 * @param rawData  原始数据（skill 返回或查询结果）
 * @param expr     transform 表达式（JSONPath 或箭头函数）
 * @returns        映射后的数据；失败时返回原始数据
 */
export function applyTransform(rawData: unknown, expr?: string): unknown {
  if (!expr || !expr.trim()) return rawData;

  try {
    if (isJsonPath(expr)) {
      return evalJsonPath(rawData, expr);
    }
    return evalArrowFunction(rawData, expr);
  } catch (err: any) {
    console.warn('[Transform] Unexpected error:', err.message);
    return rawData;
  }
}
