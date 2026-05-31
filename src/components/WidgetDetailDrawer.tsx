// ─── WidgetDetailDrawer ───
// 侧滑弹窗：展示 widget 详情内容（报告、摘要穿透、HTML 报告等）

import { useState, useEffect } from 'react';
import { X, Loader2, FileText, ArrowRight, Maximize2, Minimize2, ExternalLink } from 'lucide-react';
import type { Widget } from '@/types';
import * as api from '@/api/client';
import { buildReportDisplayData, shouldRenderReportAsHtml } from '@/lib/report-widget';
import { normalizeWidgetDataPayload } from '@/lib/widget-normalizer';

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
        .then((res) => setDetailData(normalizeDetailPayload(res.data, widget.type)))
        .catch(() => setDetailData({ content: '下钻数据加载失败' }))
        .finally(() => setLoading(false));
      return;
    }

    // 如果有静态 detail.content，直接用
    if (widget.detail?.content) {
      setDetailData(normalizeDetailPayload({ detail: { content: widget.detail.content } }, widget.type));
      return;
    }

    // 如果有 detail.dataSource，动态加载
    if (widget.detail?.dataSource) {
      setLoading(true);
      api.refreshWidgetData(workspaceId, widget.id)
        .then((res) => setDetailData(normalizeDetailPayload(res.data, widget.type)))
        .catch(() => setDetailData({ content: '加载详情失败' }))
        .finally(() => setLoading(false));
      return;
    }

    // 否则尝试用 widget.data 中的 detail/summary/fullContent/html 字段
    const data = widget.data || {};
    if (hasInlineOrLinkedDetail(data as Record<string, unknown>)) {
      setDetailData(normalizeDetailPayload(data, widget.type));
      return;
    }

    setDetailData({ content: '暂无详情内容' });
  }, [widget, workspaceId, drillContext]);

  if (!widget) return null;

  const mergedData = {
    ...((widget.data as Record<string, unknown> | undefined) || {}),
    ...(detailData || {}),
    title: (detailData?.title || widget.data?.title || widget.title) as string,
  };
  const reportDisplay = buildReportDisplayData(mergedData, widget.type);
  const summary = reportDisplay.summary || widget.title;
  const isHtml = shouldRenderReportAsHtml(mergedData, widget.type);
  const defaultWidth = isHtml || widget.type === 'report' || widget.type === 'html' ? '860px' : '640px';
  const width = isFullscreen ? '100%' : (widget.detail?.width || defaultWidth);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-app-overlay/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className={`fixed bottom-0 right-0 top-0 z-50 flex max-w-full flex-col border-l border-app-border-subtle bg-app-surface shadow-2xl transition-all animate-in slide-in-from-right duration-300 ${isFullscreen ? 'max-w-none' : ''}`}
        style={{ width }}
      >
        {/* Header */}
        <div className="bi-toolbar flex shrink-0 items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-app-border-subtle bg-app-surface-subtle">
              <FileText className="w-4 h-4 text-app-text-muted" />
            </div>
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
              className="bi-icon-button"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="bi-icon-button"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-app-bg">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 text-app-text-muted animate-spin" />
            </div>
          ) : isHtml ? (
            <HtmlReportContent data={mergedData} />
          ) : (
            <div className="h-full overflow-y-auto p-5">
              <ReportContent data={mergedData} summary={summary} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-app-border-subtle bg-app-surface px-5 py-3">
          <span className="text-[10px] text-app-text-subtle">
            来源: {(widget.data?.source as string) || widget.dataSource?.agentId || 'System'}
          </span>
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-app-text-muted transition-colors hover:bg-app-surface-subtle hover:text-app-text-secondary"
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
  const report = buildReportDisplayData(data, 'html');
  const resolvedUrl = resolveReportUrl(report.detailUrl);
  const html = report.html || (resolvedUrl ? '' : report.detail);
  const title = (data?.title || 'HTML 报告') as string;

  if (resolvedUrl && !html) {
    return (
      <div className="flex h-full flex-col bg-app-bg">
        <div className="flex items-center justify-between gap-3 border-b border-app-border-subtle bg-app-surface px-5 py-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-app-text-secondary">完整报告</div>
            <div className="truncate text-[11px] text-app-text-muted">{resolvedUrl}</div>
          </div>
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-app-border-subtle px-2.5 py-1.5 text-[11px] text-app-text-secondary transition-colors hover:bg-app-surface-subtle"
          >
            新窗口打开
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <iframe
          title={title}
          src={resolvedUrl}
          className="m-4 h-full w-[calc(100%-2rem)] flex-1 rounded-lg border border-app-border-subtle bg-white"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </div>
    );
  }

  if (!html) {
    if (report.wantsHtmlDetail) {
      return <MissingOriginalReportContent report={report} />;
    }
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
      className="m-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] rounded-lg border border-app-border-subtle bg-white"
      sandbox="allow-same-origin"
    />
  );
}

