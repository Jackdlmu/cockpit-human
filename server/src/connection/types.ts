// ─── 协议适配层：连接与连接器类型定义 ───
// 解耦智能驾驶舱与外部平台（YonClaw / OpenClaw / Hermes / 通用大模型）

// ── 连接配置 ──

/** 支持的外部平台类型 */
export type ConnectionType = 'yonclaw' | 'openclaw' | 'hermes' | 'generic-llm';

/** 通信协议 */
export type ProtocolType = 'http' | 'grpc' | 'websocket';

/** 连接状态 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

/** 连接能力标签 */
export type ConnectionCapability =
  | 'agent-list'      // 列出外部智能体
  | 'agent-invoke'    // 调用外部智能体
  | 'agent-stream'    // 流式调用外部智能体
  | 'llm-chat'        // 大模型对话
  | 'llm-stream'      // 流式大模型对话
  | 'cockpit-plan'    // 规划驾驶舱
  | 'cockpit-create'  // 创建驾驶舱
  | 'cockpit-execute' // 执行驾驶舱命令
  | 'event-subscribe' // 订阅外部事件
  | 'event-publish';  // 发布事件到外部

/** HTTP 通用配置 */
export interface HttpConfig {
  endpoint: string;
  apiKey?: string;
  protocol: 'http';
  timeout?: number;
}

/** gRPC 配置 */
export interface GrpcConfig {
  endpoint: string;
  apiKey?: string;
  protocol: 'grpc';
  timeout?: number;
}

/** WebSocket 配置 */
export interface WsConfig {
  endpoint: string;
  protocol: 'websocket';
  topicPrefix?: string;
  timeout?: number;
}

/** 通用大模型配置 */
export interface LLMConfig {
  endpoint: string;
  apiKey?: string;
  protocol: 'http';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

/** 连接配置联合类型 */
export type ConnectionConfig = HttpConfig | GrpcConfig | WsConfig | LLMConfig;

/** 连接实体 */
export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  config: ConnectionConfig;
  status: ConnectionStatus;
  capabilities: ConnectionCapability[];
  priority: number;        // 路由优先级，数值越小优先级越高
  enabled: boolean;
  lastHealthCheck: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 创建连接输入 */
export interface CreateConnectionInput {
  name: string;
  type: ConnectionType;
  config: ConnectionConfig;
  capabilities?: ConnectionCapability[];
  priority?: number;
  enabled?: boolean;
}

/** 更新连接输入 */
export interface UpdateConnectionInput {
  name?: string;
  config?: Partial<ConnectionConfig>;
  capabilities?: ConnectionCapability[];
  priority?: number;
  enabled?: boolean;
  status?: ConnectionStatus;
}

// ── 连接器接口 ──

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** LLM 选项 */
export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/** 智能体调用输入 */
export interface AgentInvokeInput {
  agentId: string;
  command: string;
  context?: Record<string, unknown>;
  sessionId?: string;
}

/** 智能体调用结果 */
export interface AgentInvokeResult {
  message: string;
  data?: Record<string, unknown>;
  suggestedCommands?: string[];
  sessionId?: string;
}

/** 驾驶舱规划请求 */
export interface CockpitPlanRequest {
  goal: string;
  constraints?: string[];
  context?: Record<string, unknown>;
}

/** 驾驶舱规划结果 */
export interface CockpitPlanResult {
  plan: {
    steps: Array<{
      id: string;
      description: string;
      capability: ConnectionCapability;
      targetConnection?: string;
      params?: Record<string, unknown>;
    }>;
    estimatedTime?: number;
  };
  /** LLM 生成的完整驾驶舱配置方案 */
  cockpitSpec?: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    widgets?: any[];
    agentIds?: string[];
    primaryAgentId?: string;
  };
  reasoning?: string;
}

/** 驾驶舱规格 */
export interface CockpitSpec {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  agentIds?: string[];
  primaryAgentId?: string;
  widgets?: Array<{
    type: string;
    title: string;
    position?: { x: number; y: number; w: number; h: number };
  }>;
}

/** 平台事件 */
export interface PlatformEvent {
  id: string;
  source: string;           // 连接 ID
  sourceType: ConnectionType;
  type: string;             // 事件类型
  payload: Record<string, unknown>;
  timestamp: string;
}

/** 连接器统一接口 — 每个外部平台的抽象 */
export interface Connector {
  readonly connectionId: string;
  readonly type: ConnectionType;

  // ── 生命周期 ──
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }>;

  // ── 智能体能力 ──
  listAgents?(): Promise<Array<Record<string, unknown>>>;
  getAgent?(id: string): Promise<Record<string, unknown>>;
  invokeAgent?(input: AgentInvokeInput): Promise<AgentInvokeResult>;
  streamAgent?(input: AgentInvokeInput): AsyncGenerator<string, AgentInvokeResult>;

  // ── 大模型能力 ──
  chat?(messages: ChatMessage[], options?: LLMOptions): Promise<string>;
  streamChat?(messages: ChatMessage[], options?: LLMOptions): AsyncGenerator<string>;

  // ── 驾驶舱能力（双向通信核心）─
  planCockpit?(request: CockpitPlanRequest): Promise<CockpitPlanResult>;
  createCockpit?(spec: CockpitSpec): Promise<Record<string, unknown>>;
  executeOnCockpit?(workspaceId: string, command: string, params?: Record<string, unknown>): Promise<unknown>;

  // ── 事件（双向）─
  subscribeEvents?(handler: (event: PlatformEvent) => void): Promise<() => void>;
}

/** 连接器构造器 */
export type ConnectorFactory = (connection: Connection) => Connector;
