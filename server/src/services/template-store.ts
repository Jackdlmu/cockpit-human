// ─── Template Store ───
// 自定义驾驶舱模板持久化存储（JSON 文件）
// 内置模板保留在代码中，自定义模板存储在 data/templates.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'templates.json');

let cache: any[] | null = null;

function readStore(): any[] {
  if (cache) return cache;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
  const raw = fs.readFileSync(STORE_FILE, 'utf-8');
  try {
    cache = JSON.parse(raw);
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}

function writeStore(data: any[]): void {
  cache = data;
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, STORE_FILE);
}

export function listCustomTemplates(): any[] {
  return readStore();
}

export function getCustomTemplate(id: string): any | undefined {
  return readStore().find((t) => t.id === id);
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
