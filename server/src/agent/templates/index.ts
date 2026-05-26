// ─── Cockpit Templates ───
// 领域模板统一导出与自动注册

import { loadBuiltinTemplates, loadCustomTemplates } from './registry';

// 自动加载系统模板（JSON）和自定义模板
loadBuiltinTemplates();
loadCustomTemplates();

export { registerTemplate, getTemplate, listTemplates, resolveDomain, personalizeTemplate, buildSpecFromTemplate, loadBuiltinTemplates, loadCustomTemplates } from './registry';
export type { CockpitTemplate, WidgetTemplate, TemplateContext } from './types';
