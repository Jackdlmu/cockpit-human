// ─── EmptyWelcome ───
// Tabs / Sidebar 模式下无选中驾驶舱时的空状态
// 同时提供驾驶舱列表供快速选择

import { FolderKanban, Plus } from 'lucide-react';
import WorkspaceIcon from '@/components/WorkspaceIcon';

interface WorkspaceItem {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
}

interface Props {
  onCreate: () => void;
  workspaces?: WorkspaceItem[];
  onSelectWorkspace?: (id: string) => void;
}

export default function EmptyWelcome({ onCreate, workspaces, onSelectWorkspace }: Props) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-app-text-subtle gap-4 px-4">
      <div className="w-16 h-16 rounded-2xl bg-app-surface-subtle border border-app-border-subtle flex items-center justify-center">
        <FolderKanban className="w-8 h-8 text-app-text-muted" />
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-sm font-medium text-app-text">还没有打开驾驶舱</h3>
        <p className="text-xs text-app-text-subtle">
          {workspaces && workspaces.length > 0
            ? `当前共有 ${workspaces.length} 个驾驶舱，点击下方列表打开`
            : '点击上方 + 号新建，或从列表中选择驾驶舱'}
        </p>
      </div>
      <button
        onClick={onCreate}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-400 hover:to-orange-400 transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
        新建驾驶舱
      </button>

      {/* 驾驶舱列表（当 workspaces 有数据时显示） */}
      {workspaces && workspaces.length > 0 && onSelectWorkspace && (
        <div className="w-full max-w-md mt-2">
          <div className="text-[11px] text-app-text-subtle uppercase tracking-wider mb-2 text-center">
            可用驾驶舱
          </div>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto scrollbar-hide px-1">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => onSelectWorkspace(ws.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-app-surface border border-app-border-subtle hover:bg-app-surface-hover hover:border-app-border transition-colors text-left"
              >
                <span
                  className="w-8 h-8 flex items-center justify-center rounded-md shrink-0"
                  style={{ backgroundColor: `${ws.color}18` }}
                >
                  <WorkspaceIcon icon={ws.icon} color={ws.color} className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-app-text-secondary truncate">{ws.name}</div>
                  {ws.description && (
                    <div className="text-[10px] text-app-text-subtle truncate">{ws.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
