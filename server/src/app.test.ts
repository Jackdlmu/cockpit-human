import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app';
import { __setTestDir } from './data/workspaceStore';
import { connectionManager } from './connection/manager';
import { initCockpitAgent } from './agent/cockpit-agent';
import { loadBuiltinTemplates, loadCustomTemplates } from './agent/templates/registry';
import { registerBuiltinTools } from './tools/registry';
import { planWorkspaceCreation } from './services/workspace-planner';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'api-test-'));
}

function cleanup(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('API Integration Tests', () => {
  let tmpDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'workspaces.json'), JSON.stringify({ workspaces: [] }), 'utf-8');
    __setTestDir(tmpDir);
    loadBuiltinTemplates();
    loadCustomTemplates();
    registerBuiltinTools();
    initCockpitAgent(connectionManager);
    app = createApp();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('1.0.0');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/agents', () => {
    it('returns agents from mock adapter', async () => {
      const res = await request(app).get('/api/agents');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('agents');
      expect(Array.isArray(res.body.agents)).toBe(true);
    });
  });

  describe('/api/workspaces CRUD', () => {
    it('GET /api/workspaces returns empty initially', async () => {
      const res = await request(app).get('/api/workspaces');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.workspaces)).toBe(true);
    });

    it('POST /api/workspaces creates a workspace', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Integration Test Cockpit', description: 'Test' });

      expect(res.status).toBe(201);
      expect(res.body.workspace).toBeDefined();
      expect(res.body.workspace.name).toBe('Integration Test Cockpit');
    });

    it('GET /api/workspaces/:id returns workspace', async () => {
      const createRes = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Find Me' });
      const id = createRes.body.workspace.id;

      const res = await request(app).get(`/api/workspaces/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.workspace.id).toBe(id);
      expect(res.body.workspace.name).toBe('Find Me');
    });

    it('PUT /api/workspaces/:id updates workspace', async () => {
      const createRes = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Old Name' });
      const id = createRes.body.workspace.id;

      const res = await request(app)
        .put(`/api/workspaces/${id}`)
        .send({ name: 'New Name', description: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.workspace.name).toBe('New Name');
      expect(res.body.workspace.description).toBe('Updated');
    });

    it('normalizes legacy top-level widget payloads into widget.data on update', async () => {
      const createRes = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Legacy Widget Shape' });
      const id = createRes.body.workspace.id;

      const updateRes = await request(app)
        .put(`/api/workspaces/${id}`)
        .send({
          widgets: [
            {
              id: 'metric-1',
              type: 'metric',
              title: '净利润（2025全年）',
              metric: {
                value: '8,599万元',
                label: '净利率28%',
                change: '—',
                changeType: 'positive',
              },
            },
            {
              id: 'alert-1',
              type: 'alert',
              title: '紧急预警',
              content: '收入为0但成本已发生，请立即关注收入确认进度',
              level: 'danger',
            },
            {
              id: 'matrix-1',
              type: 'metric',
              title: '子公司净利润排名',
              data: {
                '0': ['公司', '净利润(万)'],
                '1': ['云智科技股份', 4334.87],
                '2': ['云智科技生产工厂', 4164.47],
              },
            },
          ],
        });

      expect(updateRes.status).toBe(200);
      const widgets = updateRes.body.workspace.widgets;
      const metricWidget = widgets.find((widget: any) => widget.id === 'metric-1');
      const alertWidget = widgets.find((widget: any) => widget.id === 'alert-1');
      const matrixWidget = widgets.find((widget: any) => widget.id === 'matrix-1');

      expect(metricWidget.data.value).toBe('8,599万元');
      expect(metricWidget.data.caption).toBe('净利率28%');
      expect(metricWidget.data.trend).toBe('up');

      expect(Array.isArray(alertWidget.data.alerts)).toBe(true);
      expect(alertWidget.data.alerts[0].message).toContain('收入为0但成本已发生');
      expect(alertWidget.data.alerts[0].level).toBe('danger');

      expect(Array.isArray(matrixWidget.data.rows)).toBe(true);
      expect(matrixWidget.data.rows[0]).toEqual(['公司', '净利润(万)']);
    });

    it('DELETE /api/workspaces/:id removes workspace from store', async () => {
      const createRes = await request(app)
        .post('/api/workspaces')
        .send({ name: 'To Delete' });
      const id = createRes.body.workspace.id;

      const delRes = await request(app).delete(`/api/workspaces/${id}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });

    it('POST /api/workspaces enforces limit', async () => {
      for (let i = 0; i < 30; i++) {
        await request(app).post('/api/workspaces').send({ name: `WS ${i}` });
      }
      const res = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Overflow' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('上限');
      expect(res.body.code).toBe('LIMIT_EXCEEDED');
    });
  });

  describe('Creation flows', () => {
    it('planWorkspaceCreation reuses preferred template planning for template mode', async () => {
      const spec = await planWorkspaceCreation({
        command: '创建驾驶舱「模板偏好测试」，目标参考模板「CFO财务决策驾驶舱」',
        name: '模板偏好测试',
        initPrompt: '请获取真实财务数据',
        preferredTemplateId: 'financial-decision',
      });

      expect(spec.name).toBe('模板偏好测试驾驶舱');
      expect(Array.isArray(spec.widgets)).toBe(true);
      expect(spec.widgets.length).toBeGreaterThan(0);
      expect(spec.templateName).toBe('CFO财务决策驾驶舱');
      expect(spec.initPrompt).toBe('请获取真实财务数据');
    });

    it('planWorkspaceCreation adds data-first intents for weather and finance scenarios', async () => {
      const weatherSpec = await planWorkspaceCreation({
        command: '创建一个北京七日天气驾驶舱，获取真实天气数据',
      });
      expect(weatherSpec.widgets.length).toBeGreaterThan(0);
      expect(weatherSpec.widgets.some((widget: any) => widget.dataIntent?.domain === 'weather')).toBe(true);
      expect(weatherSpec.widgets.some((widget: any) => widget.dataIntent?.sourcePreference === 'tool-first')).toBe(true);
      expect(weatherSpec.widgets.every((widget: any) => widget.dataSource?.skillId === 'weather_query')).toBe(true);

      const financeSpec = await planWorkspaceCreation({
        command: '创建一个CFO财务决策驾驶舱，获取一家真实上市公司的真实财务数据',
        preferredTemplateId: 'financial-decision',
      });
      expect(financeSpec.widgets.length).toBeGreaterThan(0);
      expect(financeSpec.widgets.some((widget: any) => widget.dataIntent?.domain === 'finance')).toBe(true);
      expect(financeSpec.widgets.some((widget: any) => widget.dataIntent?.required === true)).toBe(true);
    });

    it('POST /api/templates/:id/create-cockpit returns a workspace with unified init metadata', async () => {
      const res = await request(app)
        .post('/api/templates/financial-decision/create-cockpit')
        .send({
          name: '真实财务驾驶舱',
          initPrompt: '请联网获取一家真实上市公司的真实数据，不要演示数据',
        });

      expect(res.status).toBe(201);
      expect(res.body.workspace).toBeDefined();
      expect(res.body.workspace.name).toBe('真实财务驾驶舱');
      expect(Array.isArray(res.body.workspace.widgets)).toBe(true);
      expect(res.body.workspace.widgets.length).toBeGreaterThan(0);
      expect(res.body.initializing).toBe(true);
      expect(res.body.initializationMode).toBe('real-data');
      expect(res.body.workspace.agentMode).toBe('llm-only');
      expect(res.body.workspace.agentIds).toEqual([]);
      expect(res.body.workspace.primaryAgentId).toBe('');
    });

    it('POST /api/agent/chat non-stream can create a template-backed cockpit and persist it', async () => {
      const res = await request(app)
        .post('/api/agent/chat')
        .send({
          command: '请创建一个CFO财务决策驾驶舱',
          stream: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.workspace).toBeDefined();
      expect(res.body.workspace.name).toContain('驾驶舱');
      expect(Array.isArray(res.body.workspace.widgets)).toBe(true);
      expect(res.body.workspace.widgets.length).toBeGreaterThan(0);
      expect(res.body.initializing).toBe(true);
      expect(['llm', 'real-data']).toContain(res.body.initializationMode);

      const listRes = await request(app).get('/api/workspaces');
      expect(listRes.status).toBe(200);
      expect(listRes.body.workspaces.some((ws: { id: string }) => ws.id === res.body.workspace.id)).toBe(true);
    });
  });

  describe('404 handler', () => {
    it('returns structured 404 for unknown routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.status).toBe(404);
    });
  });
});
