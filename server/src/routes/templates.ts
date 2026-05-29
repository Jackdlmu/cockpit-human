// ─── /api/templates ───
// 驾驶舱模板管理 API（系统模板只读 + 自定义模板 CRUD）

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as templateStore from '../services/template-store';
import { loadCustomTemplates, getTemplate, personalizeTemplate, listTemplates } from '../agent/templates/registry';
import { eventBus } from '../services/event-bus';
import * as workspaceStore from '../data/workspaceStore';
import { connectionManager } from '../connection/manager';
import type { ChatMessage, Widget } from '../types';

// TODO: 管理员认证未来专题处理，当前放行
function adminGuard(_req: Request, _res: Response, next: NextFunction) {
  next();
}

const router = Router();

// 公开读取：返回所有模板（系统 + 自定义），系统模板带 isBuiltin 标记
router.get('/', (_req: Request, res: Response) => {
  res.json({ templates: templateStore.listAllTemplates() });
});

router.get('/:id', (req: Request, res: Response) => {
  const t = templateStore.getTemplate(req.params.id);
  if (!t) {
    res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND', status: 404 });
    return;
  }
  res.json({ template: t });
});

// ── 辅助：从 LLM 返回的文本中提取 JSON ──
function extractJsonFromText(text: string): unknown {
  // 先尝试直接解析
  try {
    return JSON.parse(text.trim());
  } catch { /* ignore */ }

  // 去除 markdown 代码块
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch { /* ignore */ }

  // 尝试提取第一个 { ... } 或 [ ... ]
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch { /* ignore */ }
  }

  return null;
}

// ── 辅助：通过 LLM 为模板创建的驾驶舱生成初始数据 ──
async function initializeWorkspaceWithLLM(
  workspaceId: string,
  workspaceName: string,
  templateName: string,
  initPrompt: string,
  widgets: Widget[]
): Promise<void> {
  console.log(`[TemplateCreate] Starting LLM init for workspace=${workspaceId}, widgets=${widgets.length}`);
  const llmConnector = connectionManager.getConnectorByCapability('llm-chat');
  console.log(`[TemplateCreate] LLM connector lookup result: ${llmConnector ? llmConnector.type + '/' + llmConnector.connectionId : 'null'}`);
  if (!llmConnector || !llmConnector.chat) {
    console.warn(`[TemplateCreate] No llm-chat connector available, skipping LLM init for ${workspaceId}`);
    return;
  }

  // 构建组件描述
  const widgetDesc = widgets
    .map((w) => `- [${w.type}] ${w.title} (id: ${w.id})`)
    .join('\n');

  const systemPrompt = `你是一个企业数据分析助手。请根据驾驶舱信息，为每个组件生成合理的初始示例数据。`;

  const userPrompt = `驾驶舱名称: ${workspaceName}
模板来源: ${templateName}
初始化要求: ${initPrompt}

驾驶舱包含以下组件:
${widgetDesc}

请为每个组件生成示例数据，直接输出 JSON 对象（不要 markdown 代码块），格式如下:
{
  "widgets": [
    { "id": "widget-id", "data": { ... } }
  ]
}

各组件类型的 data 格式参考:
- metric: { value: string, change: string, trend: "up"|"down"|"flat" }
- chart: { labels: string[], values: number[] }
- table: { rows: any[] }
- list: { items: any[] }
- kanban: { stages: string[] }
- timeline: { steps: string[] }
- report: { summary: string, highlights: [{label:string,value:string}] }
- progress: { value: number, max: number, label: string }
- status: { items: [{ label: string, status: "green"|"yellow"|"red", value: string }] }
- gauge: { value: number, min: number, max: number, unit: string, thresholds?: [{value:number,color:string}] }
- funnel: { stages: [{ name: string, value: number, rate: number }] }
- radar: { labels: string[], values: number[] }
- heatmap: { rows: [{ x: string, y: string, value: number }] }
- bullet: { value: number, target: number, max: number, label: string }
- alert: { alerts: [{ level: "warning"|"critical"|"info"|"success", message: string, time: string }] }
- map: { points: [{ name: string, value: number }] }
- universal: 根据组件标题自由发挥

要求:
1. 数据必须与驾驶舱主题高度相关
2. 数值合理，看起来真实
3. 直接输出纯 JSON，不要任何 markdown 格式或其他文字`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  console.log(`[TemplateCreate] Calling LLM for workspace init: ${workspaceId}`);
  const raw = await llmConnector.chat(messages, { temperature: 0.5, maxTokens: 2048 });
  console.log(`[TemplateCreate] LLM raw response for ${workspaceId}:`, raw.slice(0, 500));

  const parsed = extractJsonFromText(raw) as { widgets?: Array<{ id: string; data: Record<string, unknown> }> } | null;
  if (!parsed || !Array.isArray(parsed.widgets)) {
    console.warn(`[TemplateCreate] LLM response parse failed or no widgets array for ${workspaceId}`);
    return;
  }

  // 按 id 映射 LLM 生成的 data
  const dataMap = new Map<string, Record<string, unknown>>();
  for (const item of parsed.widgets) {
    if (item.id && typeof item.data === 'object') {
      dataMap.set(item.id, item.data);
    }
  }

  // 更新 workspace widgets
  const updatedWidgets = widgets.map((w) => {
    const generated = dataMap.get(w.id);
    if (generated) {
      return { ...w, data: generated };
    }
    return w;
  });

  await workspaceStore.updateWorkspace(workspaceId, { widgets: updatedWidgets as Widget[] });
  console.log(`[TemplateCreate] Workspace ${workspaceId} initialized with LLM data, ${dataMap.size} widgets updated`);
}

