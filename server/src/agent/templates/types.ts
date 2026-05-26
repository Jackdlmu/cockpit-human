// ─── Cockpit Template Types ───
// 领域模板类型定义：支持从种子数据提取、注册、匹配和个性化

export interface WidgetTemplate {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'kanban' | 'timeline' | 'list' | 'report' | 'universal' | 'progress' | 'status';
  title: string;
  position: { x: number; y: number; w: number; h: number };
  data: Record<string, unknown>;
  dataSource?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  link?: Record<string, unknown>;
}

export interface CockpitTemplate {
  /** 模板唯一标识，如 'sales' | 'hr' | 'finance' */
  id: string;
  /** 显示名称 */
  name: string;
  /** 领域标识 */
  domain: string;
  /** 触发该模板的关键词（中英文） */
  keywords: string[];
  /** Lucide 图标名 */
  icon: string;
  /** 主题色 */
  color: string;
  /** 关联的智能体 ID 列表 */
  agentIds: string[];
  /** 主智能体 ID */
  primaryAgentId: string;
  /** 默认组件配置 */
  widgets: WidgetTemplate[];
  /** 描述模板，支持 {{name}} 占位符 */
  description: string;
  /** 初始化 Prompt：创建驾驶舱后自动执行，用于初始化数据和组件 */
  initPrompt?: string;
  /** 数据获取失败时是否回退到 demo 示例数据，默认 false */
  useDemoDataFallback?: boolean;
}

/** 个性化参数：从用户指令中提取的变量 */
export interface TemplateContext {
  /** 驾驶舱名称（已包含"驾驶舱"后缀） */
  name: string;
  /** 用户原始指令 */
  rawCommand: string;
  /** 提取的实体 */
  entities: Record<string, string>;
  /** 识别到的领域 */
  domain: string;
}
