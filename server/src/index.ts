import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { createAdapter } from './adapters';
import { connectionManager } from './connection/manager';
import { initCockpitAgent } from './agent/cockpit-agent';
import { initMetaAgent } from './services/meta-agent';
import { initAgentRouter } from './services/agent-router';
import { loadBuiltinTemplates, loadCustomTemplates } from './agent/templates/registry';
import agentsRouter from './routes/agents';
import workspacesRouter from './routes/workspaces';
import connectionsRouter from './routes/connections';
import agentRouter from './routes/agent';
import metaAgentRouter from './routes/meta-agent';
import { createWidgetDataRouter } from './routes/widget-data';
import templatesRouter from './routes/templates';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize adapter (shared across routes)
const adapter = createAdapter();

// Initialize connection manager & cockpit agent
// 加载系统模板（builtin-templates.json）和自定义模板（templates.json）
loadBuiltinTemplates();
loadCustomTemplates();

connectionManager.initialize().then(() => {
  connectionManager.startHealthChecks(30000);
  const agentRouter = initAgentRouter(connectionManager);
  agentRouter.getDiscoveryService().startAutoRefresh(60000);
  const cockpitAgent = initCockpitAgent(connectionManager);
  initMetaAgent(cockpitAgent, connectionManager);
  console.log('[AgentRouter] Initialized');
  console.log('[CockpitAgent] Initialized');
  console.log('[MetaAgent] Initialized');
});

// Middleware
// CORS 配置：开发环境允许任意来源，生产环境限制特定域名
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // 开发环境：允许无 origin（如 curl）或任意 localhost
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    // 生产环境：检查白名单
    if (corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS policy: ${origin} not allowed`), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Key'],
  credentials: true,
}));
app.use(express.json());

// Attach adapter to requests
app.use((req: any, _res, next) => {
  req.adapter = adapter;
  next();
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Routes
app.use('/api/agents', agentsRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/agent', agentRouter);
app.use('/api/meta-agent', metaAgentRouter);
app.use('/api/workspaces/:id/widgets', createWidgetDataRouter(connectionManager));
app.use('/api/templates', templatesRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 初始化 WebSocket 服务器
import { createWebSocketServer } from './services/ws-server';

createWebSocketServer(httpServer, '/api/events');

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