// 从模板一键创建驾驶舱
router.post('/:id/create-cockpit', async (req: Request, res: Response) => {
  console.log(`[TemplateCreate] Request: id=${req.params.id}, body=`, req.body);
  try {
    const template = getTemplate(req.params.id);
    console.log(`[TemplateCreate] getTemplate result:`, template ? template.id : null, 'registry size:', listTemplates().length);
    if (!template) {
      res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND', status: 404 });
      return;
    }

    const name = (req.body.name as string) || template.name;
    const customInitPrompt = req.body.initPrompt as string | undefined;
    const spec = personalizeTemplate(template, {
      name,
      rawCommand: `从模板 ${template.name} 创建驾驶舱`,
      entities: {},
      domain: template.domain,
    });

    let ws = await workspaceStore.createWorkspace(spec);

    // ── 环境适配：如果没有真实的外部智能体连接，清空模板预设的 agent 关联 ──
    // 当前演示环境（mock 模式）下，模板预设的 agentIds 会导致前端错误显示虚构的业务智能体
    const agentConnectors = connectionManager.getAllConnectorsByCapability('agent-invoke');
    const hasRealAgentConnection = agentConnectors.some((c) => c.type !== 'mock');
    if (!hasRealAgentConnection && (ws.agentIds?.length > 0 || ws.primaryAgentId)) {
      ws = await workspaceStore.updateWorkspace(ws.id, {
        agentIds: [],
        primaryAgentId: '',
        agentMode: 'llm-only',
      }) || ws;
    }

    // 发布创建事件
    eventBus.publish({
      id: `evt-${Date.now()}`,
      source: 'api',
      sourceType: 'yonclaw',
      type: 'workspace.created',
      payload: { workspaceId: ws.id, name: ws.name },
      timestamp: new Date().toISOString(),
    });

    // 如果模板有 initPrompt（或用户提供了自定义initPrompt），后台异步调用 LLM 生成初始数据
    const initPromptToUse = customInitPrompt || template.initPrompt;
    console.log(`[TemplateCreate] initPromptToUse=${initPromptToUse ? 'present (' + initPromptToUse.slice(0, 50) + '...)' : 'none'}`);
    let initializing = false;
    if (initPromptToUse) {
      initializing = true;
      eventBus.publish({
        id: `evt-${Date.now()}`,
        source: 'cockpit-agent',
        sourceType: 'yonclaw',
        type: 'workspace.initializing',
        payload: { workspaceId: ws.id, name: ws.name },
        timestamp: new Date().toISOString(),
      });

      // 异步执行 LLM 初始化，不阻塞响应
      initializeWorkspaceWithLLM(ws.id, ws.name, template.name, initPromptToUse, ws.widgets)
        .then(() => {
          eventBus.publish({
            id: `evt-${Date.now()}`,
            source: 'cockpit-agent',
            sourceType: 'yonclaw',
            type: 'workspace.initialized',
            payload: { workspaceId: ws.id, name: ws.name },
            timestamp: new Date().toISOString(),
          });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[TemplateCreate] LLM init failed for ${ws.id}:`, msg);
          eventBus.publish({
            id: `evt-${Date.now()}`,
            source: 'cockpit-agent',
            sourceType: 'yonclaw',
            type: 'workspace.init_failed',
            payload: { workspaceId: ws.id, name: ws.name, error: msg },
            timestamp: new Date().toISOString(),
          });
        });
    }

    res.status(201).json({ workspace: ws, initializing });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[TemplateCreate] Failed:', msg);
    if (msg.includes('上限')) {
      res.status(400).json({ error: msg, code: 'LIMIT_EXCEEDED', status: 400 });
      return;
    }
    res.status(500).json({ error: msg || 'Failed to create cockpit from template', code: 'INTERNAL_ERROR', status: 500 });
  }
});

// 以下需要管理员权限（支持系统模板编辑/删除）
router.post('/', adminGuard, (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = templateStore.createCustomTemplate(req.body);
    loadCustomTemplates();
    res.status(201).json({ template: t });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg, code: 'VALIDATION_ERROR', status: 400 });
  }
});

router.put('/:id', adminGuard, (req: Request, res: Response) => {
  const t = templateStore.updateTemplate(req.params.id, req.body);
  if (!t) {
    res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND', status: 404 });
    return;
  }
  loadCustomTemplates();
  res.json({ template: t });
});

router.delete('/:id', adminGuard, (req: Request, res: Response) => {
  const target = templateStore.getTemplate(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND', status: 404 });
    return;
  }
  let ok: boolean;
  if (target.isBuiltin) {
    ok = templateStore.deleteBuiltinTemplate(req.params.id);
  } else {
    ok = templateStore.deleteCustomTemplate(req.params.id);
  }
  if (!ok) {
    res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND', status: 404 });
    return;
  }
  loadCustomTemplates();
  res.json({ success: true });
});

export default router;
