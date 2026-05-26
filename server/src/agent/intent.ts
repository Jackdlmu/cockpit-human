// ─── 意图识别模块 ───
// Phase 2: 基于 IntentEngine 的多意图识别
// 向后兼容：保留原有函数签名，内部使用新引擎

import type { Intent, IntentType } from './types';
import type { Connector, ChatMessage } from '../connection/types';
import { recognizeIntent as engineRecognizeIntent, recognizeIntents as engineRecognizeIntents } from './engine';
import type { RecognizeResult } from './engine';
import { runExtractors } from './engine';
import { matchAllIntents, listIntentRules } from './engine/intent-registry';

// ── 重新导出引擎功能（供外部使用） ──

export { recognizeIntents } from './engine';
export type { RecognizeResult } from './engine';

// ── 向后兼容的实体提取（内部使用引擎提取器） ──

/** 提取简单实体（向后兼容接口） */
export function extractEntities(command: string): Record<string, string> {
  // 直接复用引擎的 cockpit-name 和 time-range 提取器
  return runExtractors(['cockpit-name', 'time-range', 'region', 'department', 'number'], command);
}

// ── 向后兼容的规则匹配（内部调用引擎） ──

/** 规则匹配意图识别（向后兼容） */
export function recognizeByRule(command: string): Intent | null {
  const matches = matchAllIntents(command);
  if (matches.length === 0) return null;

  const best = matches[0];
  const rules = listIntentRules();
  const rule = rules.find((r: any) => r.id === best.ruleId);
  const entities = runExtractors(rule?.extractors || ['cockpit-name', 'time-range'], command);

  return {
    type: best.type,
    confidence: Math.min(best.score, 1.0),
    entities,
    raw: command,
  };
}

// ── 向后兼容的 LLM 识别 ──

/** 清理 LLM 返回的 markdown 代码块，提取纯 JSON */
function cleanJsonResponse(content: string): string {
  const trimmed = content.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0].trim();
  return trimmed;
}

/** 通过 LLM 识别意图（向后兼容） */
export async function recognizeByLLM(
  command: string,
  llmConnector: Connector
): Promise<Intent | null> {
  const systemPrompt = `你是一个意图识别助手。分析用户指令，输出 JSON 格式：
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

  try {
    console.log('[Intent] Calling LLM for intent recognition...');
    const content = await llmConnector.chat!(messages, { temperature: 0.1, maxTokens: 200 });
    console.log('[Intent] LLM response:', content.slice(0, 200));
    const cleanContent = cleanJsonResponse(content);
    const parsed = JSON.parse(cleanContent);

    if (!parsed.intent || !parsed.confidence) {
      console.warn('[Intent] LLM response missing intent or confidence');
      return null;
    }

    // LLM 识别的 entities 与规则提取的 entities 合并，确保关键字段不丢失
    const ruleEntities = extractEntities(command);
    const mergedEntities = { ...ruleEntities, ...(parsed.entities || {}) };

    console.log(`[Intent] LLM recognized: ${parsed.intent} (confidence: ${parsed.confidence})`);
    return {
      type: parsed.intent as IntentType,
      confidence: parsed.confidence,
      entities: mergedEntities,
      raw: command,
    };
  } catch (err: any) {
    console.warn('[Intent] LLM recognition failed:', err.message, '→ fallback to rule');
    return null;
  }
}

// ── 统一意图识别入口（向后兼容，内部使用新引擎） ──

/** 统一意图识别入口（单意图，向后兼容） */
export async function recognizeIntent(
  command: string,
  llmConnector?: Connector
): Promise<Intent> {
  // 优先使用新引擎（支持多意图融合）
  return engineRecognizeIntent(command, llmConnector);
}
