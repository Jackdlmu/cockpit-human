// ─── 任务规划模块 ───
// 根据意图生成子任务序列

import type { Intent, TaskPlan, SubTask, ExecutionContext } from './types';
import type { Connector, ChatMessage, ConnectionCapability } from '../connection/types';
import { extractEntities, recognizeIntents } from './intent';
import { buildSpecFromTemplate, resolveDomain, getTemplate, personalizeTemplate } from './templates';
import type { RecognizeResult } from './engine';
import { enhanceCockpitSpec, generateCockpitSpec } from './engine/llm-enhancer';

/** 清理 LLM 返回的 markdown 代码块，提取纯 JSON */
function cleanJsonResponse(content: string): string {
  const trimmed = content.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0].trim();
  return trimmed;
}

/** 清理驾驶舱名称：去除技术术语、ID、不友好前缀 */
export function sanitizeCockpitName(name: string): string {
  return name
    .replace(/ID为[\w-]+的?/gi, '')
    .replace(/ws-[-\w]+的?/gi, '')
    .replace(/在?ID为/gi, '')
    .replace(/^[在从对往向于]/, '')
    .replace(/的$/, '')
    .trim();
}

/** 根据意图构建默认驾驶舱配置（模板驱动） */
export function buildDefaultCockpitSpec(
  name: string,
  rawIntent: string,
  entities: Record<string, string>
): any {
  // 清理名称
  name = sanitizeCockpitName(name);
  if (!name || name === '新') name = '新驾驶舱';
  if (!name.endsWith('驾驶舱')) name = name + '驾驶舱';
  // 优先使用模板系统：基于领域关键词匹配最合适的模板
  const specFromTemplate = buildSpecFromTemplate(rawIntent, name, entities);
  if (specFromTemplate) {
    return specFromTemplate;
  }

  // 兜底：如果模板系统未匹配到任何模板，使用默认模板
  const defaultTpl = getTemplate('default');
  if (defaultTpl) {
    return personalizeTemplate(defaultTpl, {
      name,
      rawCommand: rawIntent,
      entities,
      domain: '通用',
    });
  }

  // 最终兜底：提供一组通用基础组件，确保驾驶舱不为空
  return {
    name,
    description: `由座舱代理自动创建的${name}`,
    icon: 'Layers',
    color: '#8b5cf6',
    widgets: [
      {
        id: 'w-metric-1',
        type: 'metric',
        title: '核心指标',
        position: { x: 0, y: 0, w: 3, h: 2 },
        data: { value: '—', change: '', trend: 'flat' },
      },
      {
        id: 'w-chart-1',
        type: 'chart',
        title: '趋势分析',
        position: { x: 3, y: 0, w: 6, h: 4 },
        data: { labels: [], values: [] },
      },
      {
        id: 'w-list-1',
        type: 'list',
        title: '关键事项',
        position: { x: 9, y: 0, w: 3, h: 4 },
        data: { items: [] },
      },
      {
        id: 'w-status-1',
        type: 'status',
        title: '运行状态',
        position: { x: 0, y: 2, w: 3, h: 2 },
        data: { items: [] },
      },
    ],
    agentIds: [],
    primaryAgentId: '',
  };
}

/** 基于规则的规划器（支持多意图） */
export function planByRule(intents: Intent[], context: ExecutionContext): TaskPlan {
  const tasks: SubTask[] = [];
  const primaryIntent = intents[0];

  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    const taskId = String(i + 1);
    // 补充规则提取的 entities，确保关键字段不丢失
    const enrichedEntities = { ...extractEntities(intent.raw), ...intent.entities };

    switch (intent.type) {
      case 'plan_cockpit':
      case 'create_cockpit': {
        const ruleEntities = extractEntities(intent.raw);
        const name = ruleEntities.cockpitType
          ? `${ruleEntities.cockpitType}驾驶舱`
          : (intent.raw.match(/["']([^"']+?)["']/)?.[1] || '新驾驶舱');
        const defaultSpec = buildDefaultCockpitSpec(name, intent.raw, enrichedEntities);
        tasks.push({
          id: taskId,
          description: `创建驾驶舱：${name}`,
          capability: 'cockpit-create',
          params: { spec: defaultSpec },
        });
        break;
      }

      case 'execute_command': {
        // 当指定了 workspaceId 时，避免使用 cockpit-execute（外部平台可能不认识本地 workspace ID）
        // 优先使用 agent-invoke，其内部会自动降级到 llm-chat
        tasks.push({
          id: taskId,
          description: `执行命令：${intent.raw}`,
          capability: context.workspaceId ? 'agent-invoke' : 'cockpit-execute',
          params: { command: intent.raw, workspaceId: context.workspaceId },
        });
        break;
      }

      case 'query_data': {
        tasks.push({
          id: taskId,
          description: `查询数据：${intent.raw}`,
          capability: 'agent-invoke',
          params: { command: intent.raw, workspaceId: context.workspaceId },
        });
        break;
      }

      case 'list_agents': {
        tasks.push({
          id: taskId,
          description: '获取智能体列表',
          capability: 'agent-list',
          params: {},
        });
        break;
      }

      case 'chat':
      default: {
        tasks.push({
          id: taskId,
          description: `通用对话：${intent.raw}`,
          capability: 'llm-chat',
          params: { message: intent.raw },
        });
        break;
      }
    }
  }

  const intentDesc = intents.map((i) => i.type).join(' + ');
  return {
    intent: primaryIntent,
    tasks,
    reasoning: `基于意图「${intentDesc}」生成 ${tasks.length} 个子任务`,
    usedLLM: false,
  };
}

