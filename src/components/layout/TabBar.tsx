// ─── TabBar ───
// 顶部多页签导航栏：支持滚动、关闭、安全区

import { useRef, useEffect } from 'react';
import type { Workspace } from '@/types';
import { Plus, X } from 'lucide-react';
import WorkspaceIcon from '@/components/WorkspaceIcon';

interface Props {
  workspaces: Workspace[];
  openTabs: string[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
}



export default function TabBar({ workspaces, openTabs, activeTabId, onSelect, onClose, onCreate }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 鼠标滚轮横向滚动
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 激活页签滚动到可视区
  useEffect(() => {
    if (!scrollRef.current || !activeTabId) return;
    const activeEl = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTabId]);

  const wsMap = new Map(workspaces.map((w) => [w.id, w]));

  return (
    <div className="h-10 flex items-center bg-app-surface border-b border-app-border-subtle shrink-0 select-none">
      {/* 左侧安全区（macOS 窗口按钮区） */}
      <div className="w-4 shrink-0" />

      {/* 页签滚动区 */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {openTabs.map((tabId) => {
          const ws = wsMap.get(tabId);
          if (!ws) return null;
          const isActive = tabId === activeTabId;
          return (
            <button
              key={tabId}
              data-tab-id={tabId}
              onClick={() => onSelect(tabId)}
              className={`
                group relative flex items-center gap-1.5 px-3 h-10 max-w-[160px] shrink-0
                border-r border-app-border-subtle text-xs transition-colors
                ${isActive
                  ? 'bg-app-bg text-app-text'
                  : 'bg-app-surface text-app-text-muted hover:bg-app-surface-hover hover:text-app-text-secondary'
                }
              `}
            >
              {/* Active bottom line */}
              {isActive && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-red-400 rounded-t-full" />
              )}
              <WorkspaceIcon icon={ws.icon} color={ws.color} className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{ws.name}</span>
              <span
                onClick={(e) => { e.stopPropagation(); onClose(tabId); }}
                className={`
                  ml-0.5 p-0.5 rounded-md opacity-0 group-hover:opacity-100
                  hover:bg-app-text-muted/20 transition-all shrink-0
                  ${isActive ? 'opacity-100' : ''}
                `}
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-1 px-2 shrink-0">
        <button
          onClick={onCreate}
          className="p-1.5 rounded-md text-app-text-subtle hover:bg-app-surface-hover hover:text-app-text-secondary transition-colors"
          title="新建驾驶舱"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* 右侧安全区 */}
      <div className="w-2 shrink-0" />
    </div>
  );
}
