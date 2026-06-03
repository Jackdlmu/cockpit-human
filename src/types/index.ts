export type ViewType = 'workspace';

// ── Connection (Protocol Adapter) ──

export type ConnectionType = 'yonclaw' | 'openclaw' | 'hermes' | 'generic-llm';
export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'connecting';
export type ProtocolType = 'http' | 'grpc' | 'websocket';

export interface ConnectionConfig {
  endpoint: string;
  apiKey?: string;
  token?: string;
  pat?: string;
  authType?: string;
  protocol: ProtocolType;
  timeout?: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topicPrefix?: string;
  organizationId?: string;
}

export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  config: ConnectionConfig;
  hasSecret?: boolean;
  status: ConnectionStatus;
  capabilities: string[];
  priority: number;
  enabled: boolean;
  lastHealthCheck: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionInput {
  name: string;
  type: ConnectionType;
  config: ConnectionConfig;
  capabilities?: string[];
  priority?: number;
  enabled?: boolean;
}

// ── Workspace (Cockpit) ──
export type AgentMode = 'single' | 'multi-coordinator' | 'multi-parallel' | 'llm-only';

export interface AgentBinding {
  agentId: string;
  connectionId?: string;
  status: 'active' | 'unavailable' | 'pending';
  lastUsed?: string;
}

export interface OrchestrationState {
  mode: 'platform-led' | 'cockpit-led' | 'llm-direct';
  health: 'healthy' | 'degraded' | 'unavailable';
  primaryAgent: { id: string; name: string; sourceType?: string } | null;
  activeAgents: { id: string; name: string; status: string }[];
  cockpitAgentActive: boolean;
  reason: string;
  timestamp: string;
}

export interface WorkspaceGrouping {
  enabled: boolean;
  groups?: Array<{
    id: string;
    name: string;
    widgetIds: string[];
  }>;
}

/** 全局分组策略配置 */
export interface GroupingPolicy {
  enabled: boolean;
  /** 分组策略：auto=自动推断，manual=严格遵循手动标签 */
  strategy: 'auto' | 'manual';
  /** 手动模式下的预定义分组标签 */
  manualGroups?: string[];
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'running' | 'stopped' | 'error';
  createdAt: string;
  updatedAt: string;
  agentIds: string[];
  primaryAgentId: string;
  agentMode?: AgentMode;
  agentBindings?: AgentBinding[];
  widgets: Widget[];
  /** 协作调度状态 */
  orchestration?: OrchestrationState;
  /** 数据获取失败时是否回退到 demo 示例数据 */
  useDemoDataFallback?: boolean;
  initializing?: boolean;
  initializationMode?: 'llm' | 'real-data';
  executionOwner?: 'cockpit' | 'external';
  externalProvider?: 'yonclaw' | 'openclaw' | 'generic-llm' | 'other';
  externalWorkspaceId?: string;
  externalConnectionId?: string;
  /** 组件分组配置 */
  grouping?: WorkspaceGrouping;
}

export interface WidgetDataSource {
  type: 'skill' | 'query' | 'static' | 'event';
  skillId?: string;
  agentId?: string;
  input?: Record<string, unknown>;
  query?: {
    connectionId?: string;
    method?: 'GET' | 'POST';
    endpoint?: string;
    sql?: string;
    params?: Record<string, unknown>;
  };
  eventFilter?: {
    source?: string;
    sourceType?: string;
    type?: string;
  };
  refreshInterval?: number;
  transform?: string;
  fallbackToStatic?: boolean;
}

export interface WidgetDataIntent {
  domain?: string;
  metricKey?: string;
  sourcePreference?: 'real-time' | 'tool-first' | 'template-first';
  priority?: 'high' | 'medium' | 'low';
  required?: boolean;
}

export interface WidgetDetailConfig {
  type?: 'slide-out' | 'modal';
  content?: string;
  dataSource?: WidgetDataSource;
  width?: string;
}

export interface WidgetThreshold {
  value: number;
  color?: string;
  level?: 'normal' | 'warning' | 'critical';
}

