// ─── /api/templates ───
// 驾驶舱模板管理 API（系统模板只读 + 自定义模板 CRUD）

import { Router } from 'express';
import * as templateStore from '../services/template-store';
import { loadCustomTemplates, getTemplate, personalizeTemplate, listTemplates } from '../agent/templates/registry';
import { eventBus } from '../services/event-bus';
import * as workspaceStore from '../data/workspaceStore';
import { cockpitAgent } from '../agent/cockpit-agent';

const ADMIN_KEY = process.env.ADMIN_KEY || 'yoncockpit-admin';

function adminGuard(req: any, res: any, next: any) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) {
    res.status(403).json({ error: 'Forbidden: invalid admin key' });
    return;
  }
  next();
}

const router = Router();

// 公开读取：返回所有模板（系统 + 自定义），系统模板带 isBuiltin 标记
router.get('/', (_req, res) => {
  res.json({ templates: templateStore.listAllTemplates() });
});

router.get('/:id', (req, res) => {
  const t = templateStore.getTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json({ template: t });
});

// 从模板一键创建驾驶舱
router.post('/:id/create-cockpit', async (req, res) => {
  console.log(`[TemplateCreate] Request: id=${req.params.id}, body=`, req.body);
  try {
    const template = getTemplate(req.params.id);
    console.log(`[TemplateCreate] getTemplate result:`, template ? template.id : null, 'registry size:', listTemplates().length);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const name = (req.body.name as string) || template.name;
    const customInitPrompt = req.body.initPrompt as string | undefined;
    const spec = personalizeTemplate(template, {
      name,
      rawCommand: `从模板 ${template.name} 创建驾驶舱`,
      entities: {},
      domain: template.domain,
    });

    const ws = await workspaceStore.createWorkspace(spec);

    // 如果模板有 initPrompt（或用户提供了自定义initPrompt），后台异步执行初始化
    const initPromptToUse = customInitPrompt || template.initPrompt;
    let initializing = false;
    if (initPromptToUse && cockpitAgent) {
      initializing = true;
      eventBus.publish({
        id: `evt-${Date.now()}`,
        source: 'cockpit-agent',
        sourceType: 'yonclaw',
        type: 'workspace.initializing',
        payload: { workspaceId: ws.id, name: ws.name },
        timestamp: new Date().toISOString(),
      });

      // 异步执行，不阻塞响应
      cockpitAgent
        .handleCommand(initPromptToUse, { workspaceId: ws.id })
        .then((result) => {
          eventBus.publish({
            id: `evt-${Date.now()}`,
            source: 'cockpit-agent',
            sourceType: 'yonclaw',
            type: 'workspace.initialized',
            payload: { workspaceId: ws.id, name: ws.name, result },
            timestamp: new Date().toISOString(),
          });
        })
        .catch((err: any) => {
          console.error(`[TemplateCreate] Init prompt failed for ${ws.id}:`, err);
          eventBus.publish({
            id: `evt-${Date.now()}`,
            source: 'cockpit-agent',
            sourceType: 'yonclaw',
            type: 'workspace.init_failed',
            payload: { workspaceId: ws.id, name: ws.name, error: err?.message || String(err) },
            timestamp: new Date().toISOString(),
          });
        });
    }

    res.status(201).json({ workspace: ws, initializing });
  } catch (err: any) {
    console.error('[TemplateCreate] Failed:', err);
    if (err.message?.includes('上限')) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message || 'Failed to create cockpit from template' });
  }
});

// 以下需要管理员权限（支持系统模板编辑/删除）
router.post('/', adminGuard, (req, res, next) => {
  try {
    const t = templateStore.createCustomTemplate(req.body);
    loadCustomTemplates();
    res.status(201).json({ template: t });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', adminGuard, (req, res) => {
  const t = templateStore.updateTemplate(req.params.id, req.body);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  loadCustomTemplates();
  res.json({ template: t });
});

router.delete('/:id', adminGuard, (req, res) => {
  const target = templateStore.getTemplate(req.params.id);
  if (!target) return res.status(404).json({ error: 'Template not found' });
  let ok: boolean;
  if (target.isBuiltin) {
    ok = templateStore.deleteBuiltinTemplate(req.params.id);
  } else {
    ok = templateStore.deleteCustomTemplate(req.params.id);
  }
  if (!ok) return res.status(404).json({ error: 'Template not found' });
  loadCustomTemplates();
  res.json({ success: true });
});

export default router;
