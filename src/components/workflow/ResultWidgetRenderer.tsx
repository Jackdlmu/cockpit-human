import { useMemo } from 'react';
import { Lightbulb, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';

interface ResultItem {
  type: 'finding' | 'conclusion' | 'warning' | 'insight';
  content: string;
  evidence?: string[];
  confidence?: number;
}

interface ResultData {
  items: ResultItem[];
  generatedAt?: string;
}

const TYPE_CONFIG: Record<ResultItem['type'], { icon: typeof Lightbulb; color: string; border: string; bg: string; label: string }> = {
  finding: {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    border: 'border-emerald-500/35',
    bg: 'bg-emerald-500/8',
    label: '发现',
  },
  conclusion: {
    icon: Lightbulb,
    color: 'text-amber-600',
    border: 'border-amber-500/35',
    bg: 'bg-amber-500/8',
    label: '结论',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-red-500',
    border: 'border-red-500/35',
    bg: 'bg-red-500/8',
    label: '警告',
  },
  insight: {
    icon: Sparkles,
    color: 'text-sky-600',
    border: 'border-sky-500/35',
    bg: 'bg-sky-500/8',
    label: '洞察',
  },
};

export function ResultWidgetRenderer({ data }: { data: Record<string, unknown> }) {
  const safeData = useMemo<ResultData>(() => {
    const d = data || {};
    const items = Array.isArray(d.items)
      ? d.items.map((item: any, i: number) => ({
          type: ['finding', 'conclusion', 'warning', 'insight'].includes(item?.type)
            ? item.type
            : 'finding',
          content: item?.content || item?.text || item?.summary || `结果项 ${i + 1}`,
          evidence: Array.isArray(item?.evidence) ? item.evidence.filter((e: any) => typeof e === 'string') : [],
          confidence: typeof item?.confidence === 'number' ? item.confidence : undefined,
        }))
      : [];
    return {
      items,
      generatedAt: typeof d.generatedAt === 'string' ? d.generatedAt : undefined,
    };
  }, [data]);

  if (safeData.items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-app-text-subtle">
        <div className="text-center">
          <Sparkles className="mx-auto mb-2 h-5 w-5" />
          <div className="text-[13px]">分析结果将在此展示</div>
          <div className="mt-1 text-[11px] text-app-text-muted">工作流执行完成后自动生成结构化结论</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="text-[10px] font-semibold text-app-text-subtle/40 uppercase tracking-[0.14em]">STRUCTURED RESULT</div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 sidebar-scroll">
        {safeData.items.map((item, index) => {
          const cfg = TYPE_CONFIG[item.type];
          const Icon = cfg.icon;
          return (
            <div
              key={index}
              className={`rounded-md border-l-[3px] ${cfg.border} ${cfg.bg} px-3 py-2.5`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                    {item.confidence !== undefined && (
                      <span className="text-[10px] text-app-text-subtle">可信度 {item.confidence}%</span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-app-text-secondary">{item.content}</p>
                  {item.evidence && item.evidence.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.evidence.map((ev, i) => (
                        <span
                          key={i}
                          className="rounded border border-app-border-subtle bg-app-surface px-1.5 py-0.5 text-[10px] text-app-text-muted"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {safeData.generatedAt && (
        <div className="text-[10px] text-app-text-subtle text-right">
          生成于 {safeData.generatedAt}
        </div>
      )}
    </div>
  );
}
