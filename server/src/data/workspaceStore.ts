// ─── Workspace 持久化存储（JSON 文件）───
// 替代静态 workspacesData，支持运行时增删改
// 关键设计：内存缓存 + 原子写入，避免并发竞态导致数据丢失

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { WorkspaceData } from './workspacesData';
import { workspacesData } from './workspacesData';

// 使用 import.meta.url 确保路径不依赖 process.cwd()
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'workspaces.json');

// 内存缓存：所有操作共享同一份数据，避免读取-修改-写入竞态
let storeCache: { workspaces: WorkspaceData[] } | null = null;

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
    console.error(`[WorkspaceStore] JSON parse failed, returning empty. File: ${STORE_FILE}`);
    storeCache = { workspaces: [] };
    return storeCache;
  }
}

// 原子写入：先写临时文件，再重命名，避免写入中断导致文件损坏
function writeStore(data: { workspaces: WorkspaceData[] }): void {
  storeCache = data;
  const tmpFile = STORE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STORE_FILE);
}

// ── CRUD ──

export async function listWorkspaces(): Promise<WorkspaceData[]> {
  const store = ensureStore();
  return store.workspaces;
}

export async function getWorkspace(id: string): Promise<WorkspaceData | undefined> {
  const store = ensureStore();
  return store.workspaces.find((w) => w.id === id);
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
}

export async function createWorkspace(spec: CreateWorkspaceSpec): Promise<WorkspaceData> {
  try {
    const store = ensureStore();
    const now = new Date().toISOString().slice(0, 10);
    const ws: WorkspaceData = {
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
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
      widgets: spec.widgets || [],
    };
    store.workspaces.push(ws);
    writeStore(store);
    return ws;
  } catch (err: any) {
    console.error('[WorkspaceStore] createWorkspace failed:', err);
    throw new Error(`驾驶舱创建失败：${err.message || '无法写入存储文件，请检查 server/data 目录权限'}`);
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
  const updated: WorkspaceData = {
    ...existing,
    ...updates,
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
