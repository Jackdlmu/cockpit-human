import path from 'path';
import { fileURLToPath } from 'url';
import type { Connection, ConnectionConfig, CreateConnectionInput, UpdateConnectionInput } from './types';
import { cloneJson, createJsonFileStore } from '../utils/json-file-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'connections.json');
const SECRET_FILE = path.join(DATA_DIR, 'connection-secrets.json');

type StoredConnection = Omit<Connection, 'config' | 'hasSecret'> & {
  config: ConnectionConfig;
};

interface ConnectionStorePayload {
  connections: StoredConnection[];
}

interface SecretStorePayload {
  secrets: Record<string, Partial<ConnectionConfig>>;
}

const connectionStore = createJsonFileStore<ConnectionStorePayload>({
  filePath: STORE_FILE,
  defaultValue: { connections: [] },
  label: 'ConnectionStore',
});

const secretStore = createJsonFileStore<SecretStorePayload>({
  filePath: SECRET_FILE,
  defaultValue: { secrets: {} },
  label: 'ConnectionSecretStore',
});

const SECRET_FIELDS = ['apiKey', 'token', 'pat'] as const;

function isSecretField(key: string): key is typeof SECRET_FIELDS[number] {
  return SECRET_FIELDS.includes(key as typeof SECRET_FIELDS[number]);
}

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

function pickSecrets(config: Partial<ConnectionConfig>): Partial<ConnectionConfig> {
  const secrets: Partial<ConnectionConfig> = {};
  for (const [key, value] of Object.entries(config)) {
    if (isSecretField(key) && typeof value === 'string' && value.trim()) {
      (secrets as Record<string, string>)[key] = value.trim();
    }
  }
  return secrets;
}

function stripSecrets<T extends Partial<ConnectionConfig>>(config: T): T {
  const clone = { ...config } as Record<string, unknown>;
  for (const key of SECRET_FIELDS) {
    delete clone[key];
  }
  return clone as T;
}

function mergeConfigWithSecrets(config: ConnectionConfig, secrets?: Partial<ConnectionConfig>): ConnectionConfig {
  return {
    ...config,
    ...(secrets || {}),
  } as ConnectionConfig;
}

function maskConnection(connection: StoredConnection, secrets: Partial<ConnectionConfig> | undefined): Connection {
  return {
    ...cloneJson(connection),
    config: stripSecrets(connection.config),
    hasSecret: Boolean(secrets && Object.keys(secrets).length > 0),
  };
}

function materializeConnection(connection: StoredConnection): Connection {
  const secrets = getSecretMap()[connection.id];
  return {
    ...cloneJson(connection),
    config: mergeConfigWithSecrets(connection.config, secrets),
    hasSecret: Boolean(secrets && Object.keys(secrets).length > 0),
  };
}

function readMainStore(): ConnectionStorePayload {
  return connectionStore.read();
}

function getSecretMap(): Record<string, Partial<ConnectionConfig>> {
  return secretStore.read().secrets || {};
}

function writeSecretMap(nextSecrets: Record<string, Partial<ConnectionConfig>>): void {
  secretStore.write({ secrets: nextSecrets });
}

function migrateInlineSecrets(): void {
  const main = readMainStore();
  const secretMap = { ...getSecretMap() };
  let mainChanged = false;
  let secretChanged = false;

  const nextConnections = main.connections.map((connection) => {
    const extracted = pickSecrets(connection.config);
    if (Object.keys(extracted).length === 0) {
      return connection;
    }

    secretMap[connection.id] = {
      ...(secretMap[connection.id] || {}),
      ...extracted,
    };
    secretChanged = true;
    mainChanged = true;

    return {
      ...connection,
      config: stripSecrets(connection.config),
    };
  });

  if (secretChanged) {
    writeSecretMap(secretMap);
  }
  if (mainChanged) {
    connectionStore.write({ connections: nextConnections });
  }
}

migrateInlineSecrets();

function listStoredConnections(): StoredConnection[] {
  return readMainStore().connections || [];
}

