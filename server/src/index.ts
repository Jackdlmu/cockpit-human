import { createServer } from 'http';
import { createApp } from './app';
import { connectionManager } from './connection/manager';
import { initCockpitAgent } from './agent/cockpit-agent';
import { initMetaAgent } from './services/meta-agent';
import { initAgentRouter } from './services/agent-router';
import { loadBuiltinTemplates, loadCustomTemplates } from './agent/templates/registry';
import { CockpitOrchestrator } from './services/orchestrator';
import { contextBuilder } from './services/context-builder';
import { createWebSocketServer } from './services/ws-server';

const app = createApp();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// 加载系统模板（builtin-templates.json）和自定义模板（templates.json）
loadBuiltinTemplates();
loadCustomTemplates();

connectionManager.initialize().then(() => {
  connectionManager.startHealthChecks(30000);
  const agentRouter = initAgentRouter(connectionManager);
  agentRouter.getDiscoveryService().startAutoRefresh(60000);
  const cockpitAgent = initCockpitAgent(connectionManager);
  initMetaAgent(cockpitAgent, connectionManager);

  // 初始化 Orchestrator + ContextBuilder
  const orchestrator = new CockpitOrchestrator(connectionManager, agentRouter.getDiscoveryService());
  orchestrator.startAutoCheck(15000);
  contextBuilder.buildAll().then(() => {
    console.log('[ContextBuilder] All contexts built');
  });

  // 暴露到全局供路由使用（类型安全声明）
  (globalThis as typeof globalThis & { __cockpitOrchestrator?: CockpitOrchestrator }).__cockpitOrchestrator = orchestrator;

  console.log('[AgentRouter] Initialized');
  console.log('[CockpitAgent] Initialized');
  console.log('[MetaAgent] Initialized');
  console.log('[Orchestrator] Initialized');
});

// 初始化 WebSocket 服务器
createWebSocketServer(httpServer, '/api/events');

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
