import { Router } from 'express';
import * as workspaceStore from '../data/workspaceStore';
import { eventBus } from '../services/event-bus';

const router = Router();

router.get('/', async (req: any, res, next) => {
  try {
    const workspaces = await req.adapter.getWorkspaces();
    res.json({ workspaces });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: any, res, next) => {
  try {
    const workspace = await req.adapter.getWorkspace(req.params.id);
    res.json({ workspace });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, description, icon, color, agentIds, primaryAgentId, widgets } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const ws = await workspaceStore.createWorkspace({
      name,
      description,
      icon,
      color,
      agentIds,
      primaryAgentId,
      widgets,
    });
    eventBus.publish({
      id: `evt-${Date.now()}`,
      source: 'api',
      sourceType: 'yonclaw',
      type: 'workspace.created',
      payload: { workspaceId: ws.id, name: ws.name },
      timestamp: new Date().toISOString(),
    });
    res.status(201).json({ workspace: ws });
  } catch (err: any) {
    if (err.message?.includes('上限')) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const success = await workspaceStore.deleteWorkspace(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Chat with workspace agent (SSE stream) ───
router.post('/:id/chat', async (req: any, res, next) => {
  try {
    const { command, agentId, sessionId, stream = true } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    if (!stream) {
      const result = await req.adapter.chat(req.params.id, command, agentId, sessionId);
      return res.json(result);
    }

    // SSE 流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const generator = req.adapter.chatStream(req.params.id, command, agentId, sessionId);

    try {
      for await (const chunk of generator) {
        const data = JSON.stringify(chunk);
        res.write(`data: ${data}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (streamErr) {
      console.error('Stream error:', streamErr);
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
