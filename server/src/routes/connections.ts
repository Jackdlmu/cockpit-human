// ─── /api/connections 路由 ───
// 连接管理 CRUD + 测试 + 连接/断开

import { Router } from 'express';
import { connectionManager } from '../connection/manager';
import type { CreateConnectionInput, UpdateConnectionInput } from '../connection/types';

const router = Router();

// GET /api/connections → 列出所有连接
router.get('/', async (_req, res, next) => {
  try {
    const connections = await connectionManager.list();
    res.json({ connections });
  } catch (err) {
    next(err);
  }
});

// POST /api/connections → 创建连接
router.post('/', async (req, res, next) => {
  try {
    const input = req.body as CreateConnectionInput;
    if (!input.name || !input.type || !input.config?.endpoint) {
      res.status(400).json({ error: 'name, type, config.endpoint are required' });
      return;
    }
    const connection = await connectionManager.create(input);
    res.status(201).json({ connection });
  } catch (err) {
    next(err);
  }
});

// GET /api/connections/:id → 获取单个连接
router.get('/:id', async (req, res, next) => {
  try {
    const connection = await connectionManager.get(req.params.id);
    if (!connection) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json({ connection });
  } catch (err) {
    next(err);
  }
});

// PUT /api/connections/:id → 更新连接
router.put('/:id', async (req, res, next) => {
  try {
    const input = req.body as UpdateConnectionInput;
    const connection = await connectionManager.update(req.params.id, input);
    if (!connection) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json({ connection });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/connections/:id → 删除连接
router.delete('/:id', async (req, res, next) => {
  try {
    const success = await connectionManager.remove(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/connections/test → 测试连接配置（不创建持久化连接）
router.post('/test', async (req, res, next) => {
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
router.post('/:id/test', async (req, res, next) => {
  try {
    const result = await connectionManager.test(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/connections/:id/connect → 手动连接
router.post('/:id/connect', async (req, res, next) => {
  try {
    await connectionManager.connect(req.params.id);
    const connection = await connectionManager.get(req.params.id);
    res.json({ success: true, connection });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/connections/:id/disconnect → 手动断开
router.post('/:id/disconnect', async (req, res, next) => {
  try {
    await connectionManager.disconnect(req.params.id);
    const connection = await connectionManager.get(req.params.id);
    res.json({ success: true, connection });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── 代理路由：前端通过后端访问外部平台（避免 CORS）──

// GET /api/connections/:id/proxy/* → 代理 GET 请求
// POST /api/connections/:id/proxy/* → 代理 POST 请求
router.use('/:id/proxy', async (req: any, res: any, next: any) => {
  try {
    const connId = req.params.id;
    const conn = await connectionManager.get(connId);
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }

    const endpoint = (conn.config as any).endpoint || '';
    const cleanEndpoint = endpoint.replace(/\/$/, '').replace(/wss:\/\//, 'https://').replace(/ws:\/\//, 'http://');
    // 提取 proxy 后面的路径
    const proxyPath = req.path.replace(/^\//, '') || '';
    const proxyUrl = `${cleanEndpoint}/${proxyPath}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;

    const token = (conn.config as any).apiKey || (conn.config as any).token || '';
    const headers: Record<string, string> = {
      'Content-Type': req.headers['content-type'] as string || 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    console.log(`[Proxy] ${req.method} ${proxyUrl}`);

    const proxyRes = await fetch(proxyUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    });

    const contentType = proxyRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await proxyRes.json();
      res.status(proxyRes.status).json(data);
    } else {
      const text = await proxyRes.text();
      res.status(proxyRes.status).set('Content-Type', contentType).send(text);
    }
  } catch (err: any) {
    console.error('[Proxy] Error:', err.message);
    res.status(502).json({ error: 'Proxy failed', detail: err.message });
  }
});

export default router;
