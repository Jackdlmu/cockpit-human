// ─── Intent Fusion ───
// 规则意图与 LLM 意图的融合策略
// 策略：规则锚定 + LLM 细化

import type { Intent, IntentType } from '../types';
import type { FusionConfig, FusionStrategy } from './types';
import { defaultFusionConfig } from './types';
import { extractEntities as legacyExtractEntities } from '../intent';

interface RawLLMIntent {
  intent: string;
  confidence: number;
  entities?: Record<string, string>;
}

/**
 * 融合规则意图和 LLM 意图
 *
 * 策略说明：
 * - rule_anchor: 规则确定意图类型和核心实体，LLM 仅补充额外实体和优化置信度
 * - llm_priority: LLM 优先，规则作为校验
 * - weighted_merge: 加权合并，取两者加权平均
 */
export function fuseIntents(
  ruleIntents: Array<{ type: IntentType; score: number; entities: Record<string, string> }>,
  llmIntent: RawLLMIntent | null,
  config: FusionConfig = defaultFusionConfig
): { primary: Intent; secondary: Intent[]; entities: Record<string, string> } {
  // 1. 过滤低置信度的规则意图
  const validRules = ruleIntents.filter((r) => r.score >= config.ruleThreshold);

  // 2. 合并实体（规则实体优先，LLM 实体补充）
  const mergedEntities: Record<string, string> = {};
  for (const ri of validRules) {
    Object.assign(mergedEntities, ri.entities);
  }
  if (llmIntent?.entities) {
    // LLM 实体补充规则中不存在的字段
    for (const [key, value] of Object.entries(llmIntent.entities)) {
      if (!mergedEntities[key] && value && value !== '...') {
        mergedEntities[key] = value;
      }
    }
  }
  // 同时运行旧版提取器确保兼容性
  const legacyEntities = legacyExtractEntities(validRules[0]?.type ? 'rule' : llmIntent?.intent || '');
  Object.assign(mergedEntities, legacyEntities);

  // 3. 确定主意图
  let primaryType: IntentType;
  let primaryConfidence: number;

  if (config.strategy === 'rule_anchor') {
    // 规则锚定：优先使用规则识别的意图类型
    if (validRules.length > 0) {
      primaryType = validRules[0].type;
      // 置信度取规则和LLM的加权（LLM如果认同规则意图，则提高置信度）
      const llmAgrees = llmIntent && llmIntent.intent === primaryType;
      primaryConfidence = llmAgrees
        ? Math.min(0.95, validRules[0].score + llmIntent.confidence * 0.2)
        : validRules[0].score;
    } else if (llmIntent && llmIntent.confidence >= config.llmThreshold) {
      primaryType = llmIntent.intent as IntentType;
      primaryConfidence = llmIntent.confidence;
    } else {
      primaryType = 'chat';
      primaryConfidence = 0.5;
    }
  } else if (config.strategy === 'llm_priority') {
    if (llmIntent && llmIntent.confidence >= config.llmThreshold) {
      primaryType = llmIntent.intent as IntentType;
      primaryConfidence = llmIntent.confidence;
    } else if (validRules.length > 0) {
      primaryType = validRules[0].type;
      primaryConfidence = validRules[0].score;
    } else {
      primaryType = 'chat';
      primaryConfidence = 0.5;
    }
  } else {
    // weighted_merge
    const ruleScore = validRules.length > 0 ? validRules[0].score : 0;
    const llmScore = llmIntent ? llmIntent.confidence : 0;
    if (llmScore > ruleScore && llmIntent) {
      primaryType = llmIntent.intent as IntentType;
      primaryConfidence = llmScore;
    } else if (validRules.length > 0) {
      primaryType = validRules[0].type;
      primaryConfidence = ruleScore;
    } else {
      primaryType = 'chat';
      primaryConfidence = 0.5;
    }
  }

  const primary: Intent = {
    type: primaryType,
    confidence: primaryConfidence,
    entities: mergedEntities,
    raw: '', // 由调用方填充
  };

  // 4. 多意图检测
  const secondary: Intent[] = [];
  if (config.enableMultiIntent && validRules.length > 1) {
    const primaryScore = validRules[0].score;
    for (let i = 1; i < validRules.length; i++) {
      const gap = primaryScore - validRules[i].score;
      if (gap <= config.multiIntentGap) {
        // 分数接近，可能是多意图
        secondary.push({
          type: validRules[i].type,
          confidence: validRules[i].score,
          entities: mergedEntities,
          raw: '',
        });
      } else {
        break; // 分数差距太大，后面的不再考虑
      }
    }
  }

  return { primary, secondary, entities: mergedEntities };
}

/**
 * 解析 LLM 返回的 JSON 意图
 */
export function parseLLMIntent(content: string): RawLLMIntent | null {
  try {
    const trimmed = content.trim();
    // 清理 markdown 代码块
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const cleanContent = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleanContent;
    const parsed = JSON.parse(jsonStr);

    if (!parsed.intent || typeof parsed.confidence !== 'number') {
      return null;
    }

    return {
      intent: parsed.intent,
      confidence: parsed.confidence,
      entities: parsed.entities || {},
    };
  } catch {
    return null;
  }
}
