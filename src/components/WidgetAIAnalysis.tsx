// ─── WidgetAIAnalysis ───
// 组件底部 AI 分析建议摘要条

import { useState } from 'react';
import { Sparkles, X, Maximize2 } from 'lucide-react';
import type { AIAnalysisResult } from '@/hooks/useWidgetAIAnalysis';
import { WidgetAIAnalysisModal } from './WidgetAIAnalysisModal';

interface Props {
  analysis: AIAnalysisResult;
  widgetTitle: string;
  onDismiss?: () => void;
}

export function WidgetAIAnalysis({ analysis, widgetTitle, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <>
      {/* 紧凑摘要条 */}
      <div className="group relative z-10 flex w-full items-center border-t border-primary/10 bg-primary/[0.04] transition-colors hover:bg-primary/[0.07]">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex flex-1 items-center gap-2 px-3 py-2 pr-8 text-left"
          aria-label={`查看 AI 分析详情：${analysis.summary}`}
        >
          <Sparkles className="h-3 w-3 shrink-0 text-primary/70" aria-hidden="true" />
          <span className="flex-1 truncate text-[11px] leading-4 text-app-text-muted">
            <span className="font-medium text-primary/80">AI 洞察：</span>
            {analysis.summary}
          </span>
        </button>
        <Maximize2
          className="pointer-events-none absolute right-8 top-1/2 h-3 w-3 -translate-y-1/2 shrink-0 text-app-text-subtle/50 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
        {onDismiss && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
              onDismiss();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-app-text-subtle/40 transition-colors hover:bg-app-surface-hover hover:text-app-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title="关闭"
            aria-label="关闭 AI 洞察"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 详情弹窗 */}
      {expanded && (
        <WidgetAIAnalysisModal
          analysis={analysis}
          widgetTitle={widgetTitle}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}
