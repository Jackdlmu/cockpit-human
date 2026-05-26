// ─── /api/templates ───
// 自定义驾驶舱模板管理 API（管理员专用）

import { Router } from 'express';
import * as templateStore from '../services/template-store';
import { loadCustomTemplates } from '../agent/templates/registry';

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

// 公开读取（任何人可查看模板列表）
router.get('/', (_req, res) => {
  res.json({ templates: templateStore.listCustomTemplates() });
});

router.get('/:id', (req, res) => {
  const t = templateStore.getCustomTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json({ template: t });
});

// 以下需要管理员权限
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
  const t = templateStore.updateCustomTemplate(req.params.id, req.body);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  loadCustomTemplates();
  res.json({ template: t });
});

router.delete('/:id', adminGuard, (req, res) => {
  const ok = templateStore.deleteCustomTemplate(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Template not found' });
  loadCustomTemplates();
  res.json({ success: true });
});

export default router;
