// ─── useThresholdColor ───
// 根据数值和阈值配置返回语义色级别
// 用于 metric / gauge / bullet / chart 等 widget 的告警着色

export interface ThresholdConfig {
  value: number;                 // 阈值数值（绝对值或百分比，取决于调用方式）
  color?: string;                // 自定义颜色（hex），优先级高于 level 默认色
  level?: 'normal' | 'warning' | 'critical';
}

export interface ThresholdResult {
  level: 'normal' | 'warning' | 'critical';
  color: string;     // 主色（用于 stroke、border 等）
  bg: string;        // 背景色（带透明度，用于 fill、bg）
  text: string;      // 文字色（Tailwind class）
}

const LEVEL_DEFAULTS: Record<string, ThresholdResult> = {
  normal:   { level: 'normal',   color: '#22c55e', bg: '#22c55e18', text: 'text-emerald-500' },
  warning:  { level: 'warning',  color: '#f59e0b', bg: '#f59e0b18', text: 'text-amber-500' },
  critical: { level: 'critical', color: '#ef4444', bg: '#ef444418', text: 'text-red-500' },
};

/**
 * 根据数值匹配阈值配置
 * @param value   当前数值
 * @param max     最大值（用于百分比计算），不传则 value 被当作百分比(0-100)
 * @param thresholds  阈值配置数组，按 value 升序排列效果最佳；未提供时使用默认 70%/90% 规则
 */
export function getThresholdColor(
  value: number,
  max?: number,
  thresholds?: ThresholdConfig[]
): ThresholdResult {
  const pct = max !== undefined && max > 0
    ? (value / max) * 100
    : value;

  // 未提供阈值配置时使用默认规则
  if (!thresholds || thresholds.length === 0) {
    if (pct >= 90) return LEVEL_DEFAULTS.critical;
    if (pct >= 70) return LEVEL_DEFAULTS.warning;
    return LEVEL_DEFAULTS.normal;
  }

  // 按 value 排序后遍历，找到第一个满足 pct >= t.value 的阈值
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  let matched: ThresholdConfig | null = null;
  for (const t of sorted) {
    if (pct >= t.value) {
      matched = t;
    }
  }

  if (!matched) {
    return LEVEL_DEFAULTS.normal;
  }

  const level = matched.level ||
    (pct >= 90 ? 'critical' : pct >= 70 ? 'warning' : 'normal');

  const defaults = LEVEL_DEFAULTS[level] || LEVEL_DEFAULTS.normal;

  return {
    level,
    color: matched.color || defaults.color,
    bg: matched.color ? matched.color + '20' : defaults.bg,
    text: defaults.text,
  };
}

/** 快捷函数：仅从 widget.data.thresholds 中提取阈值配置 */
export function extractThresholds(data: Record<string, unknown>): ThresholdConfig[] | undefined {
  const raw = data.thresholds;
  if (!Array.isArray(raw)) return undefined;
  return raw.map((t: any) => ({
    value: Number(t.value ?? t.threshold ?? 0),
    color: t.color || t.colour || undefined,
    level: t.level || t.severity || undefined,
  })).filter((t) => !isNaN(t.value));
}
