import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as workspaceStore from '../data/workspaceStore';
import { eventBus } from '../services/event-bus';
import { CockpitOrchestrator } from '../services/orchestrator';
import { cockpitAgent } from '../agent/cockpit-agent';
import { buildWorkspacePromptContext } from '../services/workspace-context';
import { contextBuilder } from '../services/context-builder';

const router = Router();

// 类型安全的全局 orchestrator 访问
declare global {
  // eslint-disable-next-line no-var
  var __cockpitOrchestrator: CockpitOrchestrator | undefined;
}

function getOrchestrator(): CockpitOrchestrator | undefined {
  return globalThis.__cockpitOrchestrator;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaces = await workspaceStore.listWorkspaces();
    // 确保每个 workspace 都有 orchestration 状态
    const orchestrator = getOrchestrator();
    if (orchestrator && Array.isArray(workspaces)) {
      for (const ws of workspaces) {
        if (!ws.orchestration) {
          try {
            const state = await orchestrator.evaluateWorkspace(ws);
            ws.orchestration = state;
          } catch {
            // ignore
          }
        }
      }
    }
    res.json({ workspaces });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = await workspaceStore.getWorkspace(req.params.id);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND', status: 404 });
      return;
    }
    // 如果 orchestration 为空，尝试从全局 orchestrator 获取最新状态
    if (workspace && !workspace.orchestration) {
      const orchestrator = getOrchestrator();
      if (orchestrator) {
        try {
          const state = await orchestrator.evaluateWorkspace(workspace);
          workspace.orchestration = state;
        } catch {
          // ignore evaluation errors
        }
      }
    }
    res.json({ workspace });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, icon, color, agentIds, primaryAgentId, widgets } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR', status: 400 });
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
    await contextBuilder.build(ws as any);
    eventBus.publish({
      id: `evt-${Date.now()}`,
      source: 'api',
      sourceType: 'yonclaw',
      type: 'workspace.created',
      payload: { workspaceId: ws.id, name: ws.name },
      timestamp: new Date().toISOString(),
    });
    res.status(201).json({ workspace: ws });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('上限')) {
      res.status(400).json({ error: msg, code: 'LIMIT_EXCEEDED', status: 400 });
      return;
    }
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = req.body;
    const updated = await workspaceStore.updateWorkspace(req.params.id, updates);
    if (!updated) {
      res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND', status: 404 });
      return;
    }
    await contextBuilder.build(updated as any);
    eventBus.publish({
      id: `evt-${Date.now()}`,
      source: 'api',
      sourceType: 'yonclaw',
      type: 'workspace.updated',
      payload: { workspaceId: updated.id, name: updated.name },
      timestamp: new Date().toISOString(),
    });
    res.json({ workspace: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await workspaceStore.deleteWorkspace(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND', status: 404 });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/workspaces/:id/orchestration ───
router.get('/:id/orchestration', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ws = await workspaceStore.getWorkspace(req.params.id);
    if (!ws) {
      res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND', status: 404 });
      return;
    }
    res.json({
      orchestration: ws.orchestration || null,
      context: (ws as Record<string, unknown>).context || null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Chat with workspace agent (SSE stream) ───
router.post('/:id/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { command, agentId, sessionId, stream = true } = req.body;
    if (!command) {
      res.status(400).json({ error: 'Command is required', code: 'VALIDATION_ERROR', status: 400 });
      return;
    }

    const built = await buildWorkspacePromptContext(req.params.id, {
      runtimeWidgetData: Array.isArray(req.body.runtimeWidgetData) ? req.body.runtimeWidgetData : undefined,
      viewContext: req.body.viewContext && typeof req.body.viewContext === 'object'
        ? req.body.viewContext
        : undefined,
    });
    if (!built) {
      res.status(404).json({ error: 'Workspace not found', code: 'NOT_FOUND', status: 404 });
      return;
    }

    const context = {
      workspaceId: built.workspace.id,
      sessionId: sessionId || `session-${Date.now()}`,
      history: req.body.history || [],
      workspace: built.workspace as any,
      promptContext: built.promptContext,
    };

    if (cockpitAgent) {
      if (!stream) {
        const result = await cockpitAgent.handleCommand(command, context);
        return res.json({
          message: result.message,
          card: result.card,
          suggestedCommands: result.suggestedCommands,
          sessionId: result.sessionId,
          plan: result.plan,
          results: result.results,
          workspace: result.workspace,
          initializing: result.initializing,
          initializationMode: result.initializationMode,
        });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      try {
        const generator = cockpitAgent.handleCommandStream(command, context);
        let finalResult: any;

        for await (const chunk of generator as any) {
          if (chunk.done) {
            finalResult = chunk;
            break;
          }
          res.write(`data: ${JSON.stringify({ chunk: chunk.chunk, stage: chunk.stage, done: false })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({
          done: true,
          message: finalResult?.message || '',
          card: finalResult?.card,
          suggestedCommands: finalResult?.suggestedCommands,
          sessionId: finalResult?.sessionId || context.sessionId,
          results: finalResult?.results,
          usedLLM: finalResult?.usedLLM,
          workspace: finalResult?.workspace,
          initializing: finalResult?.initializing,
          initializationMode: finalResult?.initializationMode,
        })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      } catch (streamErr) {
        console.error('Workspace chat stream error:', streamErr);
        res.write(`data: ${JSON.stringify({ error: streamErr instanceof Error ? streamErr.message : 'Stream error' })}\n\n`);
        res.end();
        return;
      }
    }

    if (!stream) {
      const result = await (req as Request & { adapter: { chat: (id: string, command: string, agentId?: string, sessionId?: string) => Promise<unknown> } }).adapter.chat(req.params.id, command, agentId, sessionId);
      return res.json(result);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const generator = (req as Request & { adapter: { chatStream: (id: string, command: string, agentId?: string, sessionId?: string) => AsyncGenerator<unknown> } }).adapter.chatStream(req.params.id, command, agentId, sessionId);

    // 客户端断开时取消 generator
    let aborted = false;
    res.on('close', () => { aborted = true; });

    try {
      let finalResult: any;
      while (true) {
        if (aborted) break;
        const { value, done } = await generator.next();
        if (done) {
          finalResult = value;
          break;
        }
        const typedChunk = value as any;
        if (typedChunk?.done) {
          finalResult = typedChunk;
          break;
        }
        const data = JSON.stringify(value);
        res.write(`data: ${data}\n\n`);
      }
      if (!aborted) {
        res.write(`data: ${JSON.stringify({
          done: true,
          message: finalResult?.message || '',
          card: finalResult?.card,
          suggestedCommands: finalResult?.suggestedCommands,
          sessionId: finalResult?.sessionId,
        })}\n\n`);
        res.write(`data: [DONE]\n\n`);
      }
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
