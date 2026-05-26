// ─── Cockpit Templates ───
// 领域模板统一导出与自动注册

import { registerTemplate } from './registry';
import { salesTemplate } from './sales';
import { hrTemplate } from './hr';
import { financeTemplate } from './finance';
import { opsTemplate } from './ops';
import { marketingTemplate } from './marketing';
import { industryResearchTemplate } from './industry-research';
import { weatherTemplate } from './weather';
import { defaultTemplate } from './default';

// 自动注册所有领域模板
registerTemplate(salesTemplate);
registerTemplate(hrTemplate);
registerTemplate(financeTemplate);
registerTemplate(opsTemplate);
registerTemplate(marketingTemplate);
registerTemplate(industryResearchTemplate);
registerTemplate(weatherTemplate);
registerTemplate(defaultTemplate);

export { registerTemplate, getTemplate, listTemplates, resolveDomain, personalizeTemplate, buildSpecFromTemplate } from './registry';
export type { CockpitTemplate, WidgetTemplate, TemplateContext } from './types';