export interface WidgetMetricItem {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'flat';
  caption?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export interface WidgetAdaptiveHeadline {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  status?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export interface WidgetAdaptiveSection {
  type?: 'metrics' | 'list' | 'text' | 'table' | 'status' | 'timeline' | 'highlights';
  title?: string;
  description?: string;
  content?: string;
  metrics?: WidgetMetricItem[];
  items?: Array<string | Record<string, unknown>>;
  columns?: string[];
  rows?: Array<string[] | Record<string, unknown>>;
}

export interface WidgetDrillDownConfig {
  enabled: boolean;
  dimension?: string;
  targetType?: WidgetType;
}

export interface WidgetLinkConfig {
  type: 'workspace' | 'widget' | 'url';
  targetId?: string;
  targetTemplate?: string;
  url?: string;
  title?: string;
  /** 打开方式：drawer=浮层面板(默认)，blank=新标签页，self=当前页 */
  openMode?: 'drawer' | 'blank' | 'self';
}

export type WidgetType =
  | 'chart' | 'table' | 'metric' | 'list' | 'kanban' | 'timeline'
  | 'report' | 'universal' | 'adaptive' | 'progress' | 'status' | 'html'
  | 'gauge'      // 仪表盘：展示目标达成率 (0-100%)
  | 'funnel'     // 漏斗图：流程转化分析
  | 'radar'      // 雷达图：多维能力评估
  | 'heatmap'    // 热力图：二维数据密度
  | 'bullet'     // 子弹图：紧凑目标进度
  | 'alert'      // 告警列表：带级别的事件日志
  | 'map'        // 地图：地理分布
  | 'business'   // 业务组件：消息中心、日程、洞察等可交互复合组件
  | 'workflow'   // 工作流：AI 执行步骤与进度展示
  | 'result'     // 结果：结构化分析结论与发现
  | 'actions'    // 行动：下一步计划与待办
  | 'artifact';  // 产出物：SQL/代码/报告等可交付物预览

export type BusinessWidgetType = 'message-center' | 'calendar' | 'insight-hub';

export interface BusinessWidgetConfig {
  category?: 'business';
  businessType: BusinessWidgetType;
  dataContract?: string;
  actionContract?: string;
  connectorPolicy?: {
    preferred?: 'yonclaw' | 'openapi' | 'cli' | 'local';
    fallback?: Array<'yonclaw' | 'openapi' | 'cli' | 'local'>;
  };
  permissions?: string[];
  refreshInterval?: number;
  interactionMode?: 'readonly' | 'actionable' | 'agent-assisted';
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  data?: Record<string, unknown>;
  dataSource?: WidgetDataSource;
  dataIntent?: WidgetDataIntent;
  business?: BusinessWidgetConfig;
  detail?: WidgetDetailConfig;
  link?: WidgetLinkConfig;
  /** 组件所属分组标识 */
  group?: string;
}

export interface WidgetCatalogItem {
  id: string;
  name: string;
  type: WidgetType;
  category: string;
  icon: string;
  color: string;
  description: string;
  agentDescription: string;
  useCases: string[];
  tags: string[];
  schemaHint?: {
    recommendedDataShape?: Record<string, unknown>;
    layoutAdvice?: string;
    styleConfig?: Record<string, unknown>;
    visualMapping?: Record<string, unknown>;
  };
  template: Partial<Widget>;
  isBuiltin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ── Multi-Agent ──
export interface Agent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  status: 'active' | 'idle' | 'error' | 'building';
  category: string;
  skills: string[];
  usageCount: number;
  lastUsed: string;
  owner: string;
  /** 运行时发现的来源信息 */
  sourceConnectionId?: string;
  sourceConnectionName?: string;
  sourceType?: string;
  capabilities?: string[];
}

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
}

export interface TableRow {
  [key: string]: string | number;
}

// ── Dynamic Card ──
export interface CardData {
  type: 'data' | 'table' | 'form' | 'chart' | 'workflow' | 'approval' | 'insight';
  title: string;
  subtitle?: string;
  data?: Record<string, unknown>;
  rows?: TableRow[];
  columns?: TableColumn[];
  fields?: FormField[];
  steps?: WorkflowStep[];
  actions?: CardAction[];
  metric?: { value: string; label: string; change?: string; changeType?: 'positive' | 'negative' | 'neutral' };
  chartData?: Array<{ label: string; value: number }>;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'textarea' | 'number';
  value?: string;
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

export interface WorkflowStep {
  id: string;
  label: string;
  status: 'completed' | 'active' | 'pending';
  description?: string;
}

export interface CardAction {
  label: string;
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: string;
}

// ── Cockpit Template ──
export interface CockpitTemplate {
  id: string;
  name: string;
  domain: string;
  keywords: string[];
  icon: string;
  color: string;
  agentIds: string[];
  primaryAgentId: string;
  description: string;
  widgets: Widget[];
  initPrompt?: string;
  useDemoDataFallback?: boolean;
  isBuiltin?: boolean;
  _custom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
