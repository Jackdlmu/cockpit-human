export type ViewType = 'workspace';

// ── Connection (Protocol Adapter) ──

export type ConnectionType = 'yonclaw' | 'openclaw' | 'hermes' | 'generic-llm';
export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'connecting';
export type ProtocolType = 'http' | 'grpc' | 'websocket';

export interface ConnectionConfig {
  endpoint: string;
  apiKey?: string;
  protocol: ProtocolType;
  timeout?: number;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topicPrefix?: string;
}

export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  config: ConnectionConfig;
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
  /** 数据获取失败时是否回退到 demo 示例数据 */
  useDemoDataFallback?: boolean;
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

export interface WidgetDetailConfig {
  type?: 'slide-out' | 'modal';
  content?: string;
  dataSource?: WidgetDataSource;
  width?: string;
}

export interface WidgetLinkConfig {
  type: 'workspace' | 'widget' | 'url';
  targetId?: string;
  targetTemplate?: string;
  url?: string;
  title?: string;
}

export type WidgetType = 'chart' | 'table' | 'metric' | 'list' | 'kanban' | 'timeline' | 'report' | 'universal' | 'progress' | 'status';

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  data?: Record<string, unknown>;
  dataSource?: WidgetDataSource;
  detail?: WidgetDetailConfig;
  link?: WidgetLinkConfig;
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
