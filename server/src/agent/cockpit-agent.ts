// ─── CockpitAgent ───
// 座舱代理：智能驾驶舱的「大脑」
// 职责：意图识别 → 任务规划 → 连接路由 → 执行 → 结果聚合

import type { ConnectionManager } from '../connection/manager';
import type { Connector, ChatMessage } from '../connection/types';
import type {
  Intent,
  TaskPlan,
  SubTask,
  SubTaskResult,
  CockpitAgentResponse,
  CockpitAgentChunk,
  ExecutionContext,
} from './types';
import { recognizeIntent, recognizeIntents, recognizeByLLM, recognizeByRule, extractEntities } from './intent';
import type { RecognizeResult } from './engine';
import { planTasks, planByRule, buildDefaultCockpitSpec, sanitizeCockpitName } from './planner';
import * as workspaceStore from '../data/workspaceStore';
import { eventBus } from '../services/event-bus';
import { getAgentRouter } from '../services/agent-router';

export class CockpitAgent {
  // 会话缓存：保存每个 session 的 planning 结果（用于 create 时复用 spec）
  private sessionCache = new Map<string, any>();

  constructor(private connectionManager: ConnectionManager) {}

  // ── 获取 LLM 连接器（用于意图识别和规划）─

  private getLLMConnector(): Connector | undefined {
    const connectors = this.connectionManager.getAllConnectorsByCapability('llm-chat');
    // 优先使用平台型 Connector（openclaw/yonclaw 支持 tool calling 和智能体编排）
    return connectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw') || connectors[0];
  }

  // ── 流式处理入口 ──

