// ─── Template Store ───
// 驾驶舱模板持久化存储：系统模板（builtin-templates.json）+ 自定义模板（templates.json）

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createJsonFileStore } from '../utils/json-file-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'templates.json');
const BUILTIN_FILE = path.join(DATA_DIR, 'builtin-templates.json');

let builtinCache: any[] | null = null;
const customStore = createJsonFileStore<any[]>({
  filePath: STORE_FILE,
  defaultValue: [],
  label: 'TemplateStore',
});

function readStore(): any[] {
  return customStore.read();
}

function writeStore(data: any[]): void {
  customStore.write(data);
}

function readBuiltinStore(): any[] {
  if (builtinCache) return builtinCache;
  if (!fs.existsSync(BUILTIN_FILE)) {
    builtinCache = [];
    return builtinCache;
  }
  try {
    const raw = fs.readFileSync(BUILTIN_FILE, 'utf-8');
    builtinCache = JSON.parse(raw);
    return builtinCache;
  } catch {
    builtinCache = [];
    return builtinCache;
  }
}

export function listBuiltinTemplates(): any[] {
  return readBuiltinStore().map((t) => ({ ...t, isBuiltin: true }));
}

export function listCustomTemplates(): any[] {
  return readStore();
}

export function listAllTemplates(): any[] {
  const builtins = readBuiltinStore().map((t) => ({ ...t, isBuiltin: true }));
  const customs = readStore();
  const deletedIds = new Set(customs.filter((t) => t._deletedBuiltin).map((t) => t.id));
  const activeCustoms = customs.filter((t) => !t._deletedBuiltin);
  const customIds = new Set(activeCustoms.map((t) => t.id));
  // 自定义模板覆盖系统模板，已删除的系统模板被过滤
  return [
    ...builtins.filter((t) => !customIds.has(t.id) && !deletedIds.has(t.id)),
    ...activeCustoms.map((t) => ({ ...t, isBuiltin: false })),
  ];
}

export function getCustomTemplate(id: string): any | undefined {
  return readStore().find((t) => t.id === id);
}

export function getTemplate(id: string): any | undefined {
  const store = readStore();
  const custom = store.find((t) => t.id === id);
  if (custom && !custom._deletedBuiltin) return { ...custom, isBuiltin: false };
  const deleted = store.some((t) => t.id === id && t._deletedBuiltin);
  if (deleted) return undefined;
  const builtin = readBuiltinStore().find((t) => t.id === id);
  if (builtin) return { ...builtin, isBuiltin: true };
  return undefined;
}

export function createCustomTemplate(template: any): any {
  const store = readStore();
  if (store.some((t) => t.id === template.id)) {
    throw new Error(`Template ID "${template.id}" already exists`);
  }
  const entry = { ...template, _custom: true, createdAt: new Date().toISOString() };
  store.push(entry);
  writeStore(store);
  return entry;
}

export function updateCustomTemplate(id: string, patch: any): any | undefined {
  const store = readStore();
  const idx = store.findIndex((t) => t.id === id);
  if (idx === -1) return undefined;
  store[idx] = { ...store[idx], ...patch, updatedAt: new Date().toISOString() };
  writeStore(store);
  return store[idx];
}

export function deleteCustomTemplate(id: string): boolean {
  const store = readStore();
  const idx = store.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  store.splice(idx, 1);
  writeStore(store);
  return true;
}

/** 编辑模板（支持系统模板 → 自动转自定义覆盖） */
export function updateTemplate(id: string, patch: any): any | undefined {
  const store = readStore();
  const idx = store.findIndex((t) => t.id === id);
  if (idx !== -1) {
    // 已有自定义模板（包括已删除标记），直接更新
    const existing = store[idx];
    if (existing._deletedBuiltin) {
      // 被删除的系统模板重新激活并更新
      const builtin = readBuiltinStore().find((t) => t.id === id);
      const base = builtin ? { ...builtin } : {};
      store[idx] = { ...base, ...patch, isBuiltin: false, _custom: true, updatedAt: new Date().toISOString() };
    } else {
      store[idx] = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    }
    writeStore(store);
    return store[idx];
  }
  // 没有自定义模板，从系统模板复制创建
  const builtin = readBuiltinStore().find((t) => t.id === id);
  if (!builtin) return undefined;
  const entry = { ...builtin, ...patch, isBuiltin: false, _custom: true, createdAt: new Date().toISOString() };
  store.push(entry);
  writeStore(store);
  return entry;
}

/** 删除系统模板（通过标记方式） */
export function deleteBuiltinTemplate(id: string): boolean {
  const store = readStore();
  const idx = store.findIndex((t) => t.id === id);
  if (idx !== -1) {
    // 已有同名自定义模板，直接标记为删除
    store[idx] = { ...store[idx], _deletedBuiltin: true, updatedAt: new Date().toISOString() };
  } else {
    store.push({ id, _deletedBuiltin: true, updatedAt: new Date().toISOString() });
  }
  writeStore(store);
  return true;
}
