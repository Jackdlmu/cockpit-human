// ─── ConnectionList ───
// 连接列表 + 添加按钮

import { useState } from 'react';
import type { Connection, CreateConnectionInput } from '@/types';
import { Plus } from 'lucide-react';
import ConnectionCard from './ConnectionCard';
import ConnectionForm from './ConnectionForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  connections: Connection[];
  adminStatus: {
    configured: boolean;
    localFallbackEnabled: boolean;
    requiresKey: boolean;
  } | null;
  onCreate: (data: CreateConnectionInput) => Promise<Connection>;
  onUpdate: (id: string, data: Partial<Connection>) => Promise<Connection>;
  onDelete: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<{ success: boolean; message: string }>;
  onTestNew: (data: CreateConnectionInput) => Promise<{ success: boolean; message: string }>;
  onConnect: (id: string) => Promise<Connection>;
  onDisconnect: (id: string) => Promise<Connection>;
}

export default function ConnectionList({
  connections,
  adminStatus,
  onCreate,
  onUpdate,
  onDelete,
  onTest,
  onTestNew,
  onConnect,
  onDisconnect,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [adminKey, setAdminKey] = useState(() => {
    try {
      return localStorage.getItem('adminKey') || '';
    } catch {
      return '';
    }
  });

  const handleCreate = async (data: CreateConnectionInput) => {
    await onCreate(data);
    setShowForm(false);
  };

  const handleUpdate = async (data: CreateConnectionInput) => {
    if (!editing) return;
    await onUpdate(editing.id, data);
    setEditing(null);
  };

  const activeConnections = connections.filter((c) => c.status === 'connected');

  const handleSaveAdminKey = () => {
    try {
      localStorage.setItem('adminKey', adminKey.trim());
    } catch {
      // ignore localStorage failures
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-app-surface-subtle/20 border border-app-border-subtle/60 p-3 space-y-2">
        {adminStatus?.localFallbackEnabled ? (
          <div className="text-[11px] leading-5 text-emerald-400">
            本地开发管理已启用，可直接新增、测试和维护连接。上线部署时请在服务端配置 ADMIN_KEY。
          </div>
        ) : (
          <>
            <div className="text-[11px] text-app-text-subtle">
              连接配置属于管理员操作。请填写服务端配置的 ADMIN_KEY 后再保存、测试或删除连接。
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="输入管理员密钥"
                className="h-8 text-xs bg-app-surface border-app-border-subtle text-app-text-secondary placeholder:text-app-text-subtle"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleSaveAdminKey}
                className="h-8 text-xs border-app-border-subtle text-app-text-muted hover:bg-app-surface-hover hover:text-app-text-secondary"
              >
                保存密钥
              </Button>
            </div>
          </>
        )}
      </div>

      {/* 统计 */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-app-text-subtle">
          共 {connections.length} 个连接
          {activeConnections.length > 0 && (
            <span className="ml-2 text-emerald-400">· {activeConnections.length} 个活跃</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => { setShowForm(true); setEditing(null); }}
          className="h-8 text-xs bg-primary hover:bg-primary/90 text-white border-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          添加连接
        </Button>
      </div>

      {/* 表单 */}
      {(showForm || editing) && (
        <div className="rounded-xl bg-app-surface-subtle/20 border border-app-border-subtle/60 p-4">
          <ConnectionForm
            connection={editing}
            onSubmit={editing ? handleUpdate : handleCreate}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            onTest={onTestNew}
          />
        </div>
      )}

      {/* 列表 */}
      <div className="space-y-3">
        {connections.length === 0 ? (
          <div className="text-center py-8 text-app-text-muted text-sm">
            暂无连接，点击「添加连接」开始配置
          </div>
        ) : (
          connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              onEdit={setEditing}
              onDelete={onDelete}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onTest={onTest}
            />
          ))
        )}
      </div>
    </div>
  );
}
