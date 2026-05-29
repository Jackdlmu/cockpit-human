// ─── SidebarNav ───
// 左侧驾驶舱导航栏：支持展开/折叠、滚动、选中高亮

import { useState } from 'react';
import type { Workspace } from '@/types';
import {
  Plus, Settings, PanelLeft, PanelLeftDashed,
} from 'lucide-react';
import WorkspaceIcon from '@/components/WorkspaceIcon';

interface Props {
  workspaces: Workspace[];
  selectedId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onSettings: () => void;
}

function WsIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <span
      className="w-7 h-7 flex items-center justify-center rounded-md text-sm shrink-0"
      style={{ backgroundColor: `${color}18` }}
    >
      <WorkspaceIcon icon={icon} color={color} className="w-4 h-4" />
    </span>
  );
}

export default function SidebarNav({
  workspaces,
  selectedId,
  collapsed,
  onToggleCollapse,
  onSelect,
  onCreate,
  onSettings,
}: Props) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const showTooltip = (text: string, e: React.MouseEvent) => {
    if (!collapsed) return;
    setTooltip(text);
    setTooltipPos({ x: e.clientX + 12, y: e.clientY });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <>
      <aside
        className={`
          h-screen flex flex-col border-r border-app-border-subtle bg-app-surface
          transition-all duration-200 ease-in-out shrink-0
          ${collapsed ? 'w-14' : 'w-56'}
        `}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-app-border-subtle shrink-0">
          {!collapsed && (
            <div className="flex items-center gap-2 overflow-hidden">
              <WorkspaceIcon icon="Layers" color="#6366f1" className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold text-app-text truncate">驾驶舱</span>
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg hover:bg-app-surface-hover text-app-text-subtle transition-colors"
            title={collapsed ? '展开' : '折叠'}
          >
            {collapsed ? <PanelLeftDashed className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Workspace List */}
        <div className="flex-1 overflow-y-auto sidebar-scroll py-2 space-y-0.5">
          {workspaces.length === 0 && !collapsed && (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px] text-app-text-subtle">暂无驾驶舱</p>
            </div>
          )}
          {workspaces.map((ws) => {
            const isActive = ws.id === selectedId;
            return (
              <button
                key={ws.id}
                onClick={() => onSelect(ws.id)}
                onMouseEnter={(e) => showTooltip(ws.name, e)}
                onMouseMove={(e) => showTooltip(ws.name, e)}
                onMouseLeave={hideTooltip}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2 mx-0 text-left transition-colors relative
                  ${isActive
                    ? 'bg-red-500/8 text-app-text'
                    : 'text-app-text-muted hover:bg-app-surface-hover hover:text-app-text-secondary'
                  }
                  ${collapsed ? 'justify-center px-0' : ''}
                `}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-red-400 rounded-r-full" />
                )}
                <WsIcon icon={ws.icon} color={ws.color} />
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{ws.name}</div>
                    <div className="text-[10px] text-app-text-subtle truncate">{ws.description || '智能驾驶舱'}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="border-t border-app-border-subtle p-2 space-y-1 shrink-0">
          <button
            onClick={onCreate}
            className={`
              w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs
              bg-gradient-to-r from-red-500 to-orange-500 text-white
              hover:from-red-400 hover:to-orange-400 transition-all
              ${collapsed ? 'justify-center' : ''}
            `}
            title="新建驾驶舱"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && <span>新建驾驶舱</span>}
          </button>
          <button
            onClick={onSettings}
            className={`
              w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs
              text-app-text-muted hover:bg-app-surface-hover hover:text-app-text-secondary transition-colors
              ${collapsed ? 'justify-center' : ''}
            `}
            title="设置"
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && <span>设置</span>}
          </button>
        </div>
      </aside>

      {/* Collapsed tooltip */}
      {tooltip && collapsed && (
        <div
          className="fixed z-[100] px-2 py-1 rounded-md bg-app-surface-elevated border border-app-border-subtle text-xs text-app-text shadow-lg pointer-events-none"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          {tooltip}
        </div>
      )}
    </>
  );
}