/** 通过 LLM 生成完整配置（Phase 3: LLM 直接生成 → fallback 到规则打底 + 增强） */
export async function planByLLM(
  rulePlan: TaskPlan,
  intent: Intent,
  context: ExecutionContext,
  llmConnector: Connector
): Promise<TaskPlan> {
  // 只对 create_cockpit 意图进行增强/生成
  const createTask = rulePlan.tasks.find((t) => t.capability === 'cockpit-create');
  if (!createTask || !createTask.params.spec) {
    return { ...rulePlan, usedLLM: false };
  }

  const baseSpec = createTask.params.spec as Record<string, unknown>;
  const enrichedEntities = { ...extractEntities(intent.raw), ...intent.entities };

  // Step 1: 优先尝试让 LLM 直接生成完整驾驶舱配置
  try {
    const { spec: generatedSpec, usedLLM: genUsedLLM } = await generateCockpitSpec(
      intent.raw,
      baseSpec,
      llmConnector
    );

    if (genUsedLLM && generatedSpec.widgets && (generatedSpec.widgets as any[]).length > 0) {
      // LLM 成功生成完整配置，直接替换规则 plan
      const generatedTasks = rulePlan.tasks.map((t) => {
        if (t.capability === 'cockpit-create') {
          return { ...t, params: { ...t.params, spec: generatedSpec } };
        }
        return t;
      });

      return {
        ...rulePlan,
        tasks: generatedTasks,
        reasoning: `LLM 直接生成驾驶舱配置「${generatedSpec.name}」，共 ${(generatedSpec.widgets as any[]).length} 个组件`,
        usedLLM: true,
      };
    }
  } catch (err: any) {
    console.warn('[Planner] LLM full spec generation failed:', err.message, '→ fallback to enhancement');
  }

  // Step 2: fallback 到增强模式（在 baseSpec 上追加/替换 widget）
  try {
    const { spec: enhancedSpec, enhancement, usedLLM } = await enhanceCockpitSpec(
      intent.raw,
      baseSpec,
      enrichedEntities,
      llmConnector
    );

    if (!usedLLM || !enhancement) {
      return { ...rulePlan, usedLLM: false };
    }

    const enhancedTasks = rulePlan.tasks.map((t) => {
      if (t.capability === 'cockpit-create') {
        return { ...t, params: { ...t.params, spec: enhancedSpec } };
      }
      return t;
    });

    const comments: string[] = ['规则打底 + LLM 增强'];
    if (enhancement.description) comments.push('描述优化');
    if (enhancement.suggestedWidgets && enhancement.suggestedWidgets.length > 0) {
      comments.push(enhancement.replaceWidgets
        ? `替换为 ${enhancement.suggestedWidgets.length} 个 widget`
        : `新增 ${enhancement.suggestedWidgets.length} 个 widget`);
    }

    return {
      ...rulePlan,
      tasks: enhancedTasks,
      reasoning: `${rulePlan.reasoning}（${comments.join('，')}）`,
      usedLLM: true,
    };
  } catch (err: any) {
    console.warn('[Planner] LLM enhancement failed:', err.message, '→ using rule plan');
    return { ...rulePlan, usedLLM: false };
  }
}

/** 统一规划入口（Phase 3: 规则打底 + LLM 增强 + 校验应用） */
export async function planTasks(
  intent: Intent,
  context: ExecutionContext,
  llmConnector?: Connector
): Promise<TaskPlan>;
export async function planTasks(
  intents: Intent[],
  context: ExecutionContext,
  llmConnector?: Connector
): Promise<TaskPlan>;
export async function planTasks(
  intentOrIntents: Intent | Intent[],
  context: ExecutionContext,
  llmConnector?: Connector
): Promise<TaskPlan> {
  const intents = Array.isArray(intentOrIntents) ? intentOrIntents : [intentOrIntents];
  const primaryIntent = intents[0];

  // ── Step 1: 规则打底（始终执行，<10ms） ──
  let plan = planByRule(intents, context);

  // 后处理保证：任何 create_cockpit 意图必须有 cockpit-create 任务
  const hasCreateIntent = intents.some((i) => i.type === 'create_cockpit');
  if (hasCreateIntent) {
    const hasCreateTask = plan.tasks.some((t) => t.capability === 'cockpit-create');
    if (!hasCreateTask) {
      const enrichedEntities = { ...extractEntities(primaryIntent.raw), ...primaryIntent.entities };
      const name = enrichedEntities.cockpitType
        ? `${enrichedEntities.cockpitType}驾驶舱`
        : (primaryIntent.raw.match(/["']([^"']+?)["']/)?.[1] || '新驾驶舱');
      const defaultSpec = buildDefaultCockpitSpec(name, primaryIntent.raw, enrichedEntities);
      plan.tasks.push({
        id: `auto-${Date.now()}`,
        description: `创建驾驶舱：${name}`,
        capability: 'cockpit-create',
        params: { spec: defaultSpec },
      });
      plan.reasoning += '（自动补全创建任务）';
    }
  }

  // ── Step 2: LLM 增强（单意图时可选，~300-500ms） ──
  // 多意图时跳过 LLM 增强（LLM 目前不支持多意图增强）
  if (intents.length === 1 && llmConnector && llmConnector.chat) {
    try {
      plan = await planByLLM(plan, primaryIntent, context, llmConnector);
    } catch (err: any) {
      console.warn('[Planner] LLM enhancement failed:', err.message, '→ using rule plan');
      plan.usedLLM = false;
    }
  } else {
    plan.usedLLM = false;
  }

  if (plan.usedLLM === undefined) {
    plan.usedLLM = false;
  }

  return plan;
}
