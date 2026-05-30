import type { ConnectionManager } from '../connection/manager';
import * as workspaceStore from '../data/workspaceStore';
import type { WorkspaceData } from '../data/workspacesData';
import { eventBus } from './event-bus';
import { detectRealDataIntent, startWorkspaceInitialization } from './workspace-initializer';
import { recordAuditEvent } from './audit-log';
import { contextBuilder } from './context-builder';

export interface WorkspaceCreationSpec extends workspaceStore.CreateWorkspaceSpec {
  initPrompt?: string;
  templateName?: string;
}

export interface WorkspaceCreationOptions {
  source: 'api' | 'cockpit-agent' | 'meta-agent';
  connectionManager?: ConnectionManager;
  initSourceType?: 'template' | 'agent';
  resetAgentsWithoutConnection?: boolean;
  skipLocalInitialization?: boolean;
}

export interface WorkspaceCreationResult {
  workspace: WorkspaceData;
  initializing: boolean;
  initializationMode?: 'llm' | 'real-data';
}

async function resetUnavailableAgents(
  workspace: WorkspaceData,
  connectionManager?: ConnectionManager
): Promise<WorkspaceData> {
  if (!connectionManager) {
    return workspace;
  }

  if ((!workspace.agentIds || workspace.agentIds.length === 0) && !workspace.primaryAgentId) {
    return workspace;
  }

  const hasRealAgentConnection = connectionManager.getAllConnectorsByCapability('agent-invoke').length > 0;
  if (hasRealAgentConnection) {
    return workspace;
  }

  return await workspaceStore.updateWorkspace(workspace.id, {
    agentIds: [],
    primaryAgentId: '',
    agentMode: 'llm-only',
  }) || workspace;
}

export async function createWorkspaceWithLifecycle(
  spec: WorkspaceCreationSpec,
  options: WorkspaceCreationOptions
): Promise<WorkspaceCreationResult> {
  let workspace = await workspaceStore.createWorkspace(spec);

  if (options.resetAgentsWithoutConnection) {
    workspace = await resetUnavailableAgents(workspace, options.connectionManager);
  }

  eventBus.publish({
    id: `evt-${Date.now()}`,
    source: options.source,
    sourceType: 'yonclaw',
    type: 'workspace.created',
    payload: { workspaceId: workspace.id, name: workspace.name },
    timestamp: new Date().toISOString(),
  });

  const initPrompt = typeof spec.initPrompt === 'string' ? spec.initPrompt.trim() : '';
  const initializationMode = initPrompt
    ? (detectRealDataIntent(initPrompt) ? 'real-data' : 'llm')
    : undefined;

  recordAuditEvent({
    actor: options.source,
    source: 'workspace-creation',
    action: 'workspace.create',
    targetType: 'workspace',
    targetId: workspace.id,
    status: 'success',
    details: {
      name: workspace.name,
      executionOwner: workspace.executionOwner || 'cockpit',
      initializationMode,
    },
  });

  if (!options.skipLocalInitialization && initPrompt && Array.isArray(workspace.widgets) && workspace.widgets.length > 0) {
    const initState = startWorkspaceInitialization({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      templateName: spec.templateName || workspace.name,
      initPrompt,
      widgets: workspace.widgets as any[],
      useDemoDataFallback: spec.useDemoDataFallback,
      sourceType: options.initSourceType || 'agent',
    });

    workspace = await workspaceStore.updateWorkspace(workspace.id, {
      initializing: true,
      initializationMode: initState.initializationMode,
      initializationJobId: initState.jobId,
      initializationError: undefined,
    }) || workspace;

    await contextBuilder.build(workspace);

    return {
      workspace,
      initializing: initState.initializing,
      initializationMode: initState.initializationMode,
    };
  }

  await contextBuilder.build(workspace);

  return {
    workspace,
    initializing: false,
    initializationMode,
  };
}
