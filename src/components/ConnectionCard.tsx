// ─── ConnectionCard ───
// 单个连接的状态卡片

import { useState } from 'react';
import type { Connection } from '@/types';
import { Power, PowerOff, RefreshCw, Trash2, Edit3, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  connection: Connection;
  onEdit: (conn: Connection) => void;
  onDelete: (id: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onTest: (id: string) => Promise<{ success: boolean; message: string }>;
}

const typeLabels: Record<string, string> = {
  yonclaw: 'YonClaw',
  openclaw: 'OpenClaw',
  hermes: 'Hermes',
  'generic-llm': '通用大模型',
};

const typeIcons: Record<string, string> = {
  yonclaw: '🦅',
  openclaw: '🦞',
  hermes: '📡',
  'generic-llm': '🧠',
};

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  connected: { icon: <CheckCircle className="w-3 h-3" />, color: 'text-emerald-400', label: '已连接' },
  disconnected: { icon: <XCircle className="w-3 h-3" />, color: 'text-app-text-subtle', label: '未连接' },
  error: { icon: <AlertCircle className="w-3 h-3" />, color: 'text-red-400', label: '错误' },
  connecting: { icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-amber-400', label: '连接中' },
};

export default function ConnectionCard({ connection, onEdit, onDelete, onConnect, onDisconnect, onTest }: Props) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const status = statusConfig[connection.status] || statusConfig.disconnected;
  const isConnected = connection.status === 'connected';

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(connection.id);
      setTestResult(result.message);
      setTimeout(() => setTestResult(null), 4000);
    } catch (err: unknown) {
      setTestResult(err instanceof Error ? err.message : '测试失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-xl bg-app-surface border border-app-border-subtle shadow-[0_1px_3px_rgba(0,0,0,0.18)] p-4 hover:border-app-border hover:shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">{typeIcons[connection.type] || '🔗'}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-app-text-secondary">{connection.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-app-surface-hover ${status.color} flex items-center gap-1`}>
                {status.icon}
                {status.label}
              </span>
            </div>
            <div className="text-[11px] text-app-text-muted mt-0.5">
              {typeLabels[connection.type] || connection.type}
              {' · '}
              {connection.config.protocol === 'websocket' ? 'WS' : connection.config.protocol?.toUpperCase() || 'HTTP'}
              {' · '}
              {connection.config.endpoint}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isConnected ? (
            <button
              onClick={() => onDisconnect(connection.id)}
              className="p-1.5 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted transition-colors"
              title="断开连接"
            >
              <PowerOff className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => onConnect(connection.id)}
              className="p-1.5 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-emerald-400 transition-colors"
              title="连接"
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleTest}
            disabled={testing}
            className="p-1.5 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted transition-colors disabled:opacity-50"
            title="测试连接"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => onEdit(connection)}
            className="p-1.5 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted transition-colors"
            title="编辑"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(connection.id)}
            className="p-1.5 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-red-400 transition-colors"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 能力标签 */}
      {connection.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {connection.capabilities.map((cap) => (
            <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded bg-app-surface-hover text-app-text-subtle">
              {cap}
            </span>
          ))}
        </div>
      )}

      {/* 测试结果 */}
      {testResult && (
        <div className={`mt-2 text-[11px] ${testResult.includes('失败') || testResult.includes('error') || testResult.includes('invalid') || testResult.includes('unauthorized') || testResult.includes('认证') ? 'text-red-400' : 'text-emerald-400'}`}>
          {testResult}
        </div>
      )}

      {/* 元信息 */}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-app-text-subtle">
        <span>优先级: {connection.priority}</span>
        {connection.lastHealthCheck && (
          <span>健康检查: {new Date(connection.lastHealthCheck).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
}
