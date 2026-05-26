// ─── Connection 持久化存储（JSON 文件）───
// MVP 阶段使用文件存储，后续可替换为数据库
// 关键设计：内存缓存 + 原子写入，避免并发竞态导致数据丢失

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Connection, CreateConnectionInput, UpdateConnectionInput } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'connections.json');

// 内存缓存：所有操作共享同一份数据
let storeCache: { connections: Connection[] } | null = null;

// 确保目录和文件存在
function ensureStore(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ connections: [] }, null, 2), 'utf-8');
  }
}

function readStore(): { connections: Connection[] } {
  if (storeCache) return storeCache;
  ensureStore();
  const raw = fs.readFileSync(STORE_FILE, 'utf-8');
  try {
    storeCache = JSON.parse(raw);
    return storeCache;
  } catch {
    storeCache = { connections: [] };
    return storeCache;
  }
}

function writeStore(data: { connections: Connection[] }): void {
  storeCache = data;
  const tmpFile = STORE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STORE_FILE);
}

// ── CRUD ──

export async function listConnections(): Promise<Connection[]> {
  const store = readStore();
  return store.connections;
}

export async function getConnection(id: string): Promise<Connection | undefined> {
  return getConnectionSync(id);
}

export function getConnectionSync(id: string): Connection | undefined {
  const store = readStore();
  return store.connections.find((c) => c.id === id);
}

export async function createConnection(input: CreateConnectionInput): Promise<Connection> {
  const store = readStore();
  const now = new Date().toISOString();
  const connection: Connection = {
    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name,
    type: input.type,
    config: input.config,
    status: 'disconnected',
    capabilities: input.capabilities ?? inferCapabilities(input.type),
    priority: input.priority ?? (input.type === 'openclaw' || input.type === 'yonclaw' ? 50 : 100),
    enabled: input.enabled ?? true,
    lastHealthCheck: null,
    createdAt: now,
    updatedAt: now,
  };
  store.connections.push(connection);
  writeStore(store);
  return connection;
}

export async function updateConnection(id: string, input: UpdateConnectionInput): Promise<Connection | undefined> {
  const store = readStore();
  const idx = store.connections.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;

  const existing = store.connections[idx];
  const updated: Connection = {
    ...existing,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.config !== undefined && { config: { ...existing.config, ...input.config } as Connection['config'] }),
    ...(input.capabilities !== undefined && { capabilities: input.capabilities }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.enabled !== undefined && { enabled: input.enabled }),
    ...(input.status !== undefined && { status: input.status }),
    updatedAt: new Date().toISOString(),
  };
  store.connections[idx] = updated;
  writeStore(store);
  return updated;
}

export async function deleteConnection(id: string): Promise<boolean> {
  const store = readStore();
  const idx = store.connections.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.connections.splice(idx, 1);
  writeStore(store);
  return true;
}

// ── 辅助 ──

/** 根据平台类型推断默认能力 */
function inferCapabilities(type: Connection['type']): Connection['capabilities'] {
  switch (type) {
    case 'yonclaw':
      return ['agent-list', 'agent-invoke', 'agent-stream', 'cockpit-plan', 'cockpit-create', 'cockpit-execute', 'event-subscribe'];
    case 'openclaw':
      return ['agent-list', 'agent-invoke', 'agent-stream', 'llm-chat', 'llm-stream', 'cockpit-plan', 'cockpit-create', 'cockpit-execute', 'event-subscribe'];
    case 'hermes':
      return ['event-subscribe', 'event-publish'];
    case 'generic-llm':
      return ['llm-chat', 'llm-stream', 'cockpit-plan'];
    default:
      return [];
  }
}
