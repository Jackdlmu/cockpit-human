// ─── 全局分组策略配置 ───
// 所有模板/驾驶舱共享的统一分组策略。
// 模板只负责为 widget 设置 group 字段，分组策略由全局配置决定。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const POLICY_FILE = path.join(DATA_DIR, 'grouping-policy.json');

export interface GroupingPolicy {
  /** 是否启用组件分组（仅影响创建时的初始化） */
  enabled: boolean;
  /** 分组策略：auto=自动推断，manual=严格遵循手动标签 */
  strategy: 'auto' | 'manual';
  /** 手动模式下的预定义分组标签 */
  manualGroups?: string[];
}

const DEFAULT_POLICY: GroupingPolicy = {
  enabled: true,
  strategy: 'auto',
};

function readPolicy(): GroupingPolicy {
  try {
    if (!fs.existsSync(POLICY_FILE)) {
      return { ...DEFAULT_POLICY };
    }
    const raw = fs.readFileSync(POLICY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<GroupingPolicy>;
    return {
      enabled: parsed.enabled ?? DEFAULT_POLICY.enabled,
      strategy: parsed.strategy ?? DEFAULT_POLICY.strategy,
      manualGroups: Array.isArray(parsed.manualGroups) ? parsed.manualGroups : DEFAULT_POLICY.manualGroups,
    };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

function writePolicy(policy: GroupingPolicy): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(POLICY_FILE, JSON.stringify(policy, null, 2), 'utf-8');
  } catch (err) {
    console.error('[GroupingPolicy] Failed to write:', err);
  }
}

let cachedPolicy: GroupingPolicy | null = null;

export function getGroupingPolicy(): GroupingPolicy {
  if (!cachedPolicy) {
    cachedPolicy = readPolicy();
  }
  return { ...cachedPolicy };
}

export function setGroupingPolicy(policy: Partial<GroupingPolicy>): GroupingPolicy {
  const current = getGroupingPolicy();
  const next: GroupingPolicy = {
    enabled: policy.enabled ?? current.enabled,
    strategy: policy.strategy ?? current.strategy,
    manualGroups: policy.manualGroups !== undefined ? policy.manualGroups : current.manualGroups,
  };
  cachedPolicy = next;
  writePolicy(next);
  return next;
}

export function resetGroupingPolicy(): GroupingPolicy {
  cachedPolicy = { ...DEFAULT_POLICY };
  writePolicy(cachedPolicy);
  return cachedPolicy;
}
