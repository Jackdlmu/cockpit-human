import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.jsonl');

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  source: string;
  action: string;
  targetType: string;
  targetId?: string;
  status: 'success' | 'failure';
  details?: Record<string, unknown>;
}

function ensureAuditFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(AUDIT_FILE)) {
    fs.writeFileSync(AUDIT_FILE, '', 'utf-8');
  }
}

export function recordAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
  try {
    ensureAuditFile();
    const payload: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(payload)}\n`, 'utf-8');
  } catch (err) {
    console.error('[AuditLog] Failed to write audit event:', err);
  }
}