  async *handleCommandStream(
    command: string,
    context: ExecutionContext
  ): AsyncGenerator<CockpitAgentChunk, CockpitAgentResponse, unknown> {
    const llmConnector = this.getLLMConnector();
    const startTime = Date.now();

    const llmStatus = llmConnector
      ? `已连接（${llmConnector.type} · ${llmConnector.connectionId}）`
      : '未配置 — 请在设置中添加支持 llm-chat 能力的连接（如通用大模型）';
    console.log(`[CockpitAgent] LLM connector: ${llmConnector ? llmConnector.type + ' (' + llmConnector.connectionId + ')' : 'none (rule-based)'}`);

    // 将原始指令注入 context，供 executeSubTask 使用
    context.command = command;

    // ── Stage 1: 意图识别（Phase 2/3：多意图引擎） ──
    yield { chunk: `🤔 分析意图中...（LLM 状态：${llmStatus}）\n`, stage: 'thinking', done: false };

    let intent: Intent;
    let multiResult: RecognizeResult | null = null;
    let intentError: string | undefined;

    try {
      multiResult = await recognizeIntents(command, llmConnector || undefined);
      intent = multiResult.primary;

      const ruleMatchDesc = multiResult.diagnostics.ruleMatches
        .slice(0, 3)
        .map((m) => `${m.type}(${Math.round(m.score * 100)}%)`)
        .join(', ');
      const sourceTag = multiResult.diagnostics.llmUsed ? '🧠+📋' : '📋';
      yield { chunk: `💡 识别到意图：${intentLabel(intent.type)} ${sourceTag}（置信度 ${Math.round(intent.confidence * 100)}%，规则匹配：${ruleMatchDesc}）\n`, stage: 'thinking', done: false };

      if (multiResult.secondary.length > 0) {
        const secondaryDesc = multiResult.secondary.map((s) => `${intentLabel(s.type)}(${Math.round(s.confidence * 100)}%)`).join(', ');
        yield { chunk: `   └─ 多意图检测：${secondaryDesc}\n`, stage: 'thinking', done: false };
      }
    } catch (err: any) {
      intentError = err.message;
      console.warn('[CockpitAgent] Intent engine failed:', err.message, '→ fallback to legacy');
      if (llmConnector && llmConnector.chat) {
        try {
          const llmIntent = await recognizeByLLM(command, llmConnector);
          if (llmIntent && llmIntent.confidence > 0.6) {
            intent = llmIntent;
          } else {
            const ruleResult = recognizeByRule(command);
            intent = ruleResult || { type: 'chat', confidence: 0.5, entities: extractEntities(command), raw: command };
          }
        } catch {
          const ruleResult = recognizeByRule(command);
          intent = ruleResult || { type: 'chat', confidence: 0.5, entities: extractEntities(command), raw: command };
        }
      } else {
        const ruleResult = recognizeByRule(command);
        intent = ruleResult || { type: 'chat', confidence: 0.5, entities: extractEntities(command), raw: command };
      }
      yield { chunk: `💡 识别到意图：${intentLabel(intent.type)} 📋（置信度 ${Math.round(intent.confidence * 100)}%，来源：规则 fallback）\n`, stage: 'thinking', done: false };
    }

    // ── Stage 2: 任务规划（Phase 3: 规则打底 + LLM 增强） ──
    yield { chunk: '📋 规划任务...\n', stage: 'planning', done: false };

    // ── 已有 Workspace 上下文保护 ──
    // 如果指定了 workspaceId，将 create_cockpit 意图降级为 execute_command，避免重复创建
    if (context.workspaceId && (intent.type === 'create_cockpit' || intent.type === 'plan_cockpit')) {
      console.log(`[CockpitAgent] Workspace context detected (${context.workspaceId}), downgrading ${intent.type} → execute_command`);
      intent = { ...intent, type: 'execute_command', confidence: intent.confidence };
    }

    // 构建意图列表：主意图 + 次要意图
    const allIntents: Intent[] = [intent];
    if (multiResult && multiResult.secondary.length > 0) {
      allIntents.push(...multiResult.secondary);
    }

    let plan: TaskPlan | undefined;
    let planError: string | undefined;

    // ── 外部平台规划优先：如果存在 cockpit-plan 能力，直接调用外部规划 ──
    if (intent.type === 'create_cockpit' || intent.type === 'plan_cockpit') {
      const planConnectors = this.connectionManager.getAllConnectorsByCapability('cockpit-plan');
      const planConnector = planConnectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw') || planConnectors[0];
      if (planConnector && planConnector.planCockpit) {
        try {
          yield { chunk: `📋 正在调用外部规划平台（${planConnector.type} · ${planConnector.connectionId}）...\n`, stage: 'planning', done: false };
          const planResult = await planConnector.planCockpit({ goal: command, constraints: [] });
          console.log(`[CockpitAgent] External plan result from ${planConnector.connectionId}:`, JSON.stringify(planResult).slice(0, 300));

          // 从外部规划结果中提取 spec
          const externalSpec = (planResult as any)?.spec || planResult;
          if (externalSpec && typeof externalSpec === 'object') {
            // 补全缺失字段
            const enrichedEntities = { ...extractEntities(intent.raw), ...intent.entities };
            const baseSpec = buildDefaultCockpitSpec(
              externalSpec.name || enrichedEntities.cockpitType || '新驾驶舱',
              command,
              enrichedEntities
            );
            const mergedSpec = { ...baseSpec, ...externalSpec };

            plan = {
              tasks: [{
                id: `external-plan-${Date.now()}`,
                description: `创建驾驶舱：${mergedSpec.name}`,
                capability: 'cockpit-create',
                params: { spec: mergedSpec },
              }],
              reasoning: `外部平台规划（${planConnector.connectionId}）→ 本地补全执行`,
              usedLLM: true,
            };
            yield { chunk: `📋 外部规划完成，生成驾驶舱「${mergedSpec.name}」\n`, stage: 'planning', done: false };
          }
        } catch (err: any) {
          console.warn('[CockpitAgent] External planCockpit failed:', err.message, '→ fallback to local planning');
          yield { chunk: `📋 外部规划不可用，回退到本地规划...\n`, stage: 'planning', done: false };
        }
      }
    }

    // 本地规划兜底
    if (!plan) {
      try {
        plan = await planTasks(allIntents, context, llmConnector);
        console.log(`[CockpitAgent] Plan: ${plan.tasks.length} tasks, usedLLM: ${plan.usedLLM}`);
      } catch (err: any) {
        planError = err.message;
        console.warn('[CockpitAgent] Plan failed:', err.message, '→ fallback to rule');
        plan = planByRule(allIntents, context);
        plan.usedLLM = false;
      }
    }

    // 简洁的规划结果输出
    const planTag = plan.usedLLM ? '🧠+📋 规则打底 + LLM 增强' : '📋 规则模板';
    yield { chunk: `📋 ${planTag}：${plan.reasoning}，共 ${plan.tasks.length} 个子任务\n`, stage: 'planning', done: false };

    // 显示 LLM 增强详情（如果有）
    if (plan.usedLLM && plan.reasoning.includes('LLM 增强')) {
      const enhancements: string[] = [];
      if (plan.reasoning.includes('描述优化')) enhancements.push('描述优化');
      if (plan.reasoning.includes('widget')) enhancements.push('widget 增强');
      if (enhancements.length > 0) {
        yield { chunk: `   └─ LLM 增强项：${enhancements.join('，')}\n`, stage: 'planning', done: false };
      }
    }

    // ── Stage 3: 执行子任务 ──
    const results: SubTaskResult[] = [];

    for (const task of plan.tasks) {
      const execName = (task.params.spec as any)?.name || '(无名称)';
      yield { chunk: `⚙️ 执行：${task.description}（spec.name=${execName}）...`, stage: 'executing', done: false };

      const taskStart = Date.now();
      let result: SubTaskResult;

      try {
        const data = await this.executeSubTask(task, context);
        result = {
          taskId: task.id,
          success: true,
          data,
          latency: Date.now() - taskStart,
        };
        yield { chunk: ` ✅（${result.latency}ms）\n`, stage: 'executing', done: false };
      } catch (err: any) {
        result = {
          taskId: task.id,
          success: false,
          error: err.message || '执行失败',
          latency: Date.now() - taskStart,
        };
        yield { chunk: ` ❌ ${result.error}\n`, stage: 'executing', done: false };
      }

      results.push(result);
    }

    // ── Stage 4: 结果聚合 ──
    yield { chunk: '📝 整理结果...\n', stage: 'summarizing', done: false };

    const response = await this.aggregateResponse(plan, results, context, llmConnector);

    // 最终 chunk 包含完整响应数据（SSE 通过 yield 传递，return 值无法被 for await 捕获）
    const usedLLM = plan.usedLLM ?? false;
    const finalMessage = usedLLM
      ? response.message
      : response.message;
    yield {
      chunk: '\n',
      stage: 'summarizing',
      done: true,
      message: finalMessage,
      card: response.card,
      suggestedCommands: response.suggestedCommands,
      results,
      usedLLM,
    };

    return {
      ...response,
      plan,
      results,
      sessionId: context.sessionId,
    };
  }

