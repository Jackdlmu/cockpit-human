import { useMemo } from 'react';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import type { Widget } from '@/types';
import { X } from 'lucide-react';
import { ErrorBoundary, WidgetErrorFallback } from './ErrorBoundary';

interface CanvasGridProps {
  widgets: Widget[];
  isEditing: boolean;
  onLayoutChange: (widgets: Widget[]) => void;
  onDeleteWidget: (widgetId: string) => void;
  renderWidget: (widget: Widget) => React.ReactNode;
}

export function CanvasGrid({
  widgets,
  isEditing,
  onLayoutChange,
  onDeleteWidget,
  renderWidget,
}: CanvasGridProps) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });

  const layout = useMemo(
    () =>
      widgets.map((w) => ({
        i: w.id,
        x: w.position.x,
        y: w.position.y,
        w: w.position.w,
        h: w.position.h,
        minW: 1,
        minH: 1,
        maxW: 12,
      })),
    [widgets]
  );

  const handleLayoutChange = (newLayout: readonly { i: string; x: number; y: number; w: number; h: number }[]) => {
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
          gridConfig={{ cols: 12, rowHeight: 60, margin: [16, 16], containerPadding: [0, 0], maxRows: Infinity }}
          width={width}
          dragConfig={{ enabled: isEditing, bounded: false, handle: '.widget-drag-handle' }}
          resizeConfig={{ enabled: isEditing }}
          onLayoutChange={(newLayout) => handleLayoutChange(newLayout)}
        >
          {widgets.map((widget) => (
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
                  className="absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                  title="删除 Widget"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* 编辑模式下的拖拽手柄指示器 */}
              {isEditing && (
                <div className="widget-drag-handle absolute top-0 left-0 right-0 h-6 z-10 cursor-move flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-1 rounded-full bg-app-text-subtle/40" />
                </div>
              )}

              {/* Widget 内容 — 每个 Widget 独立错误边界 */}
              <div className={`h-full ${isEditing ? 'pt-4' : ''}`}>
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
