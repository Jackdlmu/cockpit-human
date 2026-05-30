import express from 'express';
import cors from 'cors';
import { createAdapter } from './adapters';
import { connectionManager } from './connection/manager';
import agentsRouter from './routes/agents';
import workspacesRouter from './routes/workspaces';
import connectionsRouter from './routes/connections';
import agentRouter from './routes/agent';
import metaAgentRouter from './routes/meta-agent';
import { createWidgetDataRouter } from './routes/widget-data';
import templatesRouter from './routes/templates';
import widgetCatalogRouter from './routes/widget-catalog';
import { runtimeStatus } from './services/runtime-status';

export function createApp(): express.Express {
  const app = express();
  const adapter = createAdapter();

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS policy: ${origin} not allowed`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-Key'],
    credentials: true,
  }));

  app.use(express.json({ limit: '1mb' }));

  app.use((req: express.Request, _res, next) => {
    (req as express.Request & { adapter: typeof adapter }).adapter = adapter;
    next();
  });

  app.get('/api/health', (_req, res) => {
    const readiness = runtimeStatus.snapshot();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      readiness: {
        status: readiness.status,
        ready: readiness.ready,
      },
    });
  });

  app.get('/api/ready', (_req, res) => {
    const readiness = runtimeStatus.snapshot();
    const statusCode = readiness.ready ? 200 : readiness.status === 'error' ? 503 : 202;
    res.status(statusCode).json(readiness);
  });

  app.use('/api/agents', agentsRouter);
  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/connections', connectionsRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/meta-agent', metaAgentRouter);
  app.use('/api/workspaces/:id/widgets', createWidgetDataRouter(connectionManager));
  app.use('/api/templates', templatesRouter);
  app.use('/api/widget-catalog', widgetCatalogRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND', status: 404 });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Server error:', err);
    const status = (err as Error & { status?: number }).status || 500;
    const code = (err as Error & { code?: string }).code || 'INTERNAL_ERROR';
    res.status(status).json({ error: err.message || 'Internal server error', code, status });
  });

  return app;
}
