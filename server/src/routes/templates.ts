// ─── /api/templates ───
// 驾驶舱模板管理 API（系统模板只读 + 自定义模板 CRUD）

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as templateStore from '../services/template-store';
import { loadCustomTemplates, getTemplate, listTemplates } from '../agent/templates/registry';
import { connectionManager } from '../connection/manager';
import { createWorkspaceWithLifecycle } from '../services/workspace-creation';
import { planWorkspaceCreation } from '../services/workspace-planner';
import { requireAdmin, resolveRequestActor } from '../security/admin-auth';
import { recordAuditEvent } from '../services/audit-log';

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
    const initPromptToUse = customInitPrompt?.trim() || template.initPrompt?.trim();
    const command = `创建驾驶舱「${name}」，目标参考模板「${template.name}」。${initPromptToUse || template.description}`;
    const spec = await planWorkspaceCreation(
      {
        command,
        name,
        initPrompt: initPromptToUse,
        preferredTemplateId: template.id,
      },
      connectionManager
    );

    console.log(`[TemplateCreate] initPromptToUse=${initPromptToUse ? 'present (' + initPromptToUse.slice(0, 50) + '...)' : 'none'}`);
    const creation = await createWorkspaceWithLifecycle(
      {
        ...spec,
        initPrompt: initPromptToUse,
        templateName: spec.templateName || template.name,
        useDemoDataFallback: template.useDemoDataFallback ?? spec.useDemoDataFallback ?? true,
      },
      {
        source: 'api',
        connectionManager,
        initSourceType: 'template',
        resetAgentsWithoutConnection: true,
      }
    );

    res.status(201).json({
      workspace: creation.workspace,
      initializing: creation.initializing,
      initializationMode: creation.initializationMode,
    });
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
router.post('/', requireAdmin, (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = templateStore.createCustomTemplate(req.body);
    loadCustomTemplates();
    recordAuditEvent({
      actor: resolveRequestActor(req),
      source: 'api.templates',
      action: 'template.create',
      targetType: 'template',
      targetId: t.id,
      status: 'success',
      details: { name: t.name },
    });
    res.status(201).json({ template: t });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    recordAuditEvent({
      actor: resolveRequestActor(req),
      source: 'api.templates',
      action: 'template.create',
      targetType: 'template',
      status: 'failure',
      details: { error: msg },
    });
    res.status(400).json({ error: msg, code: 'VALIDATION_ERROR', status: 400 });
  }
});

router.put('/:id', requireAdmin, (req: Request, res: Response) => {
  const t = templateStore.updateTemplate(req.params.id, req.body);
  if (!t) {
    res.status(404).json({ error: 'Template not found', code: 'NOT_FOUND', status: 404 });
    return;
  }
  loadCustomTemplates();
  recordAuditEvent({
    actor: resolveRequestActor(req),
    source: 'api.templates',
    action: 'template.update',
    targetType: 'template',
    targetId: t.id,
    status: 'success',
    details: { name: t.name },
  });
  res.json({ template: t });
});

router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
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
  recordAuditEvent({
    actor: resolveRequestActor(req),
    source: 'api.templates',
    action: 'template.delete',
    targetType: 'template',
    targetId: req.params.id,
    status: 'success',
    details: { builtin: Boolean(target.isBuiltin), name: target.name },
  });
  res.json({ success: true });
});

export default router;
