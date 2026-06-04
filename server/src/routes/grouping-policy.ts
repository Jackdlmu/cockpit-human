// ─── /api/grouping-policy ───
// 全局分组策略配置 API（公开读取，管理员可修改）

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getGroupingPolicy, setGroupingPolicy, resetGroupingPolicy } from '../services/grouping-policy';
import { requireAdmin, resolveRequestActor } from '../security/admin-auth';
import { recordAuditEvent } from '../services/audit-log';

const router = Router();

// 公开读取
router.get('/', (_req: Request, res: Response) => {
  res.json({ policy: getGroupingPolicy() });
});

// 管理员更新
router.put('/', requireAdmin, (req: Request, res: Response) => {
  const body = req.body as Partial<{ enabled: boolean; strategy: string; manualGroups: string[]; reset: boolean }>;

  if (body.reset) {
    const policy = resetGroupingPolicy();
    recordAuditEvent({
      actor: resolveRequestActor(req),
      source: 'api.grouping-policy',
      action: 'grouping-policy.reset',
      targetType: 'system',
      targetId: 'grouping-policy',
      status: 'success',
      details: { policy },
    });
    res.json({ policy });
    return;
  }

  const update: Partial<{ enabled: boolean; strategy: 'auto' | 'manual'; manualGroups: string[] }> = {};
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
  if (body.strategy === 'auto' || body.strategy === 'manual') update.strategy = body.strategy;
  if (Array.isArray(body.manualGroups)) update.manualGroups = body.manualGroups.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim());

  const policy = setGroupingPolicy(update);
  recordAuditEvent({
    actor: resolveRequestActor(req),
    source: 'api.grouping-policy',
    action: 'grouping-policy.update',
    targetType: 'system',
    targetId: 'grouping-policy',
    status: 'success',
    details: { update },
  });
  res.json({ policy });
});

export default router;
