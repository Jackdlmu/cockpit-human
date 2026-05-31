import type { Workspace, CockpitTemplate } from '@/types';
import { useState, useCallback, useEffect, useMemo, type ElementType, type MouseEvent } from 'react';
import {
  ChevronDown,
  ArrowRight,
  BarChart3,
  DollarSign,
  FolderPlus,
  Gauge,
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
    description: '聚焦收入、利润、现金流与风险预警。',
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

const QUICK_CREATE_EXPANDED_KEY = 'cockpit.quickCreateExpanded';

function loadQuickCreateExpanded() {
  try {
    const stored = localStorage.getItem(QUICK_CREATE_EXPANDED_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // ignore storage errors
  }
  return true;
}

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
  const controlModeLabel = workspace.executionOwner === 'external'
    ? workspace.externalProvider === 'yonclaw'
      ? 'YonClaw 主控'
      : workspace.externalProvider === 'openclaw'
        ? 'OpenClaw 主控'
        : '外部主控'
    : '驾驶舱主控';
  return { controlModeLabel, widgets };
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
  const [quickCreateExpanded, setQuickCreateExpanded] = useState(loadQuickCreateExpanded);
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

  const toggleQuickCreateExpanded = useCallback(() => {
    setQuickCreateExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(QUICK_CREATE_EXPANDED_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
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
    <div className="bi-page flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="bi-toolbar">
        <div className="mx-auto flex w-full max-w-[1480px] items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-primary/15 bg-primary/8 p-2.5 shadow-sm">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-app-text">智能驾驶舱</h1>
              <p className="text-[13px] text-app-text-muted">智能驱动的动态业务决策系统</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetTrigger asChild>
                <button
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-app-text-muted transition-colors hover:bg-app-surface-hover hover:text-app-text-secondary"
                  title="常用配置"
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
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              新建驾驶舱
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-5 px-6 py-5">
        <section
          className="bi-panel relative overflow-hidden px-5 py-4"
          style={{
            backgroundImage: [
              'linear-gradient(90deg, hsl(var(--app-border-subtle) / 0.36) 1px, transparent 1px)',
              'linear-gradient(0deg, hsl(var(--app-border-subtle) / 0.28) 1px, transparent 1px)',
              'linear-gradient(135deg, transparent 0%, transparent 54%, hsl(var(--primary) / 0.055) 54%, transparent 70%)',
              'linear-gradient(180deg, hsl(var(--app-surface)) 0%, hsl(var(--app-surface-subtle) / 0.62) 100%)',
            ].join(', '),
            backgroundSize: '44px 44px, 44px 44px, 100% 100%, 100% 100%',
            backgroundPosition: '-1px -1px, -1px -1px, center, center',
          }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/45 via-app-border-subtle to-transparent" />
          <div className="pointer-events-none absolute bottom-0 left-5 right-5 h-px bg-app-border-subtle/70" />
          <div className="pointer-events-none absolute left-0 top-5 h-20 w-1 rounded-r-full bg-primary/70" />
          <div className="pointer-events-none absolute right-8 top-8 hidden w-48 space-y-2 opacity-60 lg:block">
            <div className="ml-auto h-1 w-36 rounded-full bg-primary/18" />
            <div className="ml-auto h-1 w-24 rounded-full bg-sky-500/16" />
            <div className="ml-auto h-1 w-44 rounded-full bg-emerald-500/14" />
          </div>
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-[58rem] flex-1">
              <div className="text-xs font-medium uppercase tracking-[0.24em] text-app-text-muted">Enterprise Cockpit</div>
              <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-app-text">
                面向企业决策与执行的一体化智能驾驶舱
              </h2>
              <p className="mt-2 max-w-[44rem] text-[15px] leading-7 text-app-text-muted min-[1220px]:max-w-none min-[1220px]:whitespace-nowrap">
                围绕业务目标快速生成驾驶舱，打造您专属化的智慧分析与决策平台
              </p>
            </div>
            <button
              type="button"
              onClick={toggleQuickCreateExpanded}
              className="inline-flex items-center gap-2 rounded-lg border border-app-border-subtle bg-app-surface/92 px-3 py-2 text-[13px] text-app-text-muted shadow-sm transition-colors hover:border-app-border hover:bg-app-surface hover:text-app-text-secondary"
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
                className="group flex min-h-[172px] flex-col rounded-lg border border-app-border-subtle bg-app-surface p-4 text-left shadow-sm transition-all hover:border-app-border-hover hover:shadow-md"
              >
                <div className="flex min-h-0 flex-1 items-start gap-4">
                  <div className="rounded-lg border border-app-border-subtle bg-app-surface-subtle p-3">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-[17px] font-semibold text-app-text-secondary">自由创建</h4>
                      <span className="bi-chip shrink-0 whitespace-nowrap">
                        新建
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-[48px] text-[14px] leading-6 text-app-text-muted">
                      从业务目标直接开始，输入任务后由系统完成驾驶舱创建与初始化。
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-app-border-subtle pt-4 text-[12px] text-app-text-muted">
                  <span>直接输入目标开始创建</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>

              {PRESET_BLUEPRINTS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => openCreateDialog(preset.id, { name: preset.title, command: preset.prompt })}
                  className="group flex min-h-[172px] flex-col rounded-lg border border-app-border-subtle bg-app-surface p-4 text-left shadow-sm transition-all hover:border-app-border-hover hover:shadow-md"
                >
                  <div className="flex min-h-0 flex-1 items-start gap-4">
                    <div className="rounded-lg border border-app-border-subtle bg-app-surface-subtle p-3" style={{ backgroundColor: `${preset.color}10` }}>
                      <WorkspaceIcon icon={preset.icon} color={preset.color} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-[17px] font-semibold text-app-text-secondary">{preset.title}</h4>
                        <span className="bi-chip shrink-0 whitespace-nowrap">
                          {preset.category}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 min-h-[48px] text-[14px] leading-6 text-app-text-muted">{preset.description}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-app-border-subtle pt-4 text-[12px] text-app-text-muted">
                    <span>点击后进入模板创建并自动填充要求</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {workspaceSummaries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-app-border bg-app-surface/80 px-6 py-14 text-center">
            <FolderPlus className="mx-auto h-8 w-8 text-app-text-subtle" />
            <div className="mt-3 text-[15px] font-semibold text-app-text-secondary">还没有驾驶舱实例</div>
            <div className="mt-2 text-[13px] text-app-text-muted">从上方快速创建开始，生成第一个驾驶舱。</div>
            <button
              type="button"
              onClick={() => openCreateDialog(null)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              创建第一个驾驶舱
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {workspaceSummaries.map(({ workspace, controlModeLabel, widgets }) => {
              const Icon = wsIcons[workspace.icon] || Layers;
              return (
                <div
                  key={workspace.id}
                  onClick={() => onSelectWorkspace(workspace.id)}
                  className="group relative cursor-pointer rounded-lg border border-app-border-subtle bg-app-surface p-4 shadow-sm transition-all hover:border-app-border-hover hover:shadow-md"
                >
                  <div className="absolute right-3 top-3 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {onDeleteWorkspace && (
                      <button
                        onClick={(e) => handleDeleteClick(e, workspace)}
                        className="bi-icon-button bg-app-surface/90 text-app-text-subtle shadow-sm hover:bg-red-500/10 hover:text-red-500"
                        title="删除驾驶舱"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-app-border-subtle bg-app-surface-subtle p-2.5" style={{ backgroundColor: `${workspace.color}10` }}>
                      <Icon className="h-5 w-5" style={{ color: workspace.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-[16px] font-semibold text-app-text-secondary">{workspace.name}</h4>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[14px] leading-6 text-app-text-muted">{workspace.description}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-app-text-muted">
                    <span className="bi-chip">{controlModeLabel}</span>
                    <span className="bi-chip">{widgets.length} 个组件</span>
                    <span className="bi-chip">更新于 {formatRelativeDate(workspace.updatedAt)}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-app-border-subtle pt-4">
                    {widgets.slice(0, 3).map((widget) => (
                      <div key={widget.id} className="rounded-md border border-app-border-subtle/75 bg-app-surface-subtle/50 px-3 py-2.5">
                        <div className="truncate text-[11px] font-medium text-app-text-muted">{widget.title}</div>
                        <div className="mt-1.5 truncate text-[13px] font-semibold text-app-text-secondary">
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
