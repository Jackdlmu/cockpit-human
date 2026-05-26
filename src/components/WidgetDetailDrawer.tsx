// ─── WidgetDetailDrawer ───
// 侧滑弹窗：展示 widget 详情内容（报告、摘要穿透等）

import { useState, useEffect } from 'react';
import { X, Loader2, FileText, ArrowRight } from 'lucide-react';
import type { Widget } from '@/types';
import * as api from '@/api/client';

interface WidgetDetailDrawerProps {
  widget: Widget | null;
  workspaceId: string;
  onClose: () => void;
}

export function WidgetDetailDrawer({ widget, workspaceId, onClose }: WidgetDetailDrawerProps) {
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!widget) return;

    // 如果有静态 detail.content，直接用
    if (widget.detail?.content) {
      setDetailData({ content: widget.detail.content });
      return;
    }

    // 如果有 detail.dataSource，动态加载
    if (widget.detail?.dataSource) {
      setLoading(true);
      api.refreshWidgetData(workspaceId, widget.id)
        .then((res) => setDetailData(res.data as Record<string, unknown>))
        .catch(() => setDetailData({ content: '加载详情失败' }))
        .finally(() => setLoading(false));
      return;
    }

    // 否则尝试用 widget.data 中的 detail/summary/fullContent 字段
    const data = widget.data || {};
    if (data.detail || data.fullContent || data.content) {
      setDetailData(data as Record<string, unknown>);
      return;
    }

    setDetailData({ content: '暂无详情内容' });
  }, [widget, workspaceId]);

  if (!widget) return null;

  const summary = (widget.data?.summary || widget.data?.content || widget.title) as string;
  const width = widget.detail?.width || '480px';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-app-overlay/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-app-surface border-l border-app-border-subtle shadow-2xl transition-transform animate-in slide-in-from-right duration-300"
        style={{ width }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border-subtle">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-app-text-muted" />
            <h3 className="text-sm font-semibold text-app-text">{widget.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-app-surface-subtle text-app-text-subtle transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 text-app-text-muted animate-spin" />
            </div>
          ) : (
            <ReportContent data={detailData} summary={summary} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-app-border-subtle flex justify-between items-center">
          <span className="text-[10px] text-app-text-subtle">
            来源: {(widget.data?.source as string) || widget.dataSource?.agentId || 'System'}
          </span>
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            关闭 <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </>
  );
}

function ReportContent({ data, summary }: { data: Record<string, unknown> | null; summary: string }) {
  if (!data) return null;

  // detail 可能是字符串或对象 { content: '...' }
  const rawDetail = data.detail;
  const detailContent = typeof rawDetail === 'string' ? rawDetail : (rawDetail as any)?.content;
  const content = (data.content || data.fullContent || detailContent || summary || '') as string;
  const highlights = (data.highlights || data.keyPoints) as Array<{ label?: string; value?: string }> | undefined;
  const metadata = data.metadata as Record<string, string> | undefined;

  return (
    <div className="space-y-4">
      {/* 摘要卡片 */}
      {summary && summary !== content && (
        <div className="p-3 rounded-lg bg-app-surface-subtle border border-app-border-subtle">
          <p className="text-xs text-app-text-muted font-medium mb-1">摘要</p>
          <p className="text-sm text-app-text-secondary leading-relaxed">{summary}</p>
        </div>
      )}

      {/* 高亮点 */}
      {highlights && highlights.length > 0 && (
        <div className="space-y-2">
          {highlights.map((h, i) => (
            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-app-surface-subtle">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-red-400" />
              <div>
                {h.label && <span className="text-[10px] text-app-text-subtle font-medium">{h.label}</span>}
                <p className="text-xs text-app-text-muted mt-0.5">{h.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 正文内容 */}
      <div className="prose prose-invert prose-sm max-w-none">
        <div className="text-sm text-app-text-muted leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>

      {/* 元数据 */}
      {metadata && (
        <div className="pt-3 border-t border-app-border-subtle grid grid-cols-2 gap-2">
          {Object.entries(metadata).map(([k, v]) => (
            <div key={k}>
              <span className="text-[10px] text-app-text-subtle">{k}</span>
              <p className="text-xs text-app-text-muted">{v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
