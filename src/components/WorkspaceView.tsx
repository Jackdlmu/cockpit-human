import type { Workspace, CockpitTemplate } from '@/types';
import { useState, useCallback, useEffect, useMemo, type ElementType, type MouseEvent } from 'react';
import {
  ChevronDown,
  ArrowRight,
  BarChart3,
  DollarSign,
  FolderPlus,
  Layers,
  Monitor,
  Plus,
  Settings,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Truck,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import SettingsPanel from './SettingsPanel';
import CreateCockpitDialog from './CreateCockpitDialog';
import { getTemplates } from '@/api/client';
import { toast } from 'sonner';
import { normalizeWidgets } from '@/lib/widget-normalizer';
import WorkspaceIcon from '@/components/WorkspaceIcon';

interface WorkspaceViewProps {
  workspaces: Workspace[];
  onSelectWorkspace: (id: string) => void;
  onDeleteWorkspace?: (id: string) => Promise<void>;
  onExecute?: (command: string) => void;
  executing?: boolean;
  onCreateFromTemplate?: (templateId: string, name: string, initPrompt: string) => Promise<void>;
}

const wsIcons: Record<string, ElementType> = {
  BarChart3, UserPlus, Monitor, Target,
  DollarSign, TrendingUp, Users, Truck,
};

const PRESET_BLUEPRINTS = [
  {
    id: 'financial-decision',
    title: 'CFO 智能财务驾驶舱',
    description: '适合真实公司经营分析，聚焦收入、利润、现金流、预算偏差与风险预警。',
    prompt: '创建一个 CFO 财务驾驶舱，优先通过互联网或可用工具获取真实公司的真实数据，展示营收、利润、现金流、预算执行、风险预警和关键结论。',
    icon: 'DollarSign',
    color: '#f97316',
    category: '出厂预制',
  },
  {
    id: 'operational-efficiency',
    title: 'COO 运营效率驾驶舱',
    description: '聚焦订单、履约、告警与服务健康，适合日常运营与异常跟踪。',
    prompt: '创建一个运营调度驾驶舱，展示任务执行、订单履约、异常告警、地区分布与趋势分析，并尽量初始化真实数据。',
    icon: 'Monitor',
    color: '#06b6d4',
    category: '出厂预制',
  },
  {
    id: 'strategic-overview',
    title: 'CEO 战略总览驾驶舱',
    description: '适合高层快速掌握经营态势，突出关键结果、风险与增长机会。',
    prompt: '创建一个 CEO 战略总览驾驶舱，突出关键经营指标、增长趋势、重点风险与组织执行状态，尽量获取真实数据并生成专业解读。',
    icon: 'Target',
    color: '#10b981',
    category: '出厂预制',
  },
] as const;

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function summarizeWorkspace(workspace: Workspace) {
  const widgets = normalizeWidgets(workspace.widgets);
  const metrics = widgets.filter((widget) => widget.type === 'metric');
  const topMetric = metrics.find((widget) => {
    const value = (widget.data as Record<string, unknown> | undefined)?.value;
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
  const topMetricValue = topMetric ? String((topMetric.data as Record<string, unknown>)?.value || '—') : '—';

  const healthLabel = workspace.orchestration?.health === 'healthy'
    ? '运行稳定'
    : workspace.orchestration?.health === 'degraded'
      ? '需关注'
      : workspace.orchestration?.health === 'unavailable'
        ? '不可用'
        : workspace.status === 'error'
          ? '异常'
          : workspace.status === 'running'
            ? '运行中'
            : '已停止';

  const dataModeLabel = workspace.useDemoDataFallback === false ? '真实数据优先' : '支持演示兜底';
  const controlModeLabel = workspace.executionOwner === 'external'
    ? workspace.externalProvider === 'yonclaw'
      ? 'YonClaw 主控'
      : workspace.externalProvider === 'openclaw'
        ? 'OpenClaw 主控'
        : '外部主控'
    : '驾驶舱主控';
  return { topMetricValue, healthLabel, dataModeLabel, controlModeLabel, widgets };
}

export function WorkspaceView({
  workspaces,
  onSelectWorkspace,
  onDeleteWorkspace,
  onExecute,
  executing = false,
  onCreateFromTemplate: externalCreateFromTemplate,
}: WorkspaceViewProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<CockpitTemplate[]>([]);
  const [quickCreateExpanded, setQuickCreateExpanded] = useState(true);
  const [initialTemplateId, setInitialTemplateId] = useState<string | null>(null);
  const [initialName, setInitialName] = useState<string | null>(null);
  const [initialCommand, setInitialCommand] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);

  const normalizedWorkspaces = useMemo(
    () => workspaces.map((workspace) => ({
      ...workspace,
      widgets: normalizeWidgets(workspace.widgets),
    })),
    [workspaces]
  );

  const workspaceSummaries = useMemo(
    () => normalizedWorkspaces.map((workspace) => ({ workspace, ...summarizeWorkspace(workspace) })),
    [normalizedWorkspaces]
  );

  useEffect(() => {
    getTemplates()
      .then((data) => setTemplates(data.templates))
      .catch(() => {
        console.error('加载模板失败');
      });
  }, []);

  const openCreateDialog = useCallback(async (templateId?: string | null, preset?: { name?: string | null; command?: string | null }) => {
    if (normalizedWorkspaces.length >= 30) {
      toast.error('驾驶舱数量已达上限（30个）', { description: '请先删除部分驾驶舱后再创建' });
      return;
    }
    setDialogOpen(true);
    setInitialTemplateId(templateId || null);
    setInitialName(preset?.name || null);
    setInitialCommand(preset?.command || null);
    try {
      const data = await getTemplates();
      setTemplates(data.templates);
    } catch {
      console.error('加载模板失败');
    }
  }, [normalizedWorkspaces.length]);

  const handleCloseDialog = useCallback(() => {
    if (executing) return;
    setDialogOpen(false);
    setInitialTemplateId(null);
    setInitialName(null);
    setInitialCommand(null);
  }, [executing]);

  const handleDeleteClick = useCallback((e: MouseEvent, workspace: Workspace) => {
    e.stopPropagation();
    setDeleteTarget(workspace);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || !onDeleteWorkspace) return;
    setDeleting(true);
    try {
      await onDeleteWorkspace(deleteTarget.id);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDeleteWorkspace]);

  const handleCreateFromTemplate = useCallback(async (templateId: string, name: string, initPrompt: string) => {
    if (!externalCreateFromTemplate) return;
    setDialogOpen(false);
    setInitialTemplateId(null);
    setInitialName(null);
    setInitialCommand(null);
    await externalCreateFromTemplate(templateId, name, initPrompt);
  }, [externalCreateFromTemplate]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.94),rgba(248,245,244,1)_38%,rgba(243,241,239,1))]">
      <div className="border-b border-app-border-subtle/80 bg-app-surface-elevated/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1480px] items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-app-border-subtle bg-app-surface-subtle p-2.5">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-app-text">智能驾驶舱</h1>
              <p className="text-xs text-app-text-subtle">面向企业场景的智能分析与协作入口</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetTrigger asChild>
                <button
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-app-text-muted transition-colors hover:bg-app-surface-hover hover:text-app-text-secondary"
                  title="协议适配层设置"
                >
                  <Settings className="h-4 w-4" />
                  <span>设置</span>
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full border-l border-app-border bg-app-bg p-0 sm:max-w-md">
                <div className="h-full p-6">
                  <SettingsPanel />
                </div>
              </SheetContent>
            </Sheet>
            <button
              onClick={() => openCreateDialog(null)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-red-400 hover:to-orange-400"
            >
              <Plus className="h-4 w-4" />
              新建驾驶舱
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-5 px-6 py-5">
        <section className="rounded-[28px] border border-app-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.96),rgba(248,245,244,1)_42%,rgba(243,241,239,1))] px-5 py-4 shadow-[0_12px_34px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="text-[11px] uppercase tracking-[0.18em] text-app-text-subtle">Enterprise Cockpit</div>
              <h2 className="mt-2 text-[26px] font-semibold tracking-tight text-app-text">
                面向企业决策与执行的一体化智能驾驶舱
              </h2>
              <p className="mt-2 text-sm leading-6 text-app-text-muted">
                围绕业务目标快速生成驾驶舱，持续完成数据获取、结果呈现与后续调整，保持简洁、专业、可直接交付。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuickCreateExpanded((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-xl border border-app-border-subtle bg-app-surface px-3 py-2 text-xs text-app-text-muted transition-colors hover:border-app-border hover:text-app-text-secondary"
            >
              <span>{quickCreateExpanded ? '收起快速创建' : '展开快速创建'}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${quickCreateExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {quickCreateExpanded && (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => openCreateDialog(null)}
                className="group rounded-[24px] border border-app-border-subtle bg-gradient-to-br from-app-surface to-app-surface-subtle/40 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-app-border hover:shadow-[0_18px_42px_rgba(0,0,0,0.07)]"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-[18px] border border-app-border-subtle bg-app-surface p-3">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-base font-semibold text-app-text-secondary">自由创建</h4>
                      <span className="rounded-full border border-app-border-subtle bg-app-surface px-2 py-0.5 text-[10px] text-app-text-subtle">
                        新建
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-app-text-muted">
                      从业务目标直接开始，输入任务后由系统完成驾驶舱创建与初始化。
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-app-border-subtle pt-4 text-[11px] text-app-text-subtle">
                  <span>直接输入目标开始创建</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>

              {PRESET_BLUEPRINTS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => openCreateDialog(preset.id, { name: preset.title, command: preset.prompt })}
                  className="group rounded-[24px] border border-app-border-subtle bg-gradient-to-br from-app-surface to-app-surface-subtle/40 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-app-border hover:shadow-[0_18px_42px_rgba(0,0,0,0.07)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-[18px] border border-app-border-subtle bg-app-surface p-3" style={{ backgroundColor: `${preset.color}10` }}>
                      <WorkspaceIcon icon={preset.icon} color={preset.color} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-base font-semibold text-app-text-secondary">{preset.title}</h4>
                        <span className="rounded-full border border-app-border-subtle bg-app-surface px-2 py-0.5 text-[10px] text-app-text-subtle">
                          {preset.category}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-app-text-muted">{preset.description}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-app-border-subtle pt-4 text-[11px] text-app-text-subtle">
                    <span>点击后进入模板创建并自动填充要求</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {workspaceSummaries.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-app-border-subtle bg-app-surface-subtle/30 px-6 py-14 text-center">
            <FolderPlus className="mx-auto h-8 w-8 text-app-text-subtle" />
            <div className="mt-3 text-sm font-medium text-app-text-secondary">还没有驾驶舱实例</div>
            <div className="mt-2 text-xs text-app-text-subtle">从上方快速创建开始，生成第一个驾驶舱。</div>
            <button
              type="button"
              onClick={() => openCreateDialog(null)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-4 py-2 text-xs font-medium text-white transition-all hover:from-red-400 hover:to-orange-400"
            >
              <Plus className="h-3.5 w-3.5" />
              创建第一个驾驶舱
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {workspaceSummaries.map(({ workspace, topMetricValue, healthLabel, dataModeLabel, controlModeLabel, widgets }) => {
              const Icon = wsIcons[workspace.icon] || Layers;
              return (
                <div
                  key={workspace.id}
                  onClick={() => onSelectWorkspace(workspace.id)}
                  className="group relative cursor-pointer rounded-[24px] border border-app-border-subtle bg-gradient-to-br from-app-surface to-app-surface-subtle/40 p-5 transition-all hover:-translate-y-0.5 hover:border-app-border hover:shadow-[0_18px_42px_rgba(0,0,0,0.07)]"
                >
                  <div className="absolute right-4 top-4 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {onDeleteWorkspace && (
                      <button
                        onClick={(e) => handleDeleteClick(e, workspace)}
                        className="rounded-lg p-1.5 text-app-text-subtle transition-colors hover:bg-red-500/10 hover:text-red-500"
                        title="删除驾驶舱"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="rounded-[18px] border border-app-border-subtle bg-app-surface p-3" style={{ backgroundColor: `${workspace.color}10` }}>
                      <Icon className="h-5 w-5" style={{ color: workspace.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-base font-semibold text-app-text-secondary">{workspace.name}</h4>
                        <span className="rounded-full border border-app-border-subtle bg-app-surface px-2 py-0.5 text-[10px] text-app-text-subtle">
                          {healthLabel}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-app-text-muted">{workspace.description}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-app-text-subtle">
                    <span className="rounded-full bg-app-surface-subtle px-2.5 py-1">主摘要 {topMetricValue}</span>
                    <span className="rounded-full bg-app-surface-subtle px-2.5 py-1">{controlModeLabel}</span>
                    <span className="rounded-full bg-app-surface-subtle px-2.5 py-1">{dataModeLabel}</span>
                    <span className="rounded-full bg-app-surface-subtle px-2.5 py-1">{widgets.length} 个组件</span>
                    <span className="rounded-full bg-app-surface-subtle px-2.5 py-1">更新于 {formatRelativeDate(workspace.updatedAt)}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-app-border-subtle pt-4">
                    {widgets.slice(0, 3).map((widget) => (
                      <div key={widget.id} className="rounded-2xl border border-app-border-subtle bg-app-surface px-2.5 py-2">
                        <div className="truncate text-[10px] text-app-text-subtle">{widget.title}</div>
                        <div className="mt-1 truncate text-[11px] font-medium text-app-text-secondary">
                          {widget.type === 'metric'
                            ? String((widget.data as Record<string, unknown> | undefined)?.value || '—')
                            : widget.type}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateCockpitDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onExecute={(command) => {
          if (!onExecute) return;
          setDialogOpen(false);
          setInitialTemplateId(null);
          setInitialName(null);
          setInitialCommand(null);
          onExecute(command);
        }}
        onCreateFromTemplate={handleCreateFromTemplate}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          icon: template.icon,
          color: template.color,
          initPrompt: template.initPrompt,
          description: template.description,
          domain: template.domain,
          keywords: template.keywords || [],
          widgetsCount: template.widgets?.length ?? 0,
          useDemoDataFallback: template.useDemoDataFallback,
        }))}
        executing={executing}
        initialTemplateId={initialTemplateId}
        initialName={initialName}
        initialCommand={initialCommand}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-sm border border-app-border bg-app-surface-elevated text-app-text">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-app-text">确认删除驾驶舱</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-app-text-muted">
              驾驶舱「{deleteTarget?.name}」将被永久删除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={deleting}
              className="h-9 border-app-border bg-transparent text-xs text-app-text-muted hover:bg-app-surface-hover hover:text-app-text-secondary"
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="h-9 border-0 bg-red-500 text-xs text-white hover:bg-red-400"
            >
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
