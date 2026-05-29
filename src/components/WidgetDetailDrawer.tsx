// ─── WidgetDetailDrawer ───
// 侧滑弹窗：展示 widget 详情内容（报告、摘要穿透、HTML 报告等）

import { useState, useEffect } from 'react';
import { X, Loader2, FileText, ArrowRight, Maximize2, Minimize2 } from 'lucide-react';
import type { Widget } from '@/types';
import * as api from '@/api/client';

interface WidgetDetailDrawerProps {
  widget: Widget | null;
  workspaceId: string;
  onClose: () => void;
  /** 下钻上下文：如果提供，会带 context 调用 API 获取下钻数据 */
  drillContext?: Record<string, unknown>;
  /** 下钻维度标签，用于面包屑展示 */
  drillDimension?: string;
}

export function WidgetDetailDrawer({ widget, workspaceId, onClose, drillContext, drillDimension }: WidgetDetailDrawerProps) {
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!widget) {
      setIsFullscreen(false);
      return;
    }

    // 如果有下钻上下文，带 context 动态加载
    if (drillContext && Object.keys(drillContext).length > 0) {
      setLoading(true);
      api.refreshWidgetData(workspaceId, widget.id, drillContext)
        .then((res) => setDetailData(res.data as Record<string, unknown>))
        .catch(() => setDetailData({ content: '下钻数据加载失败' }))
        .finally(() => setLoading(false));
      return;
    }

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

    // 否则尝试用 widget.data 中的 detail/summary/fullContent/html 字段
    const data = widget.data || {};
    if (data.detail || data.fullContent || data.content || data.html) {
      setDetailData(data as Record<string, unknown>);
      return;
    }

    setDetailData({ content: '暂无详情内容' });
  }, [widget, workspaceId, drillContext]);

  if (!widget) return null;

  const summary = (widget.data?.summary || widget.data?.content || widget.title) as string;
  const width = isFullscreen ? '100%' : (widget.detail?.width || '480px');
  const isHtml = widget.type === 'html';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-app-overlay/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-app-surface border-l border-app-border-subtle shadow-2xl transition-all animate-in slide-in-from-right duration-300 ${isFullscreen ? 'max-w-none' : ''}`}
        style={{ width }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border-subtle shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-app-text-muted shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-sm font-semibold text-app-text truncate">{widget.title}</h3>
              {drillDimension && (
                <>
                  <span className="text-app-text-subtle">/</span>
                  <span className="text-xs text-app-text-muted truncate">{drillDimension}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* 全屏切换 */}
            <button
              onClick={() => setIsFullscreen((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-app-surface-subtle text-app-text-subtle transition-colors"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-app-surface-subtle text-app-text-subtle transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 text-app-text-muted animate-spin" />
            </div>
          ) : isHtml ? (
            <HtmlReportContent data={detailData} />
          ) : (
            <div className="h-full overflow-y-auto p-5">
              <ReportContent data={detailData} summary={summary} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-app-border-subtle flex justify-between items-center shrink-0">
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

/** HTML 报告渲染：使用 iframe 隔离样式 */
function HtmlReportContent({ data }: { data: Record<string, unknown> | null }) {
  const html = (data?.html || data?.content || '') as string;
  const title = (data?.title || 'HTML 报告') as string;

  if (!html) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-app-text-subtle gap-2 p-5">
        <FileText className="w-8 h-8 opacity-40" />
        <p className="text-xs">暂无 HTML 内容</p>
      </div>
    );
  }

  // 构造完整 HTML 文档（注入暗色主题基础样式）
  const doc = html.includes('<html') || html.includes('<!DOCTYPE')
    ? html
    : `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { background: #0f0f11; color: #e4e4e7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; line-height: 1.7; font-size: 14px; }
  h1, h2, h3, h4 { color: #fafafa; margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
  h1 { font-size: 1.5em; border-bottom: 1px solid #27272a; padding-bottom: 0.3em; }
  h2 { font-size: 1.25em; }
  h3 { font-size: 1.1em; color: #e4e4e7; }
  p { margin: 0.8em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 13px; }
  th, td { border: 1px solid #27272a; padding: 8px 12px; text-align: left; }
  th { background: #18181b; font-weight: 600; color: #fafafa; }
  tr:nth-child(even) { background: #18181b; }
  tr:hover { background: #1f1f23; }
  ul, ol { padding-left: 1.5em; }
  li { margin: 0.4em 0; }
  strong { color: #fafafa; font-weight: 600; }
  a { color: #60a5fa; text-decoration: none; }
  a:hover { text-decoration: underline; }
  blockquote { border-left: 3px solid #3f3f46; margin: 1em 0; padding: 0.5em 1em; color: #a1a1aa; background: #18181b; border-radius: 0 4px 4px 0; }
  code { background: #27272a; padding: 2px 6px; border-radius: 4px; font-family: "SF Mono", Monaco, "Cascadia Code", monospace; font-size: 0.9em; color: #e4e4e7; }
  pre { background: #18181b; padding: 12px; border-radius: 8px; overflow-x: auto; border: 1px solid #27272a; }
  pre code { background: transparent; padding: 0; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  hr { border: none; border-top: 1px solid #27272a; margin: 1.5em 0; }
  .highlight { background: #27272a; padding: 2px 4px; border-radius: 3px; }
</style>
</head>
<body>${html}</body>
</html>`;

  return (
    <iframe
      title={title}
      srcDoc={doc}
      className="w-full h-full border-0"
      sandbox="allow-same-origin"
    />
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
