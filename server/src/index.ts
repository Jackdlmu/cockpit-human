import { createServer } from 'http';
import { createApp } from './app';
import { connectionManager } from './connection/manager';
import { initCockpitAgent } from './agent/cockpit-agent';
import { initMetaAgent } from './services/meta-agent';
import { initAgentRouter } from './services/agent-router';
import { loadBuiltinTemplates, loadCustomTemplates } from './agent/templates/registry';
import { registerBuiltinTools } from './tools/registry';
import { CockpitOrchestrator } from './services/orchestrator';
import { contextBuilder } from './services/context-builder';
import { createWebSocketServer } from './services/ws-server';
import { runtimeStatus } from './services/runtime-status';
import { resumeWorkspaceInitializationJobs } from './services/workspace-initializer';

const app = createApp();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

runtimeStatus.registerCheck('templates', true, '模板注册');
runtimeStatus.registerCheck('connections', true, '连接初始化');
runtimeStatus.registerCheck('agent-router', true, '智能体路由');
runtimeStatus.registerCheck('cockpit-agent', true, '驾驶舱智能体');
runtimeStatus.registerCheck('meta-agent', true, 'Meta-Agent');
runtimeStatus.registerCheck('context-builder', false, '上下文构建');
runtimeStatus.registerCheck('orchestrator', false, '多智能体协同状态');
runtimeStatus.registerCheck('ws-server', true, 'WebSocket 事件服务');
runtimeStatus.registerCheck('workspace-init-recovery', false, '初始化任务恢复');

// 加载系统模板（builtin-templates.json）和自定义模板（templates.json）
loadBuiltinTemplates();
loadCustomTemplates();
runtimeStatus.markReady('templates', '模板已加载');

// 注册外部数据工具（支持 LLM Tool Calling）
registerBuiltinTools();

connectionManager.initialize().then(() => {
  runtimeStatus.markReady('connections', '连接初始化完成');
  connectionManager.startHealthChecks(30000);
  const agentRouter = initAgentRouter(connectionManager);
  agentRouter.getDiscoveryService().startAutoRefresh(60000);
  runtimeStatus.markReady('agent-router', '智能体路由已启动');
  const cockpitAgent = initCockpitAgent(connectionManager);
  runtimeStatus.markReady('cockpit-agent', '驾驶舱智能体已启动');
  initMetaAgent(cockpitAgent, connectionManager);
  runtimeStatus.markReady('meta-agent', 'Meta-Agent 已启动');

  // 初始化 Orchestrator + ContextBuilder
  const orchestrator = new CockpitOrchestrator(connectionManager, agentRouter.getDiscoveryService());
  orchestrator.startAutoCheck(15000);
  runtimeStatus.markReady('orchestrator', '编排器已启动');
  contextBuilder.buildAll().then(() => {
    console.log('[ContextBuilder] All contexts built');
    runtimeStatus.markReady('context-builder', '上下文构建完成');
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    runtimeStatus.markError('context-builder', message);
  });

  resumeWorkspaceInitializationJobs()
    .then(() => {
      runtimeStatus.markReady('workspace-init-recovery', '初始化任务恢复已完成');
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      runtimeStatus.markError('workspace-init-recovery', message);
    });

  // 暴露到全局供路由使用（类型安全声明）
  (globalThis as typeof globalThis & { __cockpitOrchestrator?: CockpitOrchestrator }).__cockpitOrchestrator = orchestrator;

  console.log('[AgentRouter] Initialized');
  console.log('[CockpitAgent] Initialized');
  console.log('[MetaAgent] Initialized');
  console.log('[Orchestrator] Initialized');
}).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  runtimeStatus.markError('connections', message);
  runtimeStatus.markError('agent-router', '连接初始化失败，路由未启动');
  runtimeStatus.markError('cockpit-agent', '连接初始化失败，驾驶舱智能体未启动');
  runtimeStatus.markError('meta-agent', '连接初始化失败，Meta-Agent 未启动');
  console.error('[Bootstrap] Failed to initialize runtime services:', message);
});

// 初始化 WebSocket 服务器
createWebSocketServer(httpServer, '/api/events');
runtimeStatus.markReady('ws-server', 'WebSocket 服务已挂载');

// 导出 app 供测试使用
export { app, httpServer };

httpServer.listen(PORT, () => {
  console.log(`🚀 YonCockpit API Server running on http://localhost:${PORT}`);
  console.log(`📋 API Endpoints:`);
  console.log(`   GET  /api/health         - Health check`);
  console.log(`   GET  /api/agents         - List all agents`);
  console.log(`   GET  /api/agents/:id     - Get agent by ID`);
  console.log(`   GET  /api/agents/:id/stats - Get agent stats`);
  console.log(`   GET  /api/workspaces     - List all workspaces`);
  console.log(`   GET  /api/workspaces/:id - Get workspace by ID`);
  console.log(`   POST /api/workspaces/:id/chat    - Chat with workspace agent (SSE)`);
  console.log(`   GET  /api/connections            - List connections`);
  console.log(`   POST /api/connections            - Create connection`);
  console.log(`   GET  /api/connections/:id        - Get connection`);
  console.log(`   PUT  /api/connections/:id        - Update connection`);
  console.log(`   DELETE /api/connections/:id      - Delete connection`);
  console.log(`   POST /api/connections/:id/test   - Test connection`);
  console.log(`   POST /api/connections/:id/connect - Connect`);
  console.log(`   POST /api/connections/:id/disconnect - Disconnect`);
  console.log(`   POST /api/agent/chat             - CockpitAgent smart chat (SSE)`);
  console.log(`   WS   /api/events                 - Real-time event stream`);
  console.log(`   GET  /api/meta-agent             - Meta-Agent info`);
  console.log(`   GET  /api/meta-agent/tools       - Tool definitions`);
  console.log(`   POST /api/meta-agent/invoke      - Agent invoke`);
  console.log(`   POST /api/meta-agent/tools/:name - Tool execution`);
});
