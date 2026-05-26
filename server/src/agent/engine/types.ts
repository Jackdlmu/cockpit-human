// ─── Intent Engine Types ───
// Phase 2: 多意图识别引擎类型定义

import type { Intent, IntentType } from '../types';

/** 意图匹配模式 */
export interface IntentPattern {
  kind: 'keyword' | 'regex';
  match: string | RegExp;
  weight: number;
  languages: ('zh' | 'en')[];
}

/** 可注册的意图规则 */
export interface IntentRule {
  id: string;
  type: IntentType;
  priority: number;
  patterns: IntentPattern[];
  /** 该规则触发时使用的实体提取器 ID 列表 */
  extractors: string[];
}

/** 规则匹配结果 */
export interface IntentMatch {
  ruleId: string;
  type: IntentType;
  score: number;
  matchedPatterns: string[];
}

/** 实体提取器定义 */
export interface EntityExtractor {
  id: string;
  name: string;
  extract: (command: string) => Record<string, string>;
}

/** 提取的实体项（带置信度） */
export interface ExtractedEntity {
  key: string;
  value: string;
  confidence: number;
  source: 'rule' | 'llm';
}

/** 多意图识别结果 */
export interface MultiIntentResult {
  /** 主意图（最高分） */
  primary: Intent;
  /** 所有识别到的意图（含分数） */
  all: Array<{ intent: Intent; score: number }>;
  /** 合并后的实体 */
  entities: Record<string, string>;
}

/** 意图融合策略 */
export type FusionStrategy = 'rule_anchor' | 'llm_priority' | 'weighted_merge';

export interface FusionConfig {
  strategy: FusionStrategy;
  /** 规则意图的最低置信度，低于此值则忽略 */
  ruleThreshold: number;
  /** LLM 意图的最低置信度，低于此值则忽略 */
  llmThreshold: number;
  /** 是否支持多意图 */
  enableMultiIntent: boolean;
  /** 多意图的分数差阈值：主意图与次意图分数差在此值以内时，保留次意图 */
  multiIntentGap: number;
}

export const defaultFusionConfig: FusionConfig = {
  strategy: 'rule_anchor',
  ruleThreshold: 0.3,
  llmThreshold: 0.5,
  enableMultiIntent: true,
  multiIntentGap: 0.3,
};

/** 多意图识别结果 */
export interface RecognizeResult {
  /** 主意图 */
  primary: Intent;
  /** 次要意图（多意图时） */
  secondary: Intent[];
  /** 合并后的实体 */
  entities: Record<string, string>;
  /** 诊断信息 */
  diagnostics: {
    ruleMatches: Array<{ type: string; score: number; patterns: string[] }>;
    llmUsed: boolean;
    llmConfidence: number | null;
  };
}