function buildUpdatedConfig(
  existing: ConnectionConfig,
  incoming?: Partial<ConnectionConfig>
): { publicConfig: ConnectionConfig; secretPatch: Partial<ConnectionConfig> | null } {
  if (!incoming) {
    return { publicConfig: existing, secretPatch: null };
  }

  const publicPatch: Record<string, unknown> = {};
  const secretPatch: Partial<ConnectionConfig> = {};

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) {
      continue;
    }
    if (isSecretField(key)) {
      if (typeof value === 'string' && value.trim()) {
        (secretPatch as Record<string, string>)[key] = value.trim();
      }
      continue;
    }
    publicPatch[key] = value;
  }

  return {
    publicConfig: {
      ...existing,
      ...publicPatch,
    } as ConnectionConfig,
    secretPatch: Object.keys(secretPatch).length > 0 ? secretPatch : null,
  };
}

export async function listConnections(): Promise<Connection[]> {
  return listStoredConnections().map((connection) => maskConnection(connection, getSecretMap()[connection.id]));
}

export async function getConnection(id: string): Promise<Connection | undefined> {
  return getConnectionSync(id, true);
}

export function getConnectionSync(id: string, withSecrets = true): Connection | undefined {
  const connection = listStoredConnections().find((item) => item.id === id);
  if (!connection) {
    return undefined;
  }
  return withSecrets
    ? materializeConnection(connection)
    : maskConnection(connection, getSecretMap()[connection.id]);
}

export async function createConnection(input: CreateConnectionInput): Promise<Connection> {
  const now = new Date().toISOString();
  const id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const publicConfig = stripSecrets(input.config);
  const secrets = pickSecrets(input.config);

  const connection: StoredConnection = {
    id,
    name: input.name,
    type: input.type,
    config: publicConfig,
    status: 'disconnected',
    capabilities: input.capabilities ?? inferCapabilities(input.type),
    priority: input.priority ?? (input.type === 'openclaw' || input.type === 'yonclaw' ? 50 : 100),
    enabled: input.enabled ?? true,
    lastHealthCheck: null,
    createdAt: now,
    updatedAt: now,
  };

  connectionStore.update((current) => ({
    connections: [...current.connections, connection],
  }));

  if (Object.keys(secrets).length > 0) {
    const secretMap = { ...getSecretMap(), [id]: secrets };
    writeSecretMap(secretMap);
  }

  return materializeConnection(connection);
}

export async function updateConnection(id: string, input: UpdateConnectionInput): Promise<Connection | undefined> {
  const existing = listStoredConnections().find((item) => item.id === id);
  if (!existing) {
    return undefined;
  }

  const { publicConfig, secretPatch } = buildUpdatedConfig(existing.config, input.config);

  const updatedConnection: StoredConnection = {
    ...existing,
    ...(input.name !== undefined && { name: input.name }),
    config: publicConfig,
    ...(input.capabilities !== undefined && { capabilities: input.capabilities }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.enabled !== undefined && { enabled: input.enabled }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.lastHealthCheck !== undefined && { lastHealthCheck: input.lastHealthCheck }),
    updatedAt: new Date().toISOString(),
  };

  connectionStore.update((current) => ({
    connections: current.connections.map((item) => (item.id === id ? updatedConnection : item)),
  }));

  if (secretPatch) {
    const secretMap = { ...getSecretMap() };
    secretMap[id] = {
      ...(secretMap[id] || {}),
      ...secretPatch,
    };
    writeSecretMap(secretMap);
  }

  return materializeConnection(updatedConnection);
}

export async function deleteConnection(id: string): Promise<boolean> {
  const existing = listStoredConnections().find((item) => item.id === id);
  if (!existing) {
    return false;
  }

  connectionStore.update((current) => ({
    connections: current.connections.filter((item) => item.id !== id),
  }));

  const secretMap = { ...getSecretMap() };
  if (secretMap[id]) {
    delete secretMap[id];
    writeSecretMap(secretMap);
  }

  return true;
}

export async function waitForConnectionWrites(): Promise<void> {
  await Promise.all([connectionStore.waitForWrites(), secretStore.waitForWrites()]);
}
