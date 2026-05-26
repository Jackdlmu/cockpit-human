import { Router } from 'express';
import { getAgentRouter } from '../services/agent-router';

const router = Router();

/** GET /api/agents —— 聚合所有已连接平台的可用智能体 */
router.get('/', async (req: any, res, next) => {
  try {
    const router = getAgentRouter();
    if (router) {
      const agents = await router.listAvailableAgents();
      // 合并静态数据中的丰富信息（avatar、skills 等）
      const { agentsData } = await import('../data/agentsData');
      const enriched = agents.map((a) => {
        const staticInfo = agentsData.find((s) => s.id === a.id);
        return {
          ...staticInfo,
          id: a.id,
          name: a.name,
          description: a.description || staticInfo?.description,
          status: a.status === 'active' ? 'active' : a.status === 'error' ? 'error' : 'idle',
          // 运行时信息
          sourceConnectionId: a.sourceConnectionId,
          sourceConnectionName: a.sourceConnectionName,
          sourceType: a.sourceType,
          capabilities: a.capabilities,
          // 保留静态数据的 avatar、skills 等
          avatar: staticInfo?.avatar || '🤖',
          skills: staticInfo?.skills || a.tags || [],
          category: staticInfo?.category || '通用',
          // 使用发现的数据覆盖静态
          ...((a.meta || {}) as any),
        };
      });

      // 如果没有发现任何智能体，返回静态数据（兼容旧模式）
      if (enriched.length === 0) {
        return res.json({ agents: agentsData, source: 'static', discovered: false });
      }

      return res.json({ agents: enriched, source: 'discovered', discovered: true });
    }

    // 没有 AgentRouter：回退到 adapter
    const agents = await req.adapter.getAgents();
    res.json({ agents, source: 'adapter', discovered: false });
  } catch (err) {
    next(err);
  }
});

/** GET /api/agents/:id —— 获取单个智能体 */
router.get('/:id', async (req: any, res, next) => {
  try {
    const router = getAgentRouter();
    if (router) {
      const agent = await router.getDiscoveryService().findAgent(req.params.id);
      if (agent) {
        const { agentsData } = await import('../data/agentsData');
        const staticInfo = agentsData.find((s) => s.id === req.params.id);
        return res.json({
          agent: {
            ...staticInfo,
            id: agent.id,
            name: agent.name,
            description: agent.description || staticInfo?.description,
            status: agent.status,
            sourceConnectionId: agent.sourceConnectionId,
            sourceConnectionName: agent.sourceConnectionName,
            sourceType: agent.sourceType,
            capabilities: agent.capabilities,
            avatar: staticInfo?.avatar || '🤖',
            skills: staticInfo?.skills || agent.tags || [],
          },
        });
      }
    }

    const agent = await req.adapter.getAgent(req.params.id);
    res.json({ agent });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/stats', async (req: any, res, next) => {
  try {
    const stats = await req.adapter.getAgentStats(req.params.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