  // ── 非流式处理入口（兼容旧接口）─

  async handleCommand(
    command: string,
    context: ExecutionContext
  ): Promise<CockpitAgentResponse> {
    // 直接内联执行，避免重复执行（generator 遍历一次 + 重新执行一次）
    const llmConnector = this.getLLMConnector();

    let intent = await recognizeIntent(command, llmConnector);

    // 已有 Workspace 上下文保护
    if (context.workspaceId && (intent.type === 'create_cockpit' || intent.type === 'plan_cockpit')) {
      console.log(`[CockpitAgent] Workspace context detected (${context.workspaceId}), downgrading ${intent.type} → execute_command`);
      intent = { ...intent, type: 'execute_command', confidence: intent.confidence };
    }

    let plan: TaskPlan;

    // 外部平台规划优先
    if (intent.type === 'create_cockpit' || intent.type === 'plan_cockpit') {
      const planConnectors = this.connectionManager.getAllConnectorsByCapability('cockpit-plan');
      const planConnector = planConnectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw') || planConnectors[0];
      if (planConnector && planConnector.planCockpit) {
        try {
          const planResult = await planConnector.planCockpit({ goal: command, constraints: [] });
          const externalSpec = (planResult as any)?.spec || planResult;
          if (externalSpec && typeof externalSpec === 'object') {
            const enrichedEntities = { ...extractEntities(intent.raw), ...intent.entities };
            const baseSpec = buildDefaultCockpitSpec(
              externalSpec.name || enrichedEntities.cockpitType || '新驾驶舱',
              command,
              enrichedEntities
            );
            const mergedSpec = { ...baseSpec, ...externalSpec };
            plan = {
              tasks: [{
                id: `external-plan-${Date.now()}`,
                description: `创建驾驶舱：${mergedSpec.name}`,
                capability: 'cockpit-create',
                params: { spec: mergedSpec },
              }],
              reasoning: `外部平台规划（${planConnector.connectionId}）`,
              usedLLM: true,
            };
          } else {
            plan = await planTasks(intent, context, llmConnector);
          }
        } catch (err: any) {
          console.warn('[CockpitAgent] External planCockpit failed:', err.message, '→ fallback to local');
          plan = await planTasks(intent, context, llmConnector);
        }
      } else {
        plan = await planTasks(intent, context, llmConnector);
      }
    } else {
      plan = await planTasks(intent, context, llmConnector);
    }
    const results: SubTaskResult[] = [];

    for (const task of plan.tasks) {
      const taskStart = Date.now();
      try {
        const data = await this.executeSubTask(task, context);
        results.push({ taskId: task.id, success: true, data, latency: Date.now() - taskStart });
      } catch (err: any) {
        results.push({ taskId: task.id, success: false, error: err.message, latency: Date.now() - taskStart });
      }
    }

    const response = await this.aggregateResponse(plan, results, context, llmConnector);
    return {
      ...response,
      plan,
      results,
      sessionId: context.sessionId,
    };
  }

