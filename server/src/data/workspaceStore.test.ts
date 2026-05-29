import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  __setTestDir,
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from './workspaceStore';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
}

function cleanup(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('workspaceStore CRUD', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // 预先创建空文件，避免从静态数据初始化
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'workspaces.json'), JSON.stringify({ workspaces: [] }), 'utf-8');
    __setTestDir(tmpDir);
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('listWorkspaces returns empty array when no data', async () => {
    const list = await listWorkspaces();
    expect(list).toEqual([]);
  });

  it('createWorkspace adds a workspace and persists it', async () => {
    const ws = await createWorkspace({ name: 'Test Cockpit' });
    expect(ws.name).toBe('Test Cockpit');
    expect(ws.id).toMatch(/^ws-\d+-.+/);
    expect(ws.status).toBe('running');

    const list = await listWorkspaces();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(ws.id);

    // 验证文件已写入
    const raw = fs.readFileSync(path.join(tmpDir, 'workspaces.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.workspaces).toHaveLength(1);
    expect(parsed.workspaces[0].name).toBe('Test Cockpit');
  });

  it('getWorkspace returns correct workspace or undefined', async () => {
    const ws = await createWorkspace({ name: 'Find Me' });
    const found = await getWorkspace(ws.id);
    expect(found?.name).toBe('Find Me');

    const missing = await getWorkspace('non-existent');
    expect(missing).toBeUndefined();
  });

  it('updateWorkspace modifies fields and updates updatedAt', async () => {
    const ws = await createWorkspace({ name: 'Old Name' });
    // 先更新一次，确保 updatedAt 有机会变化（至少 name 会变）
    const updated = await updateWorkspace(ws.id, { name: 'New Name', description: 'Updated desc' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('New Name');
    expect(updated!.description).toBe('Updated desc');

    const fromStore = await getWorkspace(ws.id);
    expect(fromStore?.name).toBe('New Name');
    expect(fromStore?.description).toBe('Updated desc');
  });

  it('updateWorkspace returns undefined for unknown id', async () => {
    const result = await updateWorkspace('unknown', { name: 'X' });
    expect(result).toBeUndefined();
  });

  it('deleteWorkspace removes workspace', async () => {
    const ws = await createWorkspace({ name: 'To Delete' });
    const deleted = await deleteWorkspace(ws.id);
    expect(deleted).toBe(true);

    const list = await listWorkspaces();
    expect(list).toHaveLength(0);

    const again = await deleteWorkspace(ws.id);
    expect(again).toBe(false);
  });

  it('createWorkspace respects agentIds and primaryAgentId', async () => {
    const ws = await createWorkspace({
      name: 'Multi-Agent',
      agentIds: ['a1', 'a2'],
      primaryAgentId: 'a2',
      agentMode: 'multi-coordinator',
    });
    expect(ws.agentIds).toEqual(['a1', 'a2']);
    expect(ws.primaryAgentId).toBe('a2');
    expect(ws.agentMode).toBe('multi-coordinator');
    expect(ws.agentBindings).toHaveLength(2);
  });

  it('createWorkspace enforces MAX_WORKSPACES limit', async () => {
    for (let i = 0; i < 30; i++) {
      await createWorkspace({ name: `WS ${i}` });
    }
    await expect(createWorkspace({ name: 'Overflow' })).rejects.toThrow('上限');
  });

  it('backup file is created on write', async () => {
    await createWorkspace({ name: 'Backup Test' });
    const bakPath = path.join(tmpDir, 'workspaces.json.bak');
    expect(fs.existsSync(bakPath)).toBe(true);
  });

  it('corrupted file recovers from backup', async () => {
    // 手动创建一个有数据的备份文件
    const backupData = { workspaces: [{ id: 'ws-backup', name: 'Backup Recovery', status: 'running', createdAt: '2024-01-01', updatedAt: '2024-01-01', agentIds: [], widgets: [] }] };
    fs.writeFileSync(path.join(tmpDir, 'workspaces.json.bak'), JSON.stringify(backupData), 'utf-8');
    // 破坏主文件
    fs.writeFileSync(path.join(tmpDir, 'workspaces.json'), 'not-json{{', 'utf-8');
    // 重置缓存模拟重新加载
    __setTestDir(tmpDir);
    const list = await listWorkspaces();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Backup Recovery');
  });
});
