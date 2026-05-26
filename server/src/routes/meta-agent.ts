// ─── /api/meta-agent 路由 ───
// 对外暴露 Meta-Agent 接口，兼容 OpenClaw / YonClaw Agent Protocol

import { Router } from 'express';
import { metaAgent } from '../services/meta-agent';

const router = Router();

// GET /api/meta-agent → Agent 元信息
router.get('/', (_req, res, next) => {
  try {
    if (!metaAgent) {
      res.status(503).json({ error: 'MetaAgent not initialized' });
      return;
    }
    res.json(metaAgent.getMeta());
  } catch (err) {
    next(err);
  }
});

// GET /api/meta-agent/tools → 工具定义列表
router.get('/tools', (_req, res, next) => {
  try {
    if (!metaAgent) {
      res.status(503).json({ error: 'MetaAgent not initialized' });
      return;
    }
    res.json({ tools: metaAgent.getTools() });
  } catch (err) {
    next(err);
  }
});

// GET /api/meta-agent/tools/:name → 单个工具定义
router.get('/tools/:name', (req, res, next) => {
  try {
    if (!metaAgent) {
      res.status(503).json({ error: 'MetaAgent not initialized' });
      return;
    }
    const tool = metaAgent.getTool(req.params.name);
    if (!tool) {
      res.status(404).json({ error: 'Tool not found' });
      return;
    }
    res.json(tool);
  } catch (err) {
    next(err);
  }
});

// POST /api/meta-agent/invoke → 智能体调用（标准 Agent Protocol）
router.post('/invoke', async (req, res, next) => {
  try {
    if (!metaAgent) {
      res.status(503).json({ error: 'MetaAgent not initialized' });
      return;
    }
    const { command, context, sessionId, workspaceId, tools } = req.body;
    if (!command) {
      res.status(400).json({ error: 'command is required' });
      return;
    }

    const result = await metaAgent.handleInvoke({
      command,
      context,
      sessionId,
      workspaceId,
      tools,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/meta-agent/tools/:name → 执行工具
router.post('/tools/:name', async (req, res, next) => {
  try {
    if (!metaAgent) {
      res.status(503).json({ error: 'MetaAgent not initialized' });
      return;
    }

    const result = await metaAgent.invokeTool({
      tool: req.params.name,
      parameters: req.body.parameters || {},
      sessionId: req.body.sessionId,
      workspaceId: req.body.workspaceId,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/meta-agent/register/openclaw → 注册到 OpenClaw
router.post('/register/openclaw', async (req, res, next) => {
  try {
    if (!metaAgent) {
      res.status(503).json({ error: 'MetaAgent not initialized' });
      return;
    }
    const { connectionId } = req.body;
    if (!connectionId) {
      res.status(400).json({ error: 'connectionId is required' });
      return;
    }
    const result = await metaAgent.registerToOpenClaw(connectionId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/meta-agent/register/yonclaw → 注册到 YonClaw
router.post('/register/yonclaw', async (req, res, next) => {
  try {
    if (!metaAgent) {
      res.status(503).json({ error: 'MetaAgent not initialized' });
      return;
    }
    const { connectionId } = req.body;
    if (!connectionId) {
      res.status(400).json({ error: 'connectionId is required' });
      return;
    }
    const result = await metaAgent.registerToYonClaw(connectionId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
