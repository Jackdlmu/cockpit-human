// ─── WidgetAIAnalysisModal ───
// AI 分析建议详情弹窗

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, Lightbulb, TrendingUp, Target, CheckCircle2, AlertCircle } from 'lucide-react';
import type { AIAnalysisResult } from '@/hooks/useWidgetAIAnalysis';

interface Props {
  analysis: AIAnalysisResult;
  widgetTitle: string;
  onClose: () => void;
}

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const config = {
    high: { icon: CheckCircle2, text: '高置信度', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    medium: { icon: AlertCircle, text: '中等置信度', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    low: { icon: AlertCircle, text: '低置信度', className: 'bg-app-surface-subtle text-app-text-subtle border-app-border-subtle' },
  };
  const cfg = config[level];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {cfg.text}
    </span>
  );
}

export function WidgetAIAnalysisModal({ analysis, widgetTitle, onClose }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-app-border-subtle bg-app-surface p-0 sm:max-w-xl">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <DialogTitle className="text-sm font-semibold text-app-text">
              AI 分析建议
            </DialogTitle>
            <ConfidenceBadge level={analysis.confidence} />
          </div>
          <p className="text-xs text-app-text-subtle">
            针对「{widgetTitle}」的数据与内容生成
          </p>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          <div className="space-y-5 px-6 pb-6 pt-2">
            {/* 数据概览 */}
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary/70" />
                <h4 className="text-xs font-semibold text-app-text-secondary">数据概览</h4>
              </div>
              <p className="rounded-lg border border-app-border-subtle/60 bg-app-surface-subtle/40 px-3 py-2.5 text-xs leading-5 text-app-text-muted">
                {analysis.overview}
              </p>
            </section>

            {/* 关键洞察 */}
            {analysis.insights.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-primary/70" />
                  <h4 className="text-xs font-semibold text-app-text-secondary">关键洞察</h4>
                </div>
                <ul className="space-y-2">
                  {analysis.insights.map((insight, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-5 text-app-text-muted">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 后续建议 */}
            {analysis.recommendations.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-primary/70" />
                  <h4 className="text-xs font-semibold text-app-text-secondary">后续建议</h4>
                </div>
                <ul className="space-y-2">
                  {analysis.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-5 text-app-text-muted">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
