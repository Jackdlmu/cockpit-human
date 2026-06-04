import { useMemo } from 'react';
import { Loader2, CheckCircle2, Circle, AlertCircle, Play } from 'lucide-react';

interface WorkflowStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

interface WorkflowData {
  steps: WorkflowStep[];
  currentStep?: number;
  summary?: string;
}

function statusIcon(status: WorkflowStep['status']) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-sky-500 animate-spin" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Circle className="h-4 w-4 text-app-text-subtle" />;
  }
}

function statusLineClass(status: WorkflowStep['status']) {
  switch (status) {
    case 'done':
      return 'bg-emerald-500/40';
    case 'running':
      return 'bg-sky-500/40';
    case 'error':
      return 'bg-red-500/40';
    default:
      return 'bg-app-border-subtle';
  }
}

export function WorkflowWidgetRenderer({ data }: { data: Record<string, unknown> }) {
  const safeData = useMemo<WorkflowData>(() => {
    const d = data || {};
    const steps = Array.isArray(d.steps)
      ? d.steps.map((s: any, i: number) => ({
          id: s?.id || String(i),
          label: s?.label || s?.name || `步骤 ${i + 1}`,
          status: ['pending', 'running', 'done', 'error'].includes(s?.status) ? s.status : 'pending',
          detail: s?.detail || '',
        }))
      : [];
    return {
      steps,
      currentStep: typeof d.currentStep === 'number' ? d.currentStep : undefined,
      summary: typeof d.summary === 'string' ? d.summary : undefined,
    };
  }, [data]);

  const doneCount = safeData.steps.filter((s) => s.status === 'done').length;
  const total = safeData.steps.length;
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  if (safeData.steps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-app-text-subtle">
        <div className="text-center">
          <Play className="mx-auto mb-2 h-5 w-5" />
          <div className="text-[13px]">等待启动工作流</div>
          <div className="mt-1 text-[11px] text-app-text-muted">输入需求后将自动执行分析步骤</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-[10px] font-semibold text-app-text-subtle/40 uppercase tracking-[0.14em]">WORKFLOW PROGRESS</div>
      {/* 进度条 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-app-border-subtle overflow-hidden">
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] text-app-text-subtle tabular-nums">{doneCount}/{total}</span>
      </div>

      {/* 步骤列表 */}
      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto pr-1 sidebar-scroll">
        {safeData.steps.map((step, index) => {
          const isLast = index === safeData.steps.length - 1;
          return (
            <div key={step.id} className="relative flex gap-3">
              {/* 左侧时间线 */}
              <div className="flex flex-col items-center">
                <div className="flex h-5 items-center">{statusIcon(step.status)}</div>
                {!isLast && <div className={`w-px flex-1 min-h-[16px] ${statusLineClass(step.status)}`} />}
              </div>
              {/* 内容 */}
              <div className="flex-1 pb-3">
                <div
                  className={`text-[13px] font-medium ${
                    step.status === 'running'
                      ? 'text-sky-500'
                      : step.status === 'done'
                        ? 'text-app-text-secondary'
                        : 'text-app-text-subtle'
                  }`}
                >
                  {step.label}
                </div>
                {step.detail && (
                  <div className="mt-0.5 text-[11px] text-app-text-muted leading-5">{step.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {safeData.summary && (
        <div className="rounded-md border border-app-border-subtle bg-app-surface-subtle/40 px-2.5 py-1.5 text-[11px] text-app-text-muted leading-5">
          {safeData.summary}
        </div>
      )}
    </div>
  );
}
