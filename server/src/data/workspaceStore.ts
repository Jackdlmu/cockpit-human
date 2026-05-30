// ─── Workspace 持久化存储（JSON 文件）───
// 替代静态 workspacesData，支持运行时增删改
// 关键设计：内存缓存 + 原子写入 + 自动备份，避免并发竞态导致数据丢失

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import type { WorkspaceData } from './workspacesData';
import { workspacesData } from './workspacesData';
import { normalizeWidgets } from '../services/widget-normalizer';

// 使用 import.meta.url 确保路径不依赖 process.cwd()
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let DATA_DIR = path.resolve(__dirname, '../../data');
let STORE_FILE = path.join(DATA_DIR, 'workspaces.json');
let BAK_FILE = path.join(DATA_DIR, 'workspaces.json.bak');

/** 测试专用：切换数据目录并清空缓存 */
export function __setTestDir(testDir: string): void {
  DATA_DIR = testDir;
  STORE_FILE = path.join(DATA_DIR, 'workspaces.json');
  BAK_FILE = path.join(DATA_DIR, 'workspaces.json.bak');
  storeCache = null;
  writeQueue = Promise.resolve();
}

// 内存缓存：所有操作共享同一份数据，避免读取-修改-写入竞态
let storeCache: { workspaces: WorkspaceData[] } | null = null;

// 写入队列：串行化所有写操作，防止并发竞态导致数据丢失
let writeQueue: Promise<void> = Promise.resolve();