  // ── 子任务执行 ──

  private async executeSubTask(task: SubTask, context: ExecutionContext): Promise<unknown> {
    // 内部能力（不依赖外部 Connector）
    if (task.capability === 'cockpit-create') {
      const cachedSpec = context.sessionId ? this.sessionCache.get(context.sessionId) : undefined;
      // 支持两种参数格式：params.spec（嵌套）或 params 直接包含配置字段（扁平）
      const flatParams = task.params.spec ? undefined : task.params;
      let spec = (task.params.spec as any) || cachedSpec || {
        name: (flatParams?.name as string) || (task.params.name as string) || '新驾驶舱',
        description: (flatParams?.description as string) || (task.params.description as string) || '',
        icon: (flatParams?.icon as string) || undefined,
        color: (flatParams?.color as string) || undefined,
        widgets: (flatParams?.widgets as any[]) || undefined,
        agentIds: (flatParams?.agentIds as string[]) || undefined,
        primaryAgentId: (flatParams?.primaryAgentId as string) || undefined,
      };
      // 最终防线：如果名称是默认的"新驾驶舱"，从原始指令中重新提取
      if ((spec.name === '新驾驶舱' || !sanitizeCockpitName(spec.name)) && context.command) {
        const ruleEntities = extractEntities(context.command);
        const forcedName = ruleEntities.cockpitType
          ? `${ruleEntities.cockpitType}驾驶舱`
          : (context.command.match(/["']([^"']+?)["']/)?.[1] || '新驾驶舱');
        if (forcedName !== '新驾驶舱') {
          spec.name = sanitizeCockpitName(forcedName);
        }
      }
      // 统一清理名称
      spec.name = sanitizeCockpitName(spec.name);
      // 确保名称有效：过短或只剩介词时恢复默认值
      if (!spec.name || spec.name.length < 2 || /^[在从对往向于的]/.test(spec.name)) {
        spec.name = '新驾驶舱';
      }
      // 如果 spec 缺少 widgets（如外部平台 planCockpit 未返回完整配置），用默认模板补全
      if (!spec.widgets || spec.widgets.length === 0) {
        const defaultSpec = buildDefaultCockpitSpec(spec.name, task.description || '', {});
        spec = { ...defaultSpec, ...spec, widgets: defaultSpec.widgets };
      }

      // ── 多智能体适配：根据实际可用连接调整 agentIds ──
      const router = getAgentRouter();
      if (router) {
        try {
          const { mode, reason, availableAgentCount } = await router.suggestAgentMode();
          const domain = extractEntities(context.command || '').domain || spec.domain || '通用';
          const { matched, suggested, unavailable } = await router.suggestAgentsForDomain(
            domain,
            spec.agentIds
          );

          console.log(`[CockpitAgent] Agent mode: ${mode} (${reason}), available: ${availableAgentCount}`);

          if (mode === 'llm-only') {
            // 纯 LLM 模式：清空 agentIds，保留为 llm-only
            spec.agentMode = 'llm-only';
            spec.agentIds = [];
            spec.primaryAgentId = '';
            if (spec.description && !spec.description.includes('(LLM)')) {
              spec.description += '（由 LLM 驱动）';
            }
          } else if (matched.length > 0) {
            // 有匹配的智能体：使用实际可用的
            spec.agentIds = matched.map((a) => a.id);
            spec.primaryAgentId = matched[0].id;
            spec.agentMode = matched.length === 1 ? 'single' : mode;

            // 补充建议的智能体
            if (suggested.length > 0 && mode !== 'single') {
              const extra = suggested.slice(0, 2);
              spec.agentIds = [...spec.agentIds, ...extra.map((a) => a.id)];
              console.log(`[CockpitAgent] Auto-added suggested agents: ${extra.map((a) => a.id).join(', ')}`);
            }
          } else if (suggested.length > 0) {
            // 没有模板匹配的，用领域推荐的
            spec.agentIds = suggested.slice(0, 2).map((a) => a.id);
            spec.primaryAgentId = spec.agentIds[0];
            spec.agentMode = suggested.length === 1 ? 'single' : mode;
          }

          // 如果有不可用的，在描述中提示
          if (unavailable.length > 0) {
            console.warn(`[CockpitAgent] Template agents unavailable: ${unavailable.join(', ')}`);
          }
        } catch (err: any) {
          console.warn('[CockpitAgent] Agent adaptation failed:', err.message);
        }
      }

      // ── 外部平台增强：优先调用 OpenClaw/YonClaw 的 planCockpit ──
      const planConnectors = this.connectionManager.getAllConnectorsByCapability('cockpit-plan');
      const planConnector = planConnectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw') || planConnectors[0];
      if (planConnector && planConnector.planCockpit) {
        try {
          console.log(`[CockpitAgent] Routing cockpit-plan to external connector: ${planConnector.connectionId}`);
          const planResult = await planConnector.planCockpit({
            goal: spec.name,
            constraints: [spec.description || ''],
          });
          if (planResult && typeof planResult === 'object') {
            // 合并外部规划结果到本地 spec
            if ((planResult as any).name) spec.name = (planResult as any).name;
            if ((planResult as any).description) spec.description = (planResult as any).description;
            if ((planResult as any).widgets) spec.widgets = (planResult as any).widgets;
            if ((planResult as any).agents) spec.agentIds = (planResult as any).agents;
            console.log(`[CockpitAgent] External plan merged: ${JSON.stringify(planResult).slice(0, 200)}`);
          }
        } catch (err: any) {
          console.warn('[CockpitAgent] External planCockpit failed:', err.message, '→ using local spec');
        }
      }

      // ── 外部平台创建：如果存在 cockpit-create 能力，路由到外部 ──
      const createConnectors = this.connectionManager.getAllConnectorsByCapability('cockpit-create');
      const createConnector = createConnectors.find(c => c.type === 'openclaw' || c.type === 'yonclaw') || createConnectors[0];
      if (createConnector && createConnector.createCockpit) {
        try {
          console.log(`[CockpitAgent] Routing cockpit-create to external connector: ${createConnector.connectionId}`);
          const externalResult = await createConnector.createCockpit(spec);
          console.log(`[CockpitAgent] External createCockpit result:`, externalResult);
          // 外部创建成功，也同步到本地存储
        } catch (err: any) {
          console.warn('[CockpitAgent] External createCockpit failed:', err.message, '→ falling back to local');
        }
      }

      if (context.sessionId) this.sessionCache.delete(context.sessionId);
      const ws = await workspaceStore.createWorkspace(spec);
      eventBus.publish({
        id: `evt-${Date.now()}`,
        source: 'cockpit-agent',
        sourceType: 'yonclaw',
        type: 'workspace.created',
        payload: { workspaceId: ws.id, name: ws.name },
        timestamp: new Date().toISOString(),
      });
      return ws;
    }

    let connector = task.targetConnection
      ? this.connectionManager.getConnector(task.targetConnection)
      : this.connectionManager.getConnectorByCapability(task.capability);

    // agent-invoke 降级：如果没有 agent-invoke 连接，尝试用 LLM 代理
    if (!connector && task.capability === 'agent-invoke') {
      connector = this.getLLMConnector() || undefined;
    }

    if (!connector) {
      throw new Error(`未找到支持能力「${task.capability}」的连接`);
    }

    switch (task.capability) {
      case 'llm-chat': {
        const msg = (task.params.message as string) || (task.params.input as string) || '';
        const messages: ChatMessage[] = [
          { role: 'system', content: '你是一个智能驾驶舱助手。' },
          { role: 'user', content: msg },
        ];
        if (!connector.chat) throw new Error('连接器不支持 chat');
        return connector.chat(messages);
      }

      case 'agent-list': {
        if (!connector.listAgents) throw new Error('连接器不支持 agent-list');
        return connector.listAgents();
      }

      case 'agent-invoke': {
        try {
          if (!connector.invokeAgent) throw new Error('连接器不支持 agent-invoke');
          return await connector.invokeAgent({
            agentId: (task.params.agentId as string) || 'default',
            command: (task.params.command as string) || '',
            context: task.params,
          });
        } catch (err: any) {
          // 降级到 llm-chat：agent-invoke 失败后，尝试用 LLM 代理
          const llm = this.getLLMConnector();
          if (llm && llm.chat) {
            console.log(`[CockpitAgent] agent-invoke failed (${err.message}), fallback to LLM`);
            const cmd = (task.params.command as string) || '';
            const messages: ChatMessage[] = [
              { role: 'system', content: '你是一个数据查询代理。根据用户请求返回简洁的结果。' },
              { role: 'user', content: cmd },
            ];
            return llm.chat(messages, { temperature: 0.3, maxTokens: 1024 });
          }
          throw err;
        }
      }

      case 'cockpit-plan': {
        if (!connector.planCockpit) throw new Error('连接器不支持 cockpit-plan');
        const planResult = await connector.planCockpit({
          goal: (task.params.goal as string) || context.workspaceId || '',
          constraints: (task.params.constraints as string[]) || [],
          context: task.params,
        });
        // 缓存 planning 结果中的 cockpitSpec，供后续 create 使用
        if (planResult.cockpitSpec && context.sessionId) {
          this.sessionCache.set(context.sessionId, planResult.cockpitSpec);
        }
        return planResult;
      }

      case 'cockpit-execute': {
        if (!connector.executeOnCockpit) throw new Error('连接器不支持 cockpit-execute');
        return connector.executeOnCockpit(
          (task.params.workspaceId as string) || context.workspaceId || '',
          (task.params.command as string) || '',
          task.params
        );
      }

      default:
        throw new Error(`未识别的能力「${task.capability}」— 请检查 LLM 返回的任务格式是否正确`);
    }
  }

