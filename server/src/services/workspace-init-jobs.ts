import path from 'path';
import { fileURLToPath } from 'url';
import type { WorkspaceInitializationRequest, WorkspaceInitResult } from './workspace-initializer';
import { createJsonFileStore } from '../utils/json-file-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'workspace-init-jobs.json');

export type WorkspaceInitJobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface WorkspaceInitJob {
  id: string;
  workspaceId: string;
  workspaceName: string;
  initializationMode: 'llm' | 'real-data';
  status: WorkspaceInitJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  request: WorkspaceInitializationRequest;
  result?: WorkspaceInitResult;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

interface WorkspaceInitJobPayload {
  jobs: WorkspaceInitJob[];
}

const store = createJsonFileStore<WorkspaceInitJobPayload>({
  filePath: STORE_FILE,
  defaultValue: { jobs: [] },
  label: 'WorkspaceInitJobs',
});

function readJobs(): WorkspaceInitJob[] {
  return store.read().jobs || [];
}

function writeJobs(jobs: WorkspaceInitJob[]): void {
  store.write({ jobs });
}

export function listWorkspaceInitJobs(): WorkspaceInitJob[] {
  return readJobs();
}

export function getWorkspaceInitJob(id: string): WorkspaceInitJob | undefined {
  return readJobs().find((job) => job.id === id);
}

export function getRunningWorkspaceInitJob(workspaceId: string): WorkspaceInitJob | undefined {
  return readJobs().find((job) => job.workspaceId === workspaceId && (job.status === 'pending' || job.status === 'running'));
}

export function createWorkspaceInitJob(
  request: WorkspaceInitializationRequest,
  initializationMode: 'llm' | 'real-data',
  maxAttempts = 2
): WorkspaceInitJob {
  const now = new Date().toISOString();
  const job: WorkspaceInitJob = {
    id: `ws-init-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: request.workspaceId,
    workspaceName: request.workspaceName,
    initializationMode,
    status: 'pending',
    attempts: 0,
    maxAttempts,
    request,
    createdAt: now,
    updatedAt: now,
  };

  writeJobs([...readJobs(), job]);
  return job;
}

export function updateWorkspaceInitJob(id: string, patch: Partial<WorkspaceInitJob>): WorkspaceInitJob | undefined {
  const jobs = readJobs();
  const index = jobs.findIndex((job) => job.id === id);
  if (index === -1) {
    return undefined;
  }
  const next: WorkspaceInitJob = {
    ...jobs[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  jobs[index] = next;
  writeJobs(jobs);
  return next;
}

export function listRecoverableWorkspaceInitJobs(): WorkspaceInitJob[] {
  return readJobs().filter((job) => job.status === 'pending' || job.status === 'running');
}