function ReportContent({ data, summary }: { data: Record<string, unknown> | null; summary: string }) {
  if (!data) return null;

  const report = buildReportDisplayData(data, 'report');
  const content = report.detail || summary || '';
  const highlights = report.highlights;
  const metadata = report.metadata;

  return (
    <div className="space-y-4">
      {/* 摘要卡片 */}
      {summary && summary !== content && (
        <div className="rounded-lg border border-app-border-subtle bg-app-surface p-4 shadow-sm">
          <p className="text-xs text-app-text-muted font-medium mb-1">摘要</p>
          <p className="text-sm text-app-text-secondary leading-relaxed">{summary}</p>
        </div>
      )}

      {/* 高亮点 */}
      {highlights.length > 0 && (
        <div className="space-y-2">
          {highlights.map((h, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-app-border-subtle bg-app-surface px-3 py-2.5">
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
      <div className="rounded-lg border border-app-border-subtle bg-app-surface p-4 shadow-sm">
        <div className="text-sm text-app-text-muted leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>

      {/* 元数据 */}
      {Object.keys(metadata).length > 0 && (
        <div className="grid grid-cols-2 gap-2 border-t border-app-border-subtle pt-3">
          {Object.entries(metadata).map(([k, v]) => (
            <div key={k} className="rounded-md border border-app-border-subtle bg-app-surface px-3 py-2">
              <span className="text-[10px] text-app-text-subtle">{k}</span>
              <p className="text-xs text-app-text-muted">{v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MissingOriginalReportContent({ report }: { report: ReturnType<typeof buildReportDisplayData> }) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-amber-900">
        <div className="text-sm font-semibold">未收到 YonClaw 原始 HTML 报告</div>
        <p className="mt-2 text-xs leading-5">
          当前组件只传入了 detailUrl=true 这样的详情标记，以及摘要和高亮数据；没有传入 full-report.html 的 URL，也没有传入 data.html 或 data.detail.content。
        </p>
        <p className="mt-2 text-xs leading-5">
          请让 YonClaw 返回 reportUrl/htmlUrl/reportFile，或把 HTML 正文写入 data.html。若报告文件在本机，请放到 server/data/reports/ 并传 reportFile: "full-report.html"。
        </p>
      </div>
      {report.summary && (
        <div className="mt-5 rounded-xl border border-app-border-subtle bg-app-surface-subtle p-4">
          <div className="text-xs font-medium text-app-text-muted">已收到的摘要</div>
          <p className="mt-2 text-sm leading-6 text-app-text-secondary">{report.summary}</p>
        </div>
      )}
      {report.highlights.length > 0 && (
        <div className="mt-4 space-y-2">
          {report.highlights.map((item, index) => (
            <div key={index} className="rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2">
              <div className="text-xs font-medium text-app-text-secondary">{item.label}</div>
              <div className="mt-1 text-xs leading-5 text-app-text-muted">{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeDetailPayload(data: unknown, widgetType: string): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { content: typeof data === 'string' ? data : '暂无详情内容' };
  }
  return normalizeWidgetDataPayload(data as Record<string, unknown>, widgetType);
}

function hasInlineOrLinkedDetail(data: Record<string, unknown>): boolean {
  return Boolean(
    data.detail
      || data.fullContent
      || data.detailContent
      || data.content
      || data.html
      || data.detailHtml
      || data.fullHtml
      || data.htmlContent
      || data.reportHtml
      || data.detailUrl
      || data.reportUrl
      || data.htmlUrl
      || data.reportPath
      || data.htmlPath
      || data.filePath
      || data.reportFile
      || data.url
  );
}

function resolveReportUrl(value: string): string {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('#')) return value;
  if (typeof window === 'undefined') return value;
  try {
    const trimmed = value.trim();
    if (/^\/__(openclaw|yonclaw)__\//i.test(trimmed)) {
      return '';
    }
    if (/^file:\/\//i.test(trimmed) || (/^\/.+\.html?([?#].*)?$/i.test(trimmed) && !trimmed.startsWith('/reports/'))) {
      return new URL(`reports/local?path=${encodeURIComponent(trimmed)}`, api.API_BASE_ORIGIN).toString();
    }
    if (/^\.?\/?reports\//i.test(trimmed)) {
      const reportPath = trimmed.replace(/^\.?\//, '');
      return new URL(reportPath, api.API_BASE_ORIGIN).toString();
    }
    if (/^[^/?#]+\.html?([?#].*)?$/i.test(trimmed)) {
      return new URL(`reports/${trimmed}`, api.API_BASE_ORIGIN).toString();
    }
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}
