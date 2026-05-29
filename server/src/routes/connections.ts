// ─── /api/connections 路由 ───
// 连接管理 CRUD + 测试 + 连接/断开

import { Router } from 'express';
import { connectionManager } from '../connection/manager';
import type { CreateConnectionInput, UpdateConnectionInput } from '../connection/types';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// GET /api/connections → 列出所有连接
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const connections = await connectionManager.list();
    res.json({ connections });
  } catch (err) {
    next(err);
  }
});

// POST /api/connections → 创建连接
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = req.body as CreateConnectionInput;
    if (!input.name || !input.type || !input.config?.endpoint) {
      res.status(400).json({ error: 'name, type, config.endpoint are required', code: 'VALIDATION_ERROR', status: 400 });
      return;
    }
    const connection = await connectionManager.create(input);
    res.status(201).json({ connection });
  } catch (err) {
    next(err);
  }
});

// GET /api/connections/:id → 获取单个连接
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const connection = await connectionManager.get(req.params.id);
    if (!connection) {
      res.status(404).json({ error: 'Connection not found', code: 'NOT_FOUND', status: 404 });
      return;
    }
    res.json({ connection });
  } catch (err) {
    next(err);
  }
});

// PUT /api/connections/:id → 更新连接
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = req.body as UpdateConnectionInput;
    const connection = await connectionManager.update(req.params.id, input);
    if (!connection) {
      res.status(404).json({ error: 'Connection not found', code: 'NOT_FOUND', status: 404 });
      return;
    }
    res.json({ connection });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/connections/:id → 删除连接
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await connectionManager.remove(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Connection not found', code: 'NOT_FOUND', status: 404 });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/connections/test → 测试连接配置（不创建持久化连接）
router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, config } = req.body;
    if (!type || !config?.endpoint) {
      res.status(400).json({ success: false, message: 'type and config.endpoint are required' });
      return;
    }
    const result = await connectionManager.testConfig(type, config);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/connections/:id/test → 测试已有连接（不修改状态）
router.post('/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await connectionManager.test(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/connections/:id/connect → 手动连接
router.post('/:id/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectionManager.connect(req.params.id);
    const connection = await connectionManager.get(req.params.id);
    res.json({ success: true, connection });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg, code: 'CONNECTION_ERROR', status: 400 });
  }
});

// POST /api/connections/:id/disconnect → 手动断开
router.post('/:id/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectionManager.disconnect(req.params.id);
    const connection = await connectionManager.get(req.params.id);
    res.json({ success: true, connection });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: msg, code: 'CONNECTION_ERROR', status: 400 });
  }
});

export default router;
