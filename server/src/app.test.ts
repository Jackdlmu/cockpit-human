import fs from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app';
import { __setTestDir } from './data/workspaceStore';

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

  describe('404 handler', () => {
    it('returns structured 404 for unknown routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.status).toBe(404);
    });
  });
});
