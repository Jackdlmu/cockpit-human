// ─── 座舱代理类型定义 ───

import type { ConnectionCapability } from '../connection/types';

/** 用户意图类型 */
export type IntentType =
  | 'plan_cockpit'      // 规划/设计驾驶舱
  | 'create_cockpit'    // 创建驾驶舱
  | 'execute_command'   // 执行命令/调度任务
  | 'query_data'        // 查询数据/KPI
  | 'list_agents'       // 列出智能体
  | 'chat';             // 通用对话

/** 识别出的意图 */
export interface Intent {
  type: IntentType;
  confidence: number;      // 0-1
  entities: Record<string, string>;  // 提取的实体
  raw: string;             // 原始指令
}

/** 子任务 */
export interface SubTask {
  id: string;
  description: string;
  capability: ConnectionCapability;
  targetConnection?: string;  // 指定连接ID（可选，由路由层决定）
  params: Record<string, unknown>;
  dependsOn?: string[];       // 依赖的其他子任务ID
}

/** 任务计划 */
export interface TaskPlan {
  intent: Intent;
  tasks: SubTask[];
  reasoning: string;
  usedLLM?: boolean; // 标记是否使用了 LLM 规划（false 表示规则 fallback）
}

/** 子任务执行结果 */
export interface SubTaskResult {
  taskId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  latency: number;
}

/** 座舱代理响应 */
export interface CockpitAgentResponse {
  message: string;           // 给用户看的自然语言回复
  plan?: TaskPlan;           // 执行的计划（调试用）
  results?: SubTaskResult[]; // 各子任务结果
  card?: any;                // 动态卡片数据
  suggestedCommands?: string[];
  sessionId: string;
}

/** 座舱代理流式chunk */
export interface CockpitAgentChunk {
  chunk: string;
  stage?: 'thinking' | 'planning' | 'executing' | 'summarizing';
  done: boolean;
  // 最终 chunk 扩展字段（done === true 时携带完整响应）
  message?: string;
  card?: any;
  suggestedCommands?: string[];
  results?: SubTaskResult[];
  usedLLM?: boolean;
}

/** Widget 数据源配置 */
export interface WidgetDataSource {
  type: 'skill' | 'query' | 'static' | 'event';

  // type='skill': 调用某个 skill/agent
  skillId?: string;
  agentId?: string;
  input?: Record<string, unknown>;

  // type='query': 直接查询
  query?: {
    connectionId?: string;
    method?: 'GET' | 'POST';
    endpoint?: string;
    sql?: string;
    params?: Record<string, unknown>;
  };

  // type='event': 订阅事件
  eventFilter?: {
    source?: string;
    sourceType?: string;
    type?: string;
  };

  // 通用配置
  refreshInterval?: number;
  transform?: string;
  fallbackToStatic?: boolean;
}

/** Widget 详情配置 */
export interface WidgetDetailConfig {
  type?: 'slide-out' | 'modal';
  content?: string;
  dataSource?: WidgetDataSource;
  width?: string;
}

/** 执行上下文 */
export interface ExecutionContext {
  workspaceId?: string;
  userId?: string;
  sessionId: string;
  history?: Array<{ role: 'user' | 'agent'; content: string }>;
  command?: string; // 原始用户指令（用于 extractEntities 重新提取信息）
}
