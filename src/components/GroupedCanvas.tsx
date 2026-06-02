import { useState, useEffect, useRef, useCallback } from 'react';
import type { Widget, WorkspaceGrouping } from '@/types';
import { CanvasGrid } from './CanvasGrid';

interface GroupedCanvasProps {
  widgets: Widget[];
  grouping: WorkspaceGrouping;
  isEditing?: boolean;
  onLayoutChange: (widgets: Widget[]) => void;
  onDeleteWidget: (widgetId: string) => void;
  renderWidget: (widget: Widget) => React.ReactNode;
  /** 跨组移动组件 */
  onMoveWidgetToGroup?: (widgetId: string, groupId: string | null) => void;
}

function getGroupWidgets(widgets: Widget[], groupWidgetIds: string[]): Widget[] {
  const widgetMap = new Map(widgets.map((w) => [w.id, w]));
  return groupWidgetIds
    .map((id) => widgetMap.get(id))
    .filter((w): w is Widget => !!w);
}

function GroupTabs({
  groups,
  activeId,
  onChange,
  isEditing,
  dragOverGroupId,
}: {
  groups: Array<{ id: string; name: string; widgetIds: string[] }>;
  activeId: string;
  onChange: (id: string) => void;
  isEditing?: boolean;
  dragOverGroupId: string | null;
}) {
  return (
    <div className="sticky top-0 z-10 bg-app-surface/95 backdrop-blur-sm border-b border-app-border-subtle px-5 py-2">
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {groups.map((group) => (
          <button
            key={group.id}
            data-group-tab={group.id}
            onClick={() => onChange(group.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors relative ${
              activeId === group.id
                ? 'bg-primary/10 text-primary'
                : 'text-app-text-muted hover:text-app-text-secondary hover:bg-app-surface-hover'
            } ${dragOverGroupId === group.id && isEditing ? 'ring-2 ring-primary/40 ring-offset-1' : ''}`}
          >
            {group.name}
            {isEditing && (
              <span className="ml-1 text-[10px] opacity-60">({group.widgetIds?.length || 0})</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GroupedCanvas({
  widgets,
  grouping,
  isEditing,
  onLayoutChange,
  onDeleteWidget,
  renderWidget,
  onMoveWidgetToGroup,
}: GroupedCanvasProps) {
  const [activeGroupId, setActiveGroupId] = useState<string>(grouping.groups?.[0]?.id || '');
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // tabs-flow: track scroll position to update active tab
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const groupId = entry.target.getAttribute('data-group-id');
            if (groupId) setActiveGroupId(groupId);
          }
        }
      },
      { root: container, threshold: 0.3 }
    );

    const sections = container.querySelectorAll('[data-group-id]');
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [widgets]);

  const handleTabChange = (groupId: string) => {
    setActiveGroupId(groupId);
    const el = document.getElementById(`group-${groupId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleWidgetDragStart = useCallback((widgetId: string) => {
    setDraggingWidgetId(widgetId);
    // 高亮组件当前所在组
    for (const g of grouping.groups || []) {
      if (g.widgetIds.includes(widgetId)) {
        setDragOverGroupId(g.id);
        break;
      }
    }
  }, [grouping.groups]);

  const handleWidgetDragEnd = useCallback(() => {
    setDraggingWidgetId(null);
    setDragOverGroupId(null);
  }, []);

  const handleDropOnGroup = useCallback((targetGroupId: string | null) => {
    if (draggingWidgetId && onMoveWidgetToGroup) {
      onMoveWidgetToGroup(draggingWidgetId, targetGroupId);
    }
    setDraggingWidgetId(null);
    setDragOverGroupId(null);
  }, [draggingWidgetId, onMoveWidgetToGroup]);

  // 全局 dragover：高亮悬停的组 tab 或组标题
  useEffect(() => {
    if (!isEditing) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      const target = e.target as HTMLElement;

      // 检查是否在组 tab 上
      const tab = target.closest('[data-group-tab]') as HTMLElement | null;
      if (tab) {
        const gid = tab.getAttribute('data-group-tab');
        if (gid) {
          setDragOverGroupId(gid);
          e.dataTransfer && (e.dataTransfer.dropEffect = 'move');
          return;
        }
      }

      // 检查是否在组标题区域
      const section = target.closest('[data-group-id]') as HTMLElement | null;
      if (section) {
        const gid = section.getAttribute('data-group-id');
        if (gid && gid !== 'ungrouped') {
          setDragOverGroupId(gid);
          e.dataTransfer && (e.dataTransfer.dropEffect = 'move');
          return;
        }
      }

      setDragOverGroupId(null);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const target = e.target as HTMLElement;

      // 检查是否在组 tab 上
      const tab = target.closest('[data-group-tab]') as HTMLElement | null;
      if (tab) {
        const gid = tab.getAttribute('data-group-tab');
        if (gid) {
          handleDropOnGroup(gid);
          return;
        }
      }

      // 检查是否在组标题区域
      const section = target.closest('[data-group-id]') as HTMLElement | null;
      if (section) {
        const gid = section.getAttribute('data-group-id');
        if (gid === 'ungrouped') {
          handleDropOnGroup(null);
        } else if (gid) {
          handleDropOnGroup(gid);
        }
        return;
      }

      setDraggingWidgetId(null);
      setDragOverGroupId(null);
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [isEditing, handleDropOnGroup]);

  const groupedIds = new Set(grouping.groups?.flatMap((g) => g.widgetIds) || []);
  const ungroupedWidgets = widgets.filter((w) => !groupedIds.has(w.id));

  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      <GroupTabs
        groups={grouping.groups || []}
        activeId={activeGroupId}
        onChange={handleTabChange}
        isEditing={isEditing}
        dragOverGroupId={dragOverGroupId}
      />
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto sidebar-scroll p-5 pb-28 space-y-8">
        {grouping.groups?.map((group) => {
          const groupWidgets = getGroupWidgets(widgets, group.widgetIds);
          if (groupWidgets.length === 0 && !isEditing) return null;
          return (
            <div
              key={group.id}
              id={`group-${group.id}`}
              data-group-id={group.id}
              className={`transition-colors ${dragOverGroupId === group.id && isEditing ? 'rounded-xl bg-primary/5 p-2 -m-2' : ''}`}
            >
              {/* 组标题 */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <h3 className="text-sm font-semibold text-app-text-secondary uppercase tracking-wider">
                  {group.name}
                </h3>
                {isEditing && (
                  <span className="text-[10px] text-app-text-subtle">{groupWidgets.length} 个组件</span>
                )}
              </div>
              {groupWidgets.length > 0 ? (
                <CanvasGrid
                  widgets={groupWidgets}
                  isEditing={!!isEditing}
                  onLayoutChange={(changedGroupWidgets) => {
                    // 将组内变更合并回全量 widgets，避免覆盖其他组
                    const changedMap = new Map(changedGroupWidgets.map((w) => [w.id, w]));
                    onLayoutChange(widgets.map((w) => changedMap.get(w.id) || w));
                  }}
                  onDeleteWidget={onDeleteWidget}
                  renderWidget={renderWidget}
                  onWidgetDragStart={handleWidgetDragStart}
                  onWidgetDragEnd={handleWidgetDragEnd}
                />
              ) : isEditing ? (
                <div className="rounded-lg border-2 border-dashed border-app-border-subtle/40 bg-app-surface-subtle/20 p-6 text-center text-xs text-app-text-subtle">
                  空组，将组件拖入此处
                </div>
              ) : null}
            </div>
          );
        })}

        {/* 编辑模式：未分组组件区域 */}
        {isEditing && ungroupedWidgets.length > 0 && (
          <div
            data-group-id="ungrouped"
            className={`transition-colors ${dragOverGroupId === null && draggingWidgetId ? 'rounded-xl bg-app-surface-subtle/40 p-2 -m-2' : ''}`}
          >
            <div className="flex items-center gap-2 mb-3 px-1">
              <h3 className="text-sm font-semibold text-app-text-muted uppercase tracking-wider">未分组</h3>
              <span className="text-[10px] text-app-text-subtle">{ungroupedWidgets.length} 个组件</span>
            </div>
            <div className="rounded-xl border-2 border-dashed border-app-border-subtle/60 bg-app-surface-subtle/20 p-4">
              <CanvasGrid
                widgets={ungroupedWidgets}
                isEditing={true}
                onLayoutChange={(changedGroupWidgets) => {
                  const changedMap = new Map(changedGroupWidgets.map((w) => [w.id, w]));
                  onLayoutChange(widgets.map((w) => changedMap.get(w.id) || w));
                }}
                onDeleteWidget={onDeleteWidget}
                renderWidget={renderWidget}
                onWidgetDragStart={handleWidgetDragStart}
                onWidgetDragEnd={handleWidgetDragEnd}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