  // ── 结果聚合 ──

  private async aggregateResponse(
    plan: TaskPlan,
    results: SubTaskResult[],
    context: ExecutionContext,
    llmConnector?: Connector
  ): Promise<Pick<CockpitAgentResponse, 'message' | 'card' | 'suggestedCommands'>> {
    // 所有任务成功
    const allSuccess = results.every((r) => r.success);
    const successResults = results.filter((r) => r.success);

    // 先通过规则聚合获取 card（LLM 聚合可能丢失结构化数据）
    const ruleResult = this.aggregateByRule(plan, results);

    // 尝试用 LLM 生成优美的聚合回复
    if (llmConnector && llmConnector.chat && allSuccess && successResults.length > 0) {
      try {
        const prompt = this.buildAggregationPrompt(plan, results, context);
        const messages: ChatMessage[] = [
          { role: 'system', content: '你是一个结果汇总助手。将执行结果整理成简洁友好的回复。' },
          { role: 'user', content: prompt },
        ];
        const summary = await llmConnector.chat(messages, { temperature: 0.5, maxTokens: 800 });
        return {
          message: summary,
          card: ruleResult.card,        // 保留规则聚合生成的 card
          suggestedCommands: this.suggestCommands(plan.intent.type),
        };
      } catch {
        // fallback 到规则聚合
      }
    }

    // 规则聚合（fallback）
    return ruleResult;
  }

