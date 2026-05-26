// ─── TemplateRegistry ───
// 驾驶舱模板注册表：支持关键词匹配、领域解析和模板加载

import type { CockpitTemplate, TemplateContext } from './types';
import * as templateStore from '../../services/template-store';

// ── 内置模板存储 ──
const templates = new Map<string, CockpitTemplate>();

// ── 加载/重载自定义模板（覆盖同名内置模板）─
export function loadCustomTemplates(): void {
  // 先移除所有已有自定义标记的模板
  for (const [id, t] of templates) {
    if ((t as any)._custom) {
      templates.delete(id);
    }
  }
  const custom = templateStore.listCustomTemplates();
  for (const t of custom) {
    templates.set(t.id, t as CockpitTemplate);
    console.log(`[TemplateRegistry] Loaded custom template: ${t.id}`);
  }
}

export function registerTemplate(template: CockpitTemplate): void {
  templates.set(template.id, template);
}

export function unregisterTemplate(id: string): void {
  templates.delete(id);
}

export function getTemplate(id: string): CockpitTemplate | undefined {
  return templates.get(id);
}

export function listTemplates(): CockpitTemplate[] {
  return Array.from(templates.values());
}

// ── 领域解析：从用户指令中匹配最合适的模板 ──

/**
 * 基于关键词匹配解析领域
 * 返回匹配到的模板ID和置信度分数
 */
export function resolveDomain(command: string): { templateId: string; score: number } | null {
  const lower = command.toLowerCase();
  let best: { templateId: string; score: number } | null = null;

  for (const template of templates.values()) {
    let score = 0;
    for (const keyword of template.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        // 长关键词权重更高（更精确）
        score += keyword.length >= 4 ? 2 : 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { templateId: template.id, score };
    }
  }

  return best;
}

/**
 * 将模板个性化为实际的 CockpitSpec
 * 支持名称、描述替换和组件ID生成
 */
export function personalizeTemplate(
  template: CockpitTemplate,
  context: TemplateContext
): {
  name: string;
  description: string;
  icon: string;
  color: string;
  agentIds: string[];
  primaryAgentId: string;
  widgets: any[];
} {
  const ts = Date.now();
  let counter = 0;
  const nextId = () => `w-${ts}-${++counter}`;

  // 替换描述中的占位符
  const description = template.description
    .replace(/\{\{name\}\}/g, context.name)
    .replace(/\{\{domain\}\}/g, template.domain);

  // 深拷贝 widgets 并重新生成 ID
  const widgets = template.widgets.map((w) => ({
    ...w,
    id: nextId(),
    data: { ...w.data },
  }));

  return {
    name: context.name,
    description,
    icon: template.icon,
    color: template.color,
    agentIds: [...template.agentIds],
    primaryAgentId: template.primaryAgentId,
    widgets,
  };
}

// ── 快捷方法：指令 → 完整 Spec ──

export function buildSpecFromTemplate(
  command: string,
  name: string,
  entities: Record<string, string>
): {
  name: string;
  description: string;
  icon: string;
  color: string;
  agentIds: string[];
  primaryAgentId: string;
  widgets: any[];
} | null {
  const resolved = resolveDomain(command);
  if (!resolved) return null;

  const template = getTemplate(resolved.templateId);
  if (!template) return null;

  return personalizeTemplate(template, {
    name,
    rawCommand: command,
    entities,
    domain: template.domain,
  });
}
