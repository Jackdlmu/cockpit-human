import { useState, useEffect, useRef } from 'react';
import type { Widget, WorkspaceGrouping } from '@/types';
import { CanvasGrid } from './CanvasGrid';
import { compactGridLayout } from '@/lib/widget-normalizer';

interface GroupedCanvasProps {
  widgets: Widget[];
  grouping: WorkspaceGrouping;
  isEditing: boolean;
  onLayoutChange: (widgets: Widget[]) => void;
  onDeleteWidget: (widgetId: string) => void;
  renderWidget: (widget: Widget) => React.ReactNode;
}

function getGroupWidgets(widgets: Widget[], groupWidgetIds: string[]): Widget[] {
  const idSet = new Set(groupWidgetIds);
  return widgets.filter((w) => idSet.has(w.id));
}

/** 对分组内 widgets 重新做流式紧凑布局 */
function layoutGroupWidgets(widgets: Widget[]): Widget[] {
  if (!widgets || widgets.length === 0) return widgets;
  return compactGridLayout(widgets);
}

function GroupTabs({
  groups,
  activeId,
  onChange,
}: {
  groups: Array<{ id: string; name: string }>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="sticky top-0 z-10 bg-app-surface/95 backdrop-blur-sm border-b border-app-border-subtle px-5 py-2">
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => onChange(group.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeId === group.id
                ? 'bg-primary/10 text-primary'
                : 'text-app-text-muted hover:text-app-text-secondary hover:bg-app-surface-hover'
            }`}
          >
            {group.name}
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
}: GroupedCanvasProps) {
  const [activeGroupId, setActiveGroupId] = useState<string>(grouping.groups?.[0]?.id || '');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // tabs-flow mode: track scroll position to update active tab
  useEffect(() => {
    if (grouping.mode !== 'tabs-flow') return;
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
  }, [grouping.mode, widgets]);

  const handleTabChange = (groupId: string) => {
    setActiveGroupId(groupId);
    if (grouping.mode === 'tabs-flow') {
      const el = document.getElementById(`group-${groupId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  if (grouping.mode === 'tabs') {
    const activeGroup = grouping.groups?.find((g) => g.id === activeGroupId);
    const groupWidgets = activeGroup ? layoutGroupWidgets(getGroupWidgets(widgets, activeGroup.widgetIds)) : [];
    return (
      <div className="flex flex-col flex-1 h-full min-h-0">
        <GroupTabs groups={grouping.groups || []} activeId={activeGroupId} onChange={handleTabChange} />
        <div className="flex-1 overflow-y-auto p-5 pb-28">
          <CanvasGrid
            widgets={groupWidgets}
            isEditing={isEditing}
            onLayoutChange={onLayoutChange}
            onDeleteWidget={onDeleteWidget}
            renderWidget={renderWidget}
            autoScale={false}
          />
        </div>
      </div>
    );
  }

  if (grouping.mode === 'flow') {
    return (
      <div className="flex-1 h-full min-h-0 overflow-y-auto sidebar-scroll p-5 pb-28 space-y-8">
        {grouping.groups?.map((group) => {
          const groupWidgets = layoutGroupWidgets(getGroupWidgets(widgets, group.widgetIds));
          if (groupWidgets.length === 0) return null;
          return (
            <div key={group.id} data-group-id={group.id}>
              <h3 className="text-sm font-semibold text-app-text-secondary uppercase tracking-wider mb-3 px-1">
                {group.name}
              </h3>
              <CanvasGrid
                widgets={groupWidgets}
                isEditing={isEditing}
                onLayoutChange={onLayoutChange}
                onDeleteWidget={onDeleteWidget}
                renderWidget={renderWidget}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // tabs-flow mode (default)
  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      <GroupTabs groups={grouping.groups || []} activeId={activeGroupId} onChange={handleTabChange} />
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto sidebar-scroll p-5 pb-28 space-y-8">
        {grouping.groups?.map((group) => {
          const groupWidgets = layoutGroupWidgets(getGroupWidgets(widgets, group.widgetIds));
          if (groupWidgets.length === 0) return null;
          return (
            <div key={group.id} id={`group-${group.id}`} data-group-id={group.id}>
              <h3 className="text-sm font-semibold text-app-text-secondary uppercase tracking-wider mb-3 px-1">
                {group.name}
              </h3>
              <CanvasGrid
                widgets={groupWidgets}
                isEditing={isEditing}
                onLayoutChange={onLayoutChange}
                onDeleteWidget={onDeleteWidget}
                renderWidget={renderWidget}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