// 确保目录和文件存在（首次运行从静态数据初始化）
function ensureStore(): { workspaces: WorkspaceData[] } {
  if (storeCache) return storeCache;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[WorkspaceStore] Created data dir: ${DATA_DIR}`);
  }
  if (!fs.existsSync(STORE_FILE)) {
    // 首次运行：从静态数据初始化
    fs.writeFileSync(STORE_FILE, JSON.stringify({ workspaces: workspacesData }, null, 2), 'utf-8');
    console.log(`[WorkspaceStore] Initialized from static data: ${STORE_FILE}`);
  }
  const raw = fs.readFileSync(STORE_FILE, 'utf-8');
  try {
    storeCache = JSON.parse(raw);
    console.log(`[WorkspaceStore] Loaded ${storeCache.workspaces.length} workspaces from ${STORE_FILE}`);
    return storeCache;
  } catch (err) {
    console.error(`[WorkspaceStore] JSON parse failed, attempting backup recovery. File: ${STORE_FILE}`);
    // 尝试从备份恢复
    if (fs.existsSync(BAK_FILE)) {
      try {
        const bakRaw = fs.readFileSync(BAK_FILE, 'utf-8');
        storeCache = JSON.parse(bakRaw);
        console.log(`[WorkspaceStore] Recovered ${storeCache.workspaces.length} workspaces from backup`);
        // 将备份恢复为主文件
        fs.copyFileSync(BAK_FILE, STORE_FILE);
        return storeCache;
      } catch (bakErr) {
        console.error(`[WorkspaceStore] Backup recovery also failed:`, bakErr);
      }
    }
    console.error(`[WorkspaceStore] No valid backup found, returning empty. Data may be lost!`);
    storeCache = { workspaces: [] };
    return storeCache;
  }
}

// 原子写入：先写临时文件，再重命名，同时创建备份
// 通过 writeQueue 串行化，防止并发写入覆盖
function writeStore(data: { workspaces: WorkspaceData[] }): void {
  storeCache = data;
  writeQueue = writeQueue.then(() => {
    const tmpFile = STORE_FILE + '.tmp';
    // 写入前先备份当前文件
    if (fs.existsSync(STORE_FILE)) {
      try {
        fs.copyFileSync(STORE_FILE, BAK_FILE);
      } catch {
        // 备份失败不阻塞写入
      }
    }
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STORE_FILE);
  }).catch((err) => {
    console.error('[WorkspaceStore] Write failed:', err);
  });
}

function normalizeWorkspaceForRead(workspace: WorkspaceData): WorkspaceData {
  return {
    ...workspace,
    widgets: normalizeWidgets(workspace.widgets, { idPrefix: 'w' }) as WorkspaceData['widgets'],
  };
}

// ── CRUD ──

export async function listWorkspaces(): Promise<WorkspaceData[]> {
  const store = ensureStore();
  return store.workspaces.map(normalizeWorkspaceForRead);
}

export async function getWorkspace(id: string): Promise<WorkspaceData | undefined> {
  const store = ensureStore();
  const workspace = store.workspaces.find((w) => w.id === id);
  return workspace ? normalizeWorkspaceForRead(workspace) : undefined;
}

export interface CreateWorkspaceSpec {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  agentIds?: string[];
  primaryAgentId?: string;
  agentMode?: import('./workspacesData').AgentMode;
  widgets?: any[];
  useDemoDataFallback?: boolean;
  executionOwner?: 'cockpit' | 'external';
  externalProvider?: 'yonclaw' | 'openclaw' | 'generic-llm' | 'other';
  externalWorkspaceId?: string;
  externalConnectionId?: string;
}

const MAX_WORKSPACES = 30;

export async function createWorkspace(spec: CreateWorkspaceSpec): Promise<WorkspaceData> {
  try {
    const store = ensureStore();
    if (store.workspaces.length >= MAX_WORKSPACES) {
      throw new Error(`驾驶舱数量已达上限（${MAX_WORKSPACES}个），请先删除部分驾驶舱后再创建`);
    }
    const normalizedWidgets = normalizeWidgets(spec.widgets, { idPrefix: 'w' });
    const now = new Date().toISOString().slice(0, 10);
    const ws: WorkspaceData = {
      id: `ws-${Date.now()}-${randomUUID().slice(0, 5)}`,
      name: spec.name,
      description: spec.description || '',
      icon: spec.icon || 'Layers',
      color: spec.color || '#6366f1',
      status: 'running',
      createdAt: now,
      updatedAt: now,
      agentIds: spec.agentIds || [],
      primaryAgentId: spec.primaryAgentId || (spec.agentIds?.[0] || ''),
      agentMode: spec.agentMode || 'single',
      agentBindings: spec.agentIds?.map((id) => ({ agentId: id, status: 'pending' as const })),
      widgets: normalizedWidgets,
      useDemoDataFallback: spec.useDemoDataFallback ?? true,
      executionOwner: spec.executionOwner || 'cockpit',
      externalProvider: spec.externalProvider,
      externalWorkspaceId: spec.externalWorkspaceId,
      externalConnectionId: spec.externalConnectionId,
    };
    store.workspaces.push(ws);
    writeStore(store);
    return ws;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WorkspaceStore] createWorkspace failed:', err);
    throw new Error(`驾驶舱创建失败：${msg || '无法写入存储文件，请检查 server/data 目录权限'}`);
  }
}

export async function updateWorkspace(
  id: string,
  updates: Partial<Omit<WorkspaceData, 'id' | 'createdAt'>>
): Promise<WorkspaceData | undefined> {
  const store = ensureStore();
  const idx = store.workspaces.findIndex((w) => w.id === id);
  if (idx === -1) return undefined;

  const existing = store.workspaces[idx];
  const normalizedUpdates = 'widgets' in updates
    ? { ...updates, widgets: normalizeWidgets(updates.widgets, { idPrefix: 'w' }) }
    : updates;
  const updated: WorkspaceData = {
    ...existing,
    ...normalizedUpdates,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  store.workspaces[idx] = updated;
  writeStore(store);
  return updated;
}

export async function deleteWorkspace(id: string): Promise<boolean> {
  const store = ensureStore();
  const idx = store.workspaces.findIndex((w) => w.id === id);
  if (idx === -1) return false;
  store.workspaces.splice(idx, 1);
  writeStore(store);
  return true;
}
