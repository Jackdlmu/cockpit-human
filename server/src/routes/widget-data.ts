// ─── /api/workspaces/:id/widgets/:widgetId/data ───
// Phase 4: Widget 数据管道 API

import { Router } from 'express';
import * as workspaceStore from '../data/workspaceStore';
import { resolveWidgetData } from '../services/widget-data';
import type { ConnectionManager } from '../connection/manager';

export function createWidgetDataRouter(connectionManager: ConnectionManager) {
  const router = Router({ mergeParams: true });

  /**
   * POST /api/workspaces/:id/widgets/:widgetId/data
   * 触发 widget 数据刷新（从数据源拉取最新数据）
   */
  router.post('/:widgetId/data', async (req: any, res, next) => {
    try {
      const workspace = await workspaceStore.getWorkspace(req.params.id);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      const widget = workspace.widgets?.find((w: any) => w.id === req.params.widgetId);
      if (!widget) {
        res.status(404).json({ error: 'Widget not found' });
        return;
      }

      const result = await resolveWidgetData(
        req.params.id,
        widget,
        connectionManager,
        req.body?.context
      );

      res.json({
        data: result.data,
        source: result.source,
        latency: result.latency,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/workspaces/:id/widgets/:widgetId/data
   * 获取 widget 当前数据（不触发刷新，直接返回现有静态数据）
   */
  router.get('/:widgetId/data', async (req: any, res, next) => {
    try {
      const workspace = await workspaceStore.getWorkspace(req.params.id);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      const widget = workspace.widgets?.find((w: any) => w.id === req.params.widgetId);
      if (!widget) {
        res.status(404).json({ error: 'Widget not found' });
        return;
      }

      // GET 只返回静态数据，不触发外部调用
      res.json({
        data: widget.data ?? null,
        source: 'static',
        hasDataSource: !!widget.dataSource,
        dataSourceType: widget.dataSource?.type ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