  private buildAggregationPrompt(
    plan: TaskPlan,
    results: SubTaskResult[],
    context: ExecutionContext
  ): string {
    const lines: string[] = [
      `用户指令：${plan.intent.raw}`,
      `意图：${plan.intent.type}`,
      `驾驶舱ID：${context.workspaceId || '无'}`,
      '',
      '执行结果：',
    ];

    for (const result of results) {
      const task = plan.tasks.find((t) => t.id === result.taskId);
      lines.push(`- ${task?.description || result.taskId}: ${result.success ? '成功' : '失败'}`);
      if (result.data) lines.push(`  数据：${JSON.stringify(result.data).slice(0, 500)}`);
      if (result.error) lines.push(`  错误：${result.error}`);
    }

    lines.push('', '请用 2-3 句话总结结果，面向用户。');
    return lines.join('\n');
  }

  private aggregateByRule(
    plan: TaskPlan,
    results: SubTaskResult[]
  ): Pick<CockpitAgentResponse, 'message' | 'card' | 'suggestedCommands'> {
    const successCount = results.filter((r) => r.success).length;
    const totalCount = results.length;

    // 收集各任务数据用于生成 card
    let cardData: any = null;
    for (const result of results) {
      if (result.success && result.data) {
        const task = plan.tasks.find((t) => t.id === result.taskId);
        if (task?.capability === 'agent-list' && Array.isArray(result.data)) {
          cardData = {
            type: 'table',
            title: '智能体列表',
            columns: [{ key: 'name', label: '名称' }, { key: 'status', label: '状态' }],
            rows: result.data.map((a: any) => ({ name: a.name || '-', status: a.status || '-' })),
          };
        } else if (task?.capability === 'cockpit-plan') {
          const data = result.data as any;
          // 如果有 cockpitSpec，展示完整配置预览
          if (data?.cockpitSpec) {
            const spec = data.cockpitSpec;
            cardData = {
              type: 'data',
              title: spec.name || '驾驶舱规划方案',
              subtitle: spec.description || '',
              metric: { value: String(spec.widgets?.length || 0), label: '组件数' },
              data: {
                icon: spec.icon,
                color: spec.color,
                widgets: spec.widgets?.map((w: any) => w.title).join('、') || '',
                agents: spec.agentIds?.join('、') || '',
              },
            };
          } else {
            cardData = {
              type: 'workflow',
              title: '驾驶舱规划',
              steps: data?.plan?.steps?.map((s: any, i: number) => ({
                id: s.id,
                label: s.description,
                status: i === 0 ? 'active' : 'pending',
              })) || [],
            };
          }
        } else if (task?.capability === 'cockpit-create' && result.success) {
          const ws = result.data as any;
          cardData = {
            type: 'data',
            title: ws?.name || '驾驶舱创建成功',
            subtitle: '已添加到驾驶舱列表',
            metric: { value: String(ws?.widgets?.length || 0), label: '组件数' },
          };
        }
      }
    }

    // 根据意图类型生成消息
    let message = '';
    switch (plan.intent.type) {
      case 'plan_cockpit':
        message = `已为您规划驾驶舱方案，共 ${totalCount} 个步骤，${successCount} 个成功执行。`;
        break;
      case 'create_cockpit': {
        if (successCount === totalCount) {
          message = '驾驶舱创建成功！您可以继续配置或查看详情。';
        } else {
          const firstFail = results.find((r) => !r.success);
          message = `驾驶舱创建失败（${successCount}/${totalCount}）` + (firstFail?.error ? `：${firstFail.error}` : '');
        }
        break;
      }
      case 'execute_command':
        message = successCount === totalCount
          ? '命令执行成功。'
          : `命令执行遇到问题（${totalCount - successCount} 个失败）。`;
        break;
      case 'query_data':
        message = successCount > 0 ? '查询结果如下：' : '查询失败，请稍后重试。';
        break;
      case 'list_agents':
        message = successCount > 0 ? '当前可用智能体：' : '无法获取智能体列表。';
        break;
      default:
        message = successCount === totalCount
          ? '任务执行完毕。'
          : `部分任务未成功（${totalCount - successCount} 个失败）。`;
    }

    return {
      message,
      card: cardData,
      suggestedCommands: this.suggestCommands(plan.intent.type),
    };
  }

  private suggestCommands(intentType: string): string[] {
    const suggestions: Record<string, string[]> = {
      plan_cockpit: ['确认创建', '调整方案', '查看详情'],
      create_cockpit: ['查看驾驶舱', '添加组件', '配置数据源'],
      execute_command: ['查看结果', '撤销操作', '继续执行'],
      query_data: ['刷新数据', '导出报表', '分析趋势'],
      list_agents: ['调用智能体', '查看详情', '刷新列表'],
      chat: ['继续对话', '查看帮助', '执行任务'],
    };
    return suggestions[intentType] || ['继续对话'];
  }
}

// ── 辅助 ──

function intentLabel(type: string): string {
  const labels: Record<string, string> = {
    plan_cockpit: '规划驾驶舱',
    create_cockpit: '创建驾驶舱',
    execute_command: '执行命令',
    query_data: '查询数据',
    list_agents: '列出智能体',
    chat: '通用对话',
  };
  return labels[type] || type;
}

// 全局单例（由 index.ts 初始化）
export let cockpitAgent: CockpitAgent | null = null;

export function initCockpitAgent(cm: ConnectionManager): CockpitAgent {
  cockpitAgent = new CockpitAgent(cm);
  return cockpitAgent;
}
