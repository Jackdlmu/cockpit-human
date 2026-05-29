// ─── TabBar ───
// 浏览器风格顶部多页签导航栏

import { useRef, useEffect } from 'react';
import type { Workspace } from '@/types';
import { Plus, X, Settings } from 'lucide-react';
import WorkspaceIcon from '@/components/WorkspaceIcon';

interface Props {
  workspaces: Workspace[];
  openTabs: string[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
  onSettings?: () => void;
}

export default function TabBar({ workspaces, openTabs, activeTabId, onSelect, onClose, onCreate, onSettings }: Props) {
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
    <div className="h-[38px] flex items-end bg-app-surface border-b border-app-border-subtle shrink-0 select-none">
      {/* 左侧安全区（macOS 窗口按钮区） */}
      <div className="w-3 shrink-0" />

      {/* 页签滚动区 */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-end overflow-x-auto scrollbar-hide"
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
                group relative flex items-center gap-1.5 px-3 h-[32px] max-w-[180px] min-w-[80px] shrink-0
                text-xs transition-all rounded-t-md mx-[2px]
                ${isActive
                  ? 'bg-app-bg text-app-text border-t border-x border-app-border-subtle'
                  : 'bg-app-surface text-app-text-muted hover:bg-app-surface-hover hover:text-app-text-secondary'
                }
              `}
            >
              <WorkspaceIcon icon={ws.icon} color={ws.color} className="w-3 h-3 shrink-0" />
              <span className="truncate flex-1 text-left">{ws.name}</span>
              <span
                onClick={(e) => { e.stopPropagation(); onClose(tabId); }}
                className={`
                  p-0.5 rounded-full transition-all shrink-0
                  ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                  hover:bg-red-500/20 hover:text-red-400
                `}
                title="删除驾驶舱"
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center gap-0.5 px-1.5 pb-1 shrink-0">
        <button
          onClick={onCreate}
          className="p-1 rounded-md text-app-text-subtle hover:bg-app-surface-hover hover:text-app-text-secondary transition-colors"
          title="新建驾驶舱"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        {onSettings && (
          <button
            onClick={onSettings}
            className="p-1 rounded-md text-app-text-subtle hover:bg-app-surface-hover hover:text-app-text-secondary transition-colors"
            title="设置"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 右侧安全区 */}
      <div className="w-2 shrink-0" />
    </div>
  );
}
