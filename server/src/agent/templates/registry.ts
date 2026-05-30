// ─── TemplateRegistry ───
// 驾驶舱模板注册表：支持关键词匹配、领域解析和模板加载

import type { CockpitTemplate, TemplateContext } from './types';
import * as templateStore from '../../services/template-store';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── 内置模板存储 ──
const templates = new Map<string, CockpitTemplate>();

// ── 加载系统模板（从 JSON 文件，只读）─
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_FILE = path.resolve(__dirname, '../../../data/builtin-templates.json');

export function loadBuiltinTemplates(): void {
  try {
    if (!fs.existsSync(BUILTIN_FILE)) {
      console.warn('[TemplateRegistry] builtin-templates.json not found, skipping');
      return;
    }
    const raw = fs.readFileSync(BUILTIN_FILE, 'utf-8');
    const list: CockpitTemplate[] = JSON.parse(raw);
    for (const t of list) {
      templates.set(t.id, { ...t, _builtin: true } as CockpitTemplate);
    }
    console.log(`[TemplateRegistry] Loaded ${list.length} builtin templates`);
  } catch (err: any) {
    console.error('[TemplateRegistry] Failed to load builtin templates:', err.message);
  }
}

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
    templates.set(t.id, { ...t, _custom: true } as CockpitTemplate);
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

function buildEmptyWidgetData(type: string): Record<string, unknown> {
  switch (type) {
    case 'metric': return { value: '—', change: '', trend: 'flat' };
    case 'chart': return { labels: [], values: [] };
    case 'table': return { rows: [], columns: [] };
    case 'list': return { items: [] };
    case 'kanban': return { stages: [] };
    case 'timeline': return { steps: [] };
    case 'report': return { summary: '', highlights: [] };
    case 'progress': return { value: 0, max: 100, label: '' };
    case 'status': return { items: [] };
    case 'html': return { html: '', title: '' };
    case 'universal': return {};
    case 'adaptive': return { sections: [] };
    case 'gauge': return { value: 0, min: 0, max: 100, unit: '%' };
    case 'funnel': return { stages: [] };
    case 'radar': return { labels: [], values: [] };
    case 'heatmap': return { rows: [] };
    case 'bullet': return { value: 0, target: 0, max: 100, label: '' };
    case 'alert': return { alerts: [] };
    case 'map': return { points: [] };
    default: return {};
  }
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
  useDemoDataFallback: boolean;
  initPrompt?: string;
  templateName?: string;
} {
  const ts = Date.now();
  let counter = 0;
  const nextId = () => `w-${ts}-${++counter}`;

  // 替换描述中的占位符
  const description = template.description
    .replace(/\{\{name\}\}/g, context.name)
    .replace(/\{\{domain\}\}/g, template.domain);

  // 深拷贝 widgets 并重新生成 ID
  // 保留模板静态数据作为可见兜底，真正是否回退由 workspace.useDemoDataFallback 控制。
  // 这样当真实数据初始化失败时，用户仍能看到模板演示数据，而不是空白占位。
  const useFallback = template.useDemoDataFallback ?? true;
  const widgets = template.widgets.map((w) => ({
    ...w,
    id: nextId(),
    data: useFallback ? { ...w.data } : buildEmptyWidgetData(w.type),
  }));

  return {
    name: context.name,
    description,
    icon: template.icon,
    color: template.color,
    agentIds: [...template.agentIds],
    primaryAgentId: template.primaryAgentId,
    widgets,
    useDemoDataFallback: useFallback,
    initPrompt: context.initPrompt || template.initPrompt,
    templateName: template.name,
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
