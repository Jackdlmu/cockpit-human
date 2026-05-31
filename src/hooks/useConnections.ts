// ─── useConnections hook ───
// 连接数据的获取与管理

import { useState, useEffect, useCallback } from 'react';
import type { Connection, CreateConnectionInput } from '@/types';
import { toast } from 'sonner';
import {
  getConnections,
  getConnectionAdminStatus,
  createConnection as apiCreate,
  updateConnection as apiUpdate,
  deleteConnection as apiDelete,
  testConnection as apiTest,
  testConnectionConfig as apiTestConfig,
  connectConnection,
  disconnectConnection,
} from '@/api/client';

export function useConnections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [adminStatus, setAdminStatus] = useState<{
    configured: boolean;
    localFallbackEnabled: boolean;
    requiresKey: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, status] = await Promise.all([
        getConnections(),
        getConnectionAdminStatus().catch(() => null),
      ]);
      setConnections(data.connections);
      setAdminStatus(status);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取连接列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (input: CreateConnectionInput) => {
    const data = await apiCreate(input);
    await refresh();
    toast.success(`连接「${data.connection.name}」已创建`);
    // 自动连接并测试新创建的连接
    try {
      if (data.connection.enabled) {
        await connectConnection(data.connection.id);
        await refresh();
      }
      const testRes = await apiTest(data.connection.id);
      if (testRes.success) {
        toast.success('连接测试通过', { description: testRes.message });
      } else {
        toast.warning('连接测试未通过', { description: testRes.message });
      }
    } catch (err: unknown) {
      toast.error('连接测试失败', { description: err instanceof Error ? err.message : String(err) });
    }
    return data.connection;
  }, [refresh]);

  const update = useCallback(async (id: string, updates: Partial<Connection>) => {
    const data = await apiUpdate(id, updates);
    await refresh();
    toast.success(`连接「${data.connection.name}」已更新`);
    return data.connection;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await apiDelete(id);
    await refresh();
    toast.success('连接已删除');
  }, [refresh]);

  const test = useCallback(async (id: string) => {
    return apiTest(id);
  }, []);

  /** 测试新配置（不创建持久化连接） */
  const testNew = useCallback(async (input: CreateConnectionInput) => {
    return apiTestConfig({ type: input.type, config: input.config });
  }, []);

  const connect = useCallback(async (id: string) => {
    try {
      const data = await connectConnection(id);
      await refresh();
      toast.success(`连接「${data.connection.name}」已连接`);
      return data.connection;
    } catch (err: unknown) {
      toast.error('连接失败', { description: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }, [refresh]);

  const disconnect = useCallback(async (id: string) => {
    try {
      const data = await disconnectConnection(id);
      await refresh();
      toast.success(`连接「${data.connection.name}」已断开`);
      return data.connection;
    } catch (err: unknown) {
      toast.error('断开连接失败', { description: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }, [refresh]);

  return {
    connections,
    adminStatus,
    loading,
    error,
    refresh,
    create,
    update,
    remove,
    test,
    testNew,
    connect,
    disconnect,
  };
}
