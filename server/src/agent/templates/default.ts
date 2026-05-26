import type { CockpitTemplate } from './types';

/**
 * 默认/通用模板
 * 当用户指令无法匹配任何领域模板时使用
 * 不绑定任何特定领域智能体，完全依赖 LLM 生成配置
 */
export const defaultTemplate: CockpitTemplate = {
  id: 'default',
  name: '通用驾驶舱',
  domain: '通用',
  keywords: [],
  icon: 'Layers',
  color: '#8b5cf6',
  agentIds: [],
  primaryAgentId: '',
  description: '由座舱代理自动创建的{{name}}',
  widgets: [],
};
