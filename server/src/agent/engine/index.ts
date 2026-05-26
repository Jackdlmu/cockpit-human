// ─── Intent Engine ───
// Phase 2: 多意图识别引擎统一入口

import type { Intent } from '../types';
import type { Connector, ChatMessage } from '../../connection/types';
import type { FusionConfig } from './types';
import { defaultFusionConfig } from './types';
import { registerBuiltinRules, matchAllIntents, listIntentRules } from './intent-registry';
import { runExtractors } from './entity-extractors';
import { fuseIntents, parseLLMIntent } from './intent-fusion';
import type { RecognizeResult } from './types';

// 确保内置规则已注册
registerBuiltinRules();

// ── 多意图识别入口 ──

/**
 * 多意图识别主入口
 *
 * 流程：
 * 1. 规则匹配 → 返回所有匹配的意图（不只是最高分）
 * 2. LLM 识别 → 获取语义级意图
 * 3. 融合 → 规则锚定 + LLM 细化
 * 4. 实体提取 → 按规则配置的提取器运行
 */
export async function recognizeIntents(
  command: string,
  llmConnector?: Connector,
  config: FusionConfig = defaultFusionConfig
): Promise<RecognizeResult> {
  // 1. 规则匹配（返回所有匹配）
  const ruleMatches = matchAllIntents(command);
  const ruleIntents = ruleMatches.map((m) => ({
    type: m.type,
    score: Math.min(m.score, 1.0),
    entities: runExtractors(
      // 查找该规则配置的提取器
      (() => {
        const rules = listIntentRules();
        const rule = rules.find((r: any) => r.id === m.ruleId);
        return rule?.extractors || [];
      })(),
      command
    ),
  }));

  // 2. LLM 识别（可选）
  let llmIntent: ReturnType<typeof parseLLMIntent> = null;
  let llmUsed = false;

  if (llmConnector && llmConnector.chat) {
    try {
      const systemPrompt = `你是一个意图识别助手。分析用户指令，识别可能的多个意图。
输出 JSON 格式：
{
  "intent": "plan_cockpit|create_cockpit|execute_command|query_data|list_agents|chat",
  "confidence": 0.0-1.0,
  "entities": { "target": "...", "action": "..." }
}
只输出 JSON，不要其他内容。`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: command },
      ];

      const content = await llmConnector.chat!(messages, { temperature: 0.1, maxTokens: 200 });
      llmIntent = parseLLMIntent(content);
      llmUsed = true;
    } catch (err: any) {
      console.warn('[IntentEngine] LLM recognition failed:', err.message);
    }
  }

  // 3. 融合
  const { primary, secondary, entities } = fuseIntents(ruleIntents, llmIntent, config);

  // 填充 raw 字段
  primary.raw = command;
  secondary.forEach((s) => (s.raw = command));

  return {
    primary,
    secondary,
    entities,
    diagnostics: {
      ruleMatches: ruleMatches.map((m) => ({
        type: m.type,
        score: m.score,
        patterns: m.matchedPatterns,
      })),
      llmUsed,
      llmConfidence: llmIntent?.confidence ?? null,
    },
  };
}

/**
 * 单意图识别（兼容旧接口）
 * 返回主意图，忽略次要意图
 */
export async function recognizeIntent(
  command: string,
  llmConnector?: Connector,
  config?: FusionConfig
): Promise<Intent> {
  const result = await recognizeIntents(command, llmConnector, config);
  return result.primary;
}

// ── 重新导出 ──
export { registerIntentRule, unregisterIntentRule, listIntentRules } from './intent-registry';
export { registerExtractor, getExtractor, runExtractors } from './entity-extractors';
export { fuseIntents, parseLLMIntent } from './intent-fusion';
export type { IntentRule, IntentPattern, FusionConfig, EntityExtractor, RecognizeResult } from './types';
