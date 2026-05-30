// ─── Tool Registry ───
// 外部数据工具注册表：LLM Tool Calling 的工具发现与执行

import type { ToolExecutor, ToolDefinition } from './types';
import { webSearchTool } from './executors/web-search';
import { fetchUrlTool } from './executors/fetch-url';
import { weatherTool } from './executors/weather';
import { financeCompanyTool } from './executors/finance-company';

const registry = new Map<string, ToolExecutor>();

/** 注册内置工具 */
export function registerBuiltinTools(): void {
  registerTool(webSearchTool);
  registerTool(fetchUrlTool);
  registerTool(weatherTool);
  registerTool(financeCompanyTool);
  console.log(`[ToolRegistry] Registered ${registry.size} built-in tools`);
}

/** 注册单个工具 */
export function registerTool(tool: ToolExecutor): void {
  registry.set(tool.name, tool);
}

/** 获取工具执行器 */
export function getTool(name: string): ToolExecutor | undefined {
  return registry.get(name);
}

/** 获取所有工具定义（内部格式） */
export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(registry.values()).map((t) => t.definition);
}

/** 获取所有工具定义（OpenAI / Kimi 兼容格式，用于传给 LLM） */
export function getAllToolDefinitionsForLLM(): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return Array.from(registry.values()).map((t) => ({
    type: 'function',
    function: {
      name: t.definition.name,
      description: t.definition.description,
      parameters: t.definition.parameters,
    },
  }));
}

/** 列出所有已注册的工具名称 */
export function listTools(): string[] {
  return Array.from(registry.keys());
}

/** 执行工具 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; data: unknown; error?: string }> {
  const tool = registry.get(name);
  if (!tool) {
    return { success: false, data: null, error: `工具 "${name}" 未注册` };
  }
  try {
    return await tool.execute(args);
  } catch (err: any) {
    console.error(`[ToolRegistry] Execute "${name}" failed:`, err.message);
    return { success: false, data: null, error: err.message || '工具执行失败' };
  }
}
