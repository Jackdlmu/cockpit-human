// ─── /api/agent 路由 ───
// 座舱代理智能对话：支持流式(SSE)和非流式

import { Router } from 'express';
import { cockpitAgent } from '../agent/cockpit-agent';
import type { WorkspaceData } from '../data/workspacesData';
import { buildWorkspacePromptContext } from '../services/workspace-context';

const router = Router();

// POST /api/agent/chat → 智能对话（替代现有简单 chat）
router.post('/chat', async (req, res, next) => {
  try {
    const { command, workspaceId, sessionId, stream = true } = req.body;
    if (!command) {
      res.status(400).json({ error: 'Command is required' });
      return;
    }

    if (!cockpitAgent) {
      res.status(503).json({ error: 'CockpitAgent not initialized' });
      return;
    }

    // 加载当前驾驶舱数据并构建上下文
    let workspace: WorkspaceData | undefined;
    let promptContext = '';
    if (workspaceId) {
      try {
        const built = await buildWorkspacePromptContext(workspaceId, {
          runtimeWidgetData: Array.isArray(req.body.runtimeWidgetData) ? req.body.runtimeWidgetData : undefined,
          viewContext: req.body.viewContext && typeof req.body.viewContext === 'object'
            ? req.body.viewContext
            : undefined,
        });
        if (built) {
          workspace = built.workspace as WorkspaceData;
          promptContext = built.promptContext;
        }
      } catch (err: any) {
        console.warn(`[AgentRoute] Failed to load workspace ${workspaceId}:`, err.message);
      }
    }

    const context = {
      workspaceId: workspaceId || undefined,
      sessionId: sessionId || `session-${Date.now()}`,
      history: req.body.history || [],
      workspace: workspace as any,
      promptContext,
    };

    if (!stream) {
      const result = await cockpitAgent.handleCommand(command, context);
      res.json({
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
      return;
    }

    // SSE 流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const generator = cockpitAgent.handleCommandStream(command, context);
      let finalResult: {
        done: true;
        message?: string;
        card?: any;
        suggestedCommands?: string[];
        results?: any[];
        sessionId?: string;
        usedLLM?: boolean;
        workspace?: WorkspaceData;
        initializing?: boolean;
        initializationMode?: 'llm' | 'real-data';
      } | undefined;

      // 使用 for await 遍历 AsyncGenerator
      for await (const chunk of generator as any) {
        if (chunk.done) {
          finalResult = chunk;
          break;
        }
        res.write(`data: ${JSON.stringify({ chunk: chunk.chunk, stage: chunk.stage, done: false })}\n\n`);
      }

      // 发送最终结果（finalResult 是最后一个 yield 的 chunk，包含完整响应字段）
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
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
