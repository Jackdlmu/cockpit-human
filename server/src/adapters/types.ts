// ─── 智能体平台适配器统一接口 ───
// 解耦后端与具体智能体平台实现

export interface ChatChunk {
  chunk: string;
  done: boolean;
}

export interface ChatResponse {
  message: string;
  card?: any;
  suggestedCommands?: string[];
  sessionId: string;
}

export interface AgentPlatformAdapter {
  /** 获取所有智能体 */
  getAgents(): Promise<any[]>;

  /** 获取单个智能体 */
  getAgent(id: string): Promise<any>;

  /** 获取智能体统计 */
  getAgentStats(id: string): Promise<any>;

  /** 获取所有驾驶舱 */
  getWorkspaces(): Promise<any[]>;

  /** 获取单个驾驶舱 */
  getWorkspace(id: string): Promise<any>;

  /**
   * 与驾驶舱智能体对话（非流式）
   * @param workspaceId 驾驶舱 ID
   * @param command 自然语言指令
   * @param agentId 指定智能体 ID（可选，默认主智能体）
   * @param sessionId 会话 ID
   */
  chat(workspaceId: string, command: string, agentId?: string, sessionId?: string): Promise<ChatResponse>;

  /**
   * 与驾驶舱智能体对话（流式/SSE）
   * 返回一个异步迭代器，每次 yield 一个 chunk
   */
  chatStream(
    workspaceId: string,
    command: string,
    agentId?: string,
    sessionId?: string
  ): AsyncGenerator<ChatChunk, ChatResponse, unknown>;
}
