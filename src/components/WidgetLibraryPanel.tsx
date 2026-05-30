import { useMemo, useState } from 'react';
import type { WidgetType } from '@/types';
import { useWorkspaces } from '@/hooks/useApiData';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  BarChart3, Table, List, Kanban, Clock, FileText, Activity,
  TrendingUp, CheckCircle, Layers, Plus, Gauge, Funnel, Radar,
  Grid3X3, Crosshair, AlertTriangle, Map, Search, Sparkles, PanelTop
} from 'lucide-react';
// 快速创建入口暂时隐藏，如需恢复请参考 git 历史

interface WidgetLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  onAdd: (template: { type: WidgetType; title: string; data?: Record<string, unknown> }) => void;
}

const typeIcons: Record<string, React.ElementType> = {
  chart: BarChart3, table: Table, list: List, kanban: Kanban,
  timeline: Clock, report: FileText, metric: TrendingUp,
  status: Activity, progress: CheckCircle, universal: Layers,
  adaptive: PanelTop,
  gauge: Gauge, funnel: Funnel, radar: Radar,
  heatmap: Grid3X3, bullet: Crosshair, alert: AlertTriangle, map: Map,
};

const typeLabels: Record<string, string> = {
  chart: '图表', table: '表格', list: '列表', kanban: '看板',
  timeline: '时间线', report: '报告', metric: '指标',
  status: '状态', progress: '进度', universal: '通用',
  adaptive: '智能容器',
  gauge: '仪表盘', funnel: '漏斗', radar: '雷达',
  heatmap: '热力', bullet: '子弹', alert: '告警', map: '地图',
};

export function WidgetLibraryPanel({ open, onClose, onAdd }: WidgetLibraryPanelProps) {
  const { workspaces } = useWorkspaces();
  const [search, setSearch] = useState('');
  // 当前只支持「从已有驾驶舱添加」，隐藏快速创建入口

  const templates = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{
      type: WidgetType;
      title: string;
      data?: Record<string, unknown>;
      sourceWorkspace: string;
    }> = [];

    for (const ws of workspaces) {
      for (const widget of ws.widgets || []) {
        const key = `${widget.type}::${widget.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          type: widget.type,
          title: widget.title,
          data: widget.data,
          sourceWorkspace: ws.name,
        });
      }
    }
    return result;
  }, [workspaces]);

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.type.toLowerCase().includes(q) ||
      (typeLabels[t.type] || '').includes(q)
    );
  }, [templates, search]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[420px] bg-app-surface border-l border-app-border-subtle p-0">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-app-border-subtle">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-sm font-semibold text-app-text flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              从已有驾驶舱添加组件
            </SheetTitle>
          </SheetHeader>
          <p className="text-xs text-app-text-subtle">
            从其他驾驶舱中复制实际组件（含数据）到当前驾驶舱。添加后成为本驾驶舱的独立组件，与原驾驶舱无关联。
          </p>
        </div>

        {/* Search */}
        <div className="px-5 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-app-text-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索组件类型或名称..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text placeholder:text-app-text-subtle/50 focus:outline-none focus:border-indigo-400/50 transition-colors"
            />
          </div>
        </div>

        {/* 统计信息 */}
        <div className="px-5 pb-2">
          <div className="text-[10px] text-app-text-subtle/70">
            共 {templates.length} 个可用组件
          </div>
        </div>

        {/* Content */}
        <div className="px-5 pb-5 overflow-y-auto sidebar-scroll" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          <div className="space-y-2">
            {filteredTemplates.length === 0 && (
              <div className="text-center py-10">
                <Layers className="w-8 h-8 text-app-text-subtle/30 mx-auto mb-2" />
                <div className="text-xs text-app-text-subtle">暂无可用组件模板</div>
                <div className="text-[10px] text-app-text-subtle/60 mt-1">其他驾驶舱暂无可用组件</div>
              </div>
            )}
            {filteredTemplates.map((t, i) => {
              const Icon = typeIcons[t.type] || Layers;
              return (
                <button
                  key={i}
                  onClick={() => {
                    onAdd({ type: t.type, title: t.title, data: t.data });
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-app-surface-hover/30 border border-app-border-subtle hover:border-indigo-400/30 hover:bg-indigo-500/5 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-app-surface-subtle flex items-center justify-center shrink-0 group-hover:bg-indigo-500/10 transition-colors">
                    <Icon className="w-4 h-4 text-app-text-subtle group-hover:text-indigo-400 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-app-text-secondary truncate">{t.title}</div>
                    <div className="text-[10px] text-app-text-subtle mt-0.5">
                      {typeLabels[t.type] || t.type} · 来自「{t.sourceWorkspace}」
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-app-text-subtle opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
