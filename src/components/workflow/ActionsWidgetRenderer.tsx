import { useMemo } from 'react';
import { Loader2, CheckCircle2, Clock, Play, FileCode2, FileText, Wrench, ClipboardList } from 'lucide-react';

interface ActionItem {
  id: string;
  label: string;
  status: 'queued' | 'running' | 'done';
  type?: 'sql' | 'report' | 'script' | 'task';
  output?: string;
}

interface ActionsData {
  actions: ActionItem[];
}

const TYPE_ICON: Record<string, typeof Wrench> = {
  sql: FileCode2,
  report: FileText,
  script: FileCode2,
  task: ClipboardList,
};

function StatusBadge({ status }: { status: ActionItem['status'] }) {
  switch (status) {
    case 'done':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[10px] text-emerald-500">
          <CheckCircle2 className="h-3 w-3" />
          已完成
        </span>
      );
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/8 px-2 py-0.5 text-[10px] text-sky-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          执行中
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-app-border-subtle bg-app-surface-subtle px-2 py-0.5 text-[10px] text-app-text-muted">
          <Clock className="h-3 w-3" />
          排队中
        </span>
      );
  }
}

export function ActionsWidgetRenderer({ data }: { data: Record<string, unknown> }) {
  const safeData = useMemo<ActionsData>(() => {
    const d = data || {};
    const actions = Array.isArray(d.actions)
      ? d.actions.map((a: any, i: number) => ({
          id: a?.id || String(i),
          label: a?.label || a?.name || `行动项 ${i + 1}`,
          status: ['queued', 'running', 'done'].includes(a?.status) ? a.status : 'queued',
          type: ['sql', 'report', 'script', 'task'].includes(a?.type) ? a.type : 'task',
          output: a?.output || '',
        }))
      : [];
    return { actions };
  }, [data]);

  const doneCount = safeData.actions.filter((a) => a.status === 'done').length;
  const runningCount = safeData.actions.filter((a) => a.status === 'running').length;

  if (safeData.actions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-app-text-subtle">
        <div className="text-center">
          <Play className="mx-auto mb-2 h-5 w-5" />
          <div className="text-[13px]">下一步行动将在此展示</div>
          <div className="mt-1 text-[11px] text-app-text-muted">分析完成后自动生成可执行的行动建议</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="text-[10px] font-semibold text-app-text-subtle/40 uppercase tracking-[0.14em]">NEXT ACTIONS</div>
      {/* 统计 */}
      <div className="flex items-center gap-3">
        <div className="text-[11px] text-app-text-subtle">
          共 <span className="font-medium text-app-text-secondary">{safeData.actions.length}</span> 项
        </div>
        {runningCount > 0 && (
          <div className="text-[11px] text-sky-500">
            执行中 <span className="font-medium">{runningCount}</span> 项
          </div>
        )}
        {doneCount > 0 && (
          <div className="text-[11px] text-emerald-500">
            已完成 <span className="font-medium">{doneCount}</span> 项
          </div>
        )}
      </div>

      {/* 行动列表 */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 sidebar-scroll">
        {safeData.actions.map((action) => {
          const Icon = TYPE_ICON[action.type || 'task'] || Wrench;
          return (
            <div
              key={action.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-app-border-subtle bg-app-surface/60 px-3 py-2.5 transition-colors hover:bg-app-surface-hover"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-app-surface-subtle">
                  <Icon className="h-3.5 w-3.5 text-app-text-subtle" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-app-text-secondary">{action.label}</div>
                  {action.output && (
                    <div className="mt-0.5 truncate text-[11px] text-app-text-muted">{action.output}</div>
                  )}
                </div>
              </div>
              <StatusBadge status={action.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
