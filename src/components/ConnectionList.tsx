// ─── ConnectionList ───
// 连接列表 + 添加按钮

import { useState } from 'react';
import type { Connection, CreateConnectionInput } from '@/types';
import { Plus } from 'lucide-react';
import ConnectionCard from './ConnectionCard';
import ConnectionForm from './ConnectionForm';
import { Button } from '@/components/ui/button';

interface Props {
  connections: Connection[];
  onCreate: (data: CreateConnectionInput) => Promise<void>;
  onUpdate: (id: string, data: Partial<Connection>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<{ success: boolean; message: string }>;
  onTestNew: (data: CreateConnectionInput) => Promise<{ success: boolean; message: string }>;
  onConnect: (id: string) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
}

export default function ConnectionList({
  connections,
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

  return (
    <div className="space-y-4">
      {/* 统计 */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/30">
          共 {connections.length} 个连接
          {activeConnections.length > 0 && (
            <span className="ml-2 text-emerald-400">· {activeConnections.length} 个活跃</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => { setShowForm(true); setEditing(null); }}
          className="h-8 text-xs bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white border-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          添加连接
        </Button>
      </div>

      {/* 表单 */}
      {(showForm || editing) && (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
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
          <div className="text-center py-8 text-white/20 text-sm">
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
