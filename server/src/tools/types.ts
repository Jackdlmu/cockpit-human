// ─── Tool Types ───
// 外部数据工具类型定义：支持 LLM Tool Calling（Function Calling）

/** 工具参数 Schema */
export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
}

/** 工具定义（传给 LLM 的格式） */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

/** LLM 返回的 tool_call */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

/** 工具执行器接口 */
export interface ToolExecutor {
  name: string;
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
