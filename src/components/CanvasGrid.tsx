import { useMemo } from 'react';
import { GridLayout, useContainerWidth, verticalCompactor, noCompactor } from 'react-grid-layout';
import type { Widget } from '@/types';
import { X } from 'lucide-react';
import { ErrorBoundary, WidgetErrorFallback } from './ErrorBoundary';

interface CanvasGridProps {
  widgets: Widget[];
  isEditing: boolean;
  onLayoutChange: (widgets: Widget[]) => void;
  onDeleteWidget: (widgetId: string) => void;
  renderWidget: (widget: Widget) => React.ReactNode;
  /** 是否自动缩放 widgets 填满 12 列（分组模式下建议 false） */
  autoScale?: boolean;
}

export function CanvasGrid({
  widgets,
  isEditing,
  onLayoutChange,
  onDeleteWidget,
  renderWidget,
  autoScale = true,
}: CanvasGridProps) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });

  const displayWidgets = useMemo(() => {
    if (isEditing || widgets.length === 0 || !autoScale) return widgets;
    const maxRight = Math.max(...widgets.map((w) => w.position.x + w.position.w));
    if (maxRight <= 0 || maxRight >= 12) return widgets;
    const scale = 12 / maxRight;
    return widgets.map((widget) => {
      const x = Math.max(0, Math.min(11, Math.floor(widget.position.x * scale)));
      const isRightEdge = widget.position.x + widget.position.w === maxRight;
      const scaledW = isRightEdge ? 12 - x : Math.round(widget.position.w * scale);
      const w = Math.max(1, Math.min(12 - x, scaledW));
      return {
        ...widget,
        position: { ...widget.position, x, w },
      };
    });
  }, [isEditing, widgets, autoScale]);

  const layout = useMemo(
    () =>
      displayWidgets.map((w) => ({
        i: w.id,
        x: w.position.x,
        y: w.position.y,
        w: w.position.w,
        h: w.position.h,
        minW: 1,
        minH: 1,
        maxW: 12,
      })),
    [displayWidgets]
  );

  const handleLayoutChange = (newLayout: readonly { i: string; x: number; y: number; w: number; h: number }[]) => {
    if (!isEditing) return;
    const updated = widgets.map((w) => {
      const l = newLayout.find((item) => item.i === w.id);
      if (!l) return w;
      return {
        ...w,
        position: { x: l.x, y: l.y, w: l.w, h: l.h },
      };
    });
    onLayoutChange(updated);
  };

  return (
    <div ref={containerRef} className="w-full h-full">
      {mounted && (
        <GridLayout
          className="canvas-grid"
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 60, margin: [12, 12], containerPadding: [0, 0], maxRows: Infinity }}
          width={width}
          dragConfig={{ enabled: isEditing, bounded: false, handle: '.widget-drag-handle' }}
          resizeConfig={{ enabled: isEditing }}
          compactor={isEditing ? noCompactor : verticalCompactor}
          onLayoutChange={(newLayout) => handleLayoutChange(newLayout)}
        >
          {displayWidgets.map((widget) => (
            <div
              key={widget.id}
              className={`relative group ${isEditing ? 'widget-editing' : ''}`}
              data-widget-id={widget.id}
            >
              {/* 编辑模式下的删除按钮 */}
              {isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteWidget(widget.id);
                  }}
                  className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-md transition-opacity hover:bg-red-600 group-hover:opacity-100"
                  title="删除 Widget"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* 编辑模式下的拖拽手柄指示器 */}
              {isEditing && (
                <div className="widget-drag-handle absolute left-3 right-3 top-2 z-10 flex h-5 cursor-move items-center justify-center rounded-md border border-dashed border-primary/25 bg-app-surface/80 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">
                  <div className="h-1 w-10 rounded-full bg-primary/35" />
                </div>
              )}

              {/* Widget 内容 — 每个 Widget 独立错误边界 */}
              <div className={`h-full ${isEditing ? 'pt-6' : ''}`}>
                <ErrorBoundary
                  fallback={<WidgetErrorFallback type={widget.type} title={widget.title} />}
                  context={{ widgetType: widget.type, widgetTitle: widget.title, widgetId: widget.id }}
                >
                  {renderWidget(widget)}
                </ErrorBoundary>
              </div>
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  );
}
