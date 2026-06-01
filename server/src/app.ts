import express from 'express';
import cors from 'cors';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
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
import groupingPolicyRouter from './routes/grouping-policy';
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

  const reportsDir = process.env.REPORTS_DIR || path.resolve(process.cwd(), 'server/data/reports');
  const localReportRoots = (process.env.LOCAL_REPORT_ROOTS
    ? process.env.LOCAL_REPORT_ROOTS.split(path.delimiter)
    : [
        reportsDir,
        path.join(os.homedir(), 'Library/Application Support/yonclaw'),
        path.join(os.homedir(), '.yonclaw'),
      ])
    .map((root) => path.resolve(root));

  app.use('/reports', express.static(reportsDir, {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (filePath.toLowerCase().endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
    },
  }));

  app.get('/reports/local', (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    if (!rawPath) {
      return res.status(400).json({ error: 'Missing report path', code: 'MISSING_REPORT_PATH' });
    }

    let reportPath: string;
    try {
      reportPath = rawPath.startsWith('file://') ? fileURLToPath(rawPath) : rawPath;
    } catch {
      return res.status(400).json({ error: 'Invalid report path', code: 'INVALID_REPORT_PATH' });
    }

    const resolvedPath = path.resolve(reportPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const allowed = localReportRoots.some((root) => resolvedPath === root || resolvedPath.startsWith(`${root}${path.sep}`));
    if (!allowed || !['.html', '.htm'].includes(ext)) {
      return res.status(403).json({ error: 'Report path is not allowed', code: 'REPORT_PATH_FORBIDDEN' });
    }

    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      return res.status(404).json({ error: 'Report not found', code: 'REPORT_NOT_FOUND' });
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(resolvedPath);
  });

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
  app.use('/api/grouping-policy', groupingPolicyRouter);

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
