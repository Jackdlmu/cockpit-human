// ─── IntentRegistry ───
// 可扩展的意图规则注册表：支持注册、匹配、多意图返回

import type { Intent, IntentType } from '../types';
import type { IntentRule, IntentMatch, FusionConfig } from './types';
import { defaultFusionConfig } from './types';

const rules: Map<string, IntentRule> = new Map();

export function registerIntentRule(rule: IntentRule): void {
  rules.set(rule.id, rule);
}

export function unregisterIntentRule(id: string): void {
  rules.delete(id);
}

export function listIntentRules(): IntentRule[] {
  return Array.from(rules.values());
}

// ── 规则匹配：返回所有匹配的意图（不只是最高分） ──

export function matchAllIntents(command: string): IntentMatch[] {
  const lower = command.toLowerCase();
  const matches: IntentMatch[] = [];

  for (const rule of rules.values()) {
    let score = 0;
    const matchedPatterns: string[] = [];

    for (const pattern of rule.patterns) {
      let matched = false;

      if (pattern.kind === 'keyword') {
        const keyword = (pattern.match as string).toLowerCase();
        if (lower.includes(keyword)) {
          matched = true;
        }
      } else if (pattern.kind === 'regex') {
        const regex = pattern.match as RegExp;
        if (regex.test(lower)) {
          matched = true;
        }
      }

      if (matched) {
        // 长关键词权重更高（更精确）
        const patternWeight = pattern.weight * (pattern.kind === 'keyword' && (pattern.match as string).length >= 4 ? 1.5 : 1);
        score += patternWeight;
        matchedPatterns.push(String(pattern.match));
      }
    }

    if (score > 0) {
      // 应用规则优先级加权
      score = score * (1 + rule.priority / 100);
      matches.push({
        ruleId: rule.id,
        type: rule.type,
        score: Math.min(score, 1.5), // 封顶
        matchedPatterns,
      });
    }
  }

  // 按分数降序排序
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ── 单意图匹配（兼容旧接口） ──

export function matchBestIntent(command: string): IntentMatch | null {
  const matches = matchAllIntents(command);
  return matches.length > 0 ? matches[0] : null;
}

// ── 内置规则注册 ──

function createKeywordPattern(keyword: string, weight: number, languages: ('zh' | 'en')[]): import('./types').IntentPattern {
  return { kind: 'keyword', match: keyword, weight, languages };
}

function createRegexPattern(regex: RegExp, weight: number, languages: ('zh' | 'en')[]): import('./types').IntentPattern {
  return { kind: 'regex', match: regex, weight, languages };
}

/** 注册所有内置意图规则 */
export function registerBuiltinRules(): void {
  // 创建驾驶舱
  registerIntentRule({
    id: 'create-cockpit',
    type: 'create_cockpit',
    priority: 100,
    patterns: [
      createKeywordPattern('创建', 1.0, ['zh']),
      createKeywordPattern('新建', 1.0, ['zh']),
      createKeywordPattern('生成', 0.9, ['zh']),
      createKeywordPattern('搭建', 0.9, ['zh']),
      createKeywordPattern('添加', 0.8, ['zh']),
      createKeywordPattern('做一个', 0.9, ['zh']),
      createKeywordPattern('驾驶舱', 0.5, ['zh']),
      createKeywordPattern('工作台', 0.5, ['zh']),
      createRegexPattern(/create.*cockpit|create.*dashboard|build.*dashboard/i, 0.9, ['en']),
    ],
    extractors: ['cockpit-name', 'time-range', 'region', 'number'],
  });

  // 规划驾驶舱
  registerIntentRule({
    id: 'plan-cockpit',
    type: 'plan_cockpit',
    priority: 90,
    patterns: [
      createKeywordPattern('规划', 1.0, ['zh']),
      createKeywordPattern('设计', 1.0, ['zh']),
      createKeywordPattern('方案', 0.8, ['zh']),
      createRegexPattern(/plan.*cockpit|design.*cockpit/i, 0.9, ['en']),
    ],
    extractors: ['cockpit-name', 'time-range', 'region'],
  });

  // 执行命令
  registerIntentRule({
    id: 'execute-command',
    type: 'execute_command',
    priority: 80,
    patterns: [
      createKeywordPattern('执行', 1.0, ['zh']),
      createKeywordPattern('运行', 1.0, ['zh']),
      createKeywordPattern('调度', 0.9, ['zh']),
      createKeywordPattern('启动', 0.9, ['zh']),
      createKeywordPattern('停止', 0.9, ['zh']),
      createKeywordPattern('刷新', 0.8, ['zh']),
      createKeywordPattern('更新', 0.8, ['zh']),
      createKeywordPattern('同步', 0.8, ['zh']),
      createKeywordPattern('部署', 0.8, ['zh']),
      createRegexPattern(/execute|run|schedule|start|stop|refresh|deploy/i, 0.8, ['en']),
    ],
    extractors: ['number'],
  });

  // 查询数据
  registerIntentRule({
    id: 'query-data',
    type: 'query_data',
    priority: 80,
    patterns: [
      createKeywordPattern('查询', 1.0, ['zh']),
      createKeywordPattern('查看', 1.0, ['zh']),
      createKeywordPattern('数据', 0.7, ['zh']),
      createKeywordPattern('报表', 0.8, ['zh']),
      createKeywordPattern('趋势', 0.8, ['zh']),
      createKeywordPattern('统计', 0.8, ['zh']),
      createKeywordPattern('多少', 0.9, ['zh']),
      createKeywordPattern('怎么样', 0.8, ['zh']),
      createKeywordPattern('KPI', 0.9, ['zh', 'en']),
      createKeywordPattern('指标', 0.8, ['zh']),
      createRegexPattern(/query|show|metric|report|trend|how many|status/i, 0.8, ['en']),
    ],
    extractors: ['time-range', 'region', 'department', 'metric-name', 'number'],
  });

  // 列出智能体
  registerIntentRule({
    id: 'list-agents',
    type: 'list_agents',
    priority: 70,
    patterns: [
      createKeywordPattern('智能体', 0.8, ['zh']),
      createKeywordPattern('助手', 0.7, ['zh']),
      createKeywordPattern('有哪些', 0.9, ['zh']),
      createKeywordPattern('列出', 0.9, ['zh']),
      createKeywordPattern('agent', 0.8, ['en']),
      createRegexPattern(/list.*agent|show.*agent|available.*agent/i, 0.8, ['en']),
    ],
    extractors: [],
  });

  // 删除/移除（新增）
  registerIntentRule({
    id: 'delete-cockpit',
    type: 'execute_command',
    priority: 85,
    patterns: [
      createKeywordPattern('删除', 1.0, ['zh']),
      createKeywordPattern('移除', 1.0, ['zh']),
      createKeywordPattern('删掉', 1.0, ['zh']),
      createKeywordPattern('去掉', 0.8, ['zh']),
      createRegexPattern(/delete|remove|drop/i, 0.8, ['en']),
    ],
    extractors: ['cockpit-name'],
  });
}
