import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  createWidgetDef,
  deleteWidgetDef,
  getWidgetDef,
  listAllWidgetDefs,
  updateWidgetDef,
} from '../services/widget-catalog-store';
import { requireAdmin, resolveRequestActor } from '../security/admin-auth';
import { recordAuditEvent } from '../services/audit-log';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ widgets: listAllWidgetDefs() });
});

router.get('/:id', (req, res) => {
  const widget = getWidgetDef(req.params.id);
  if (!widget) {
    res.status(404).json({ error: 'Widget not found', code: 'NOT_FOUND', status: 404 });
    return;
  }
  res.json({ widget });
});

router.post('/', requireAdmin, (req, res) => {
  try {
    const widget = createWidgetDef(req.body);
    recordAuditEvent({
      actor: resolveRequestActor(req),
      source: 'api.widget-catalog',
      action: 'widget.create',
      targetType: 'widget',
      targetId: widget.id,
      status: 'success',
      details: { name: widget.name },
    });
    res.status(201).json({ widget });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg, code: 'VALIDATION_ERROR', status: 400 });
  }
});

router.put('/:id', requireAdmin, (req, res) => {
  try {
    const widget = updateWidgetDef(req.params.id, req.body);
    if (!widget) {
      res.status(404).json({ error: 'Widget not found', code: 'NOT_FOUND', status: 404 });
      return;
    }
    recordAuditEvent({
      actor: resolveRequestActor(req),
      source: 'api.widget-catalog',
      action: 'widget.update',
      targetType: 'widget',
      targetId: widget.id,
      status: 'success',
      details: { name: widget.name },
    });
    res.json({ widget });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg, code: 'VALIDATION_ERROR', status: 400 });
  }
});

router.delete('/:id', requireAdmin, (req, res) => {
  const ok = deleteWidgetDef(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Widget not found', code: 'NOT_FOUND', status: 404 });
    return;
  }
  recordAuditEvent({
    actor: resolveRequestActor(req),
    source: 'api.widget-catalog',
    action: 'widget.delete',
    targetType: 'widget',
    targetId: req.params.id,
    status: 'success',
  });
  res.json({ success: true });
});

export default router;
