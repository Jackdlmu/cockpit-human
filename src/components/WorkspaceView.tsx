import type { Workspace, CockpitTemplate } from '@/types';
import { useState, useCallback } from 'react';
import { Layers, BarChart3, UserPlus, CheckCircle, Monitor, Target, Plus, Clock, Settings, Trash2, DollarSign, TrendingUp, Code2, Users, Truck } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import SettingsPanel from './SettingsPanel';
import CreateCockpitDialog from './CreateCockpitDialog';
import CreationProgressToast from './CreationProgressToast';
import { cockpitAgentChatStream, getTemplates, createCockpitFromTemplate } from '@/api/client';
import { toast } from 'sonner';

interface WorkspaceViewProps {
  workspaces: Workspace[];
  onSelectWorkspace: (id: string) => void;
  onDeleteWorkspace?: (id: string) => Promise<void>;
  onRefreshWorkspaces?: () => Promise<void>;
}

const wsIcons: Record<string, React.ElementType> = {
  BarChart3, UserPlus, CheckCircle, Monitor, Target,
  DollarSign, TrendingUp, Code2, Users, Truck,
};



export function WorkspaceView({ workspaces, onSelectWorkspace, onDeleteWorkspace, onRefreshWorkspaces }: WorkspaceViewProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // 模板列表（用于新建弹窗快速选择）
  const [templates, setTemplates] = useState<CockpitTemplate[]>([]);

  // 进度浮层状态
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressStage, setProgressStage] = useState<string | undefined>(undefined);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressDone, setProgressDone] = useState(false);
  const [progressSuccess, setProgressSuccess] = useState(false);
  const [progressUsedLLM, setProgressUsedLLM] = useState<boolean | undefined>(undefined);
  const [executing, setExecuting] = useState(false);

  // 删除确认弹窗状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCloseDialog = useCallback(() => {
    if (!executing) setDialogOpen(false);
  }, [executing]);

  const handleExecute = useCallback((command: string) => {
    setExecuting(true);
    setProgressVisible(true);
    setProgressDone(false);
    setProgressSuccess(false);
    setProgressStage(undefined);
    setProgressMessage('');
    setDialogOpen(false);

    let fullMessage = '';

    cockpitAgentChatStream(
      command,
      undefined,
      undefined,
      (chunk, stage) => {
        fullMessage += chunk;
        setProgressMessage(fullMessage);
        if (stage) setProgressStage(stage);
      },
      (data) => {
        setExecuting(false);
        setProgressDone(true);
        setProgressUsedLLM(data.usedLLM);

        // 检查是否有 cockpit-create 成功的结果
        if (data.results) {
          const createResult = data.results.find(
            (r: Record<string, unknown>) => r.success === true && (r.data as Record<string, string>)?.id?.startsWith('ws-')
          );
          if (createResult) {
            const newId = (createResult.data as Record<string, string>).id;
            setProgressSuccess(true);
            setProgressMessage(`✅ ${data.message || '驾驶舱创建成功'}\n\n🆔 驾驶舱 ID：${newId}`);
            // 刷新列表并延迟后自动选中新驾驶舱
            const switchToNew = () => {
              setTimeout(() => {
                setProgressVisible(false);
                onSelectWorkspace(newId);
              }, 1500);
            };
            if (onRefreshWorkspaces) {
              onRefreshWorkspaces().then(switchToNew).catch(switchToNew);
            } else {
              switchToNew();
            }
            return;
          }
        }

        // 没有成功创建驾驶舱，但仍然完成
        setProgressSuccess(true);
        setProgressMessage(data.message || '执行完成');
      },
      (err) => {
        setExecuting(false);
        setProgressDone(true);
        setProgressSuccess(false);
        setProgressMessage(`❌ 出错：${err.message}`);
      }
    );
  }, [onSelectWorkspace, onRefreshWorkspaces]);

  const handleCloseProgress = useCallback(() => {
    setProgressVisible(false);
    setProgressMessage('');
    setProgressDone(false);
    setProgressUsedLLM(undefined);
  }, []);

  const handleDeleteClick = useCallback((e: React.MouseEvent, ws: Workspace) => {
    e.stopPropagation();
    setDeleteTarget(ws);
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
    setExecuting(true);
    setDialogOpen(false);
    try {
      const res = await createCockpitFromTemplate(templateId, name, initPrompt);
      toast.success(
        res.initializing ? '驾驶舱创建成功，正在初始化数据...' : '驾驶舱创建成功',
        { description: `ID: ${res.workspace.id}` }
      );
      // 刷新列表确保新驾驶舱出现
      if (onRefreshWorkspaces) {
        await onRefreshWorkspaces();
      }
      onSelectWorkspace(res.workspace.id);
    } catch (err: unknown) {
      toast.error('创建失败', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setExecuting(false);
    }
  }, [onSelectWorkspace, onRefreshWorkspaces]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-app-bg overflow-y-auto">
      {/* Header */}
      <div className="h-14 border-b border-app-border-subtle flex items-center px-6 shrink-0">
        <Layers className="w-5 h-5 text-app-text-subtle mr-3" />
        <div>
          <h1 className="text-lg font-semibold text-app-text">智能驾驶舱</h1>
          <p className="text-xs text-app-text-subtle">多智能体聚合执行的动态呈现与管理</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
            <SheetTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-app-text-muted hover:text-app-text-secondary hover:bg-app-surface-hover transition-colors text-sm"
                title="协议适配层设置"
              >
                <Settings className="w-4 h-4" />
                <span>设置</span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full sm:max-w-md bg-app-bg border-l border-app-border p-0"
            >
              <div className="h-full p-6">
                <SettingsPanel />
              </div>
            </SheetContent>
          </Sheet>
          <button
            onClick={() => {
              if (workspaces.length >= 30) {
                toast.error('驾驶舱数量已达上限（30个）', { description: '请先删除部分驾驶舱后再创建' });
                return;
              }
              setDialogOpen(true);
              getTemplates().then((data) => {
                setTemplates(data.templates);
              }).catch(() => {
                console.error('加载模板失败');
              });
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white text-sm font-medium hover:from-red-400 hover:to-orange-400 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>新建驾驶舱</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-app-text-subtle gap-3">
            <Layers className="w-8 h-8 text-app-text-muted" />
            <p className="text-sm">暂无驾驶舱</p>
            <p className="text-xs text-app-text-subtle">点击右上角「新建驾驶舱」创建您的第一个驾驶舱</p>
          </div>
        ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws) => {
            const Icon = wsIcons[ws.icon] || Layers;
            return (
              <div
                key={ws.id}
                onClick={() => onSelectWorkspace(ws.id)}
                className="group relative p-5 rounded-xl bg-app-surface border border-app-border-subtle shadow-[0_1px_3px_rgba(0,0,0,0.18)] hover:bg-app-surface-hover hover:border-app-border hover:shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition-all text-left cursor-pointer"
              >
                {/* Delete button */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onDeleteWorkspace && (
                      <button
                        onClick={(e) => handleDeleteClick(e, ws)}
                        className="p-1 rounded-md text-app-text-subtle hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="删除驾驶舱"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${ws.color}15` }}
                >
                  <Icon className="w-5 h-5" style={{ color: ws.color }} />
                </div>

                <h3 className="text-sm font-semibold text-app-text-secondary group-hover:text-app-text transition-colors mb-1.5">
                  {ws.name}
                </h3>
                <p className="text-xs text-app-text-muted leading-relaxed mb-4">
                  {ws.description}
                </p>

                <div className="flex items-center gap-4 text-[10px] text-app-text-subtle">
                  <div className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    <span>{ws.widgets.length} 组件</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>更新于 {ws.updatedAt.slice(5)}</span>
                  </div>
                </div>

                {/* Active Agents indicator */}
                {ws.agentIds && ws.agentIds.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="flex -space-x-1">
                      {ws.agentIds.slice(0, 3).map((agentId, idx) => {
                        const isPrimary = agentId === ws.primaryAgentId;
                        return (
                          <span
                            key={agentId}
                            className={`
                              w-4 h-4 rounded-full flex items-center justify-center text-[8px]
                              border border-app-surface-elevated
                              ${isPrimary ? 'bg-red-400 text-white z-10' : 'bg-app-surface-subtle text-app-text-subtle'}
                            `}
                          >
                            {isPrimary ? '◉' : '●'}
                          </span>
                        );
                      })}
                    </div>
                    {ws.orchestration && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          ws.orchestration.health === 'healthy' ? 'bg-emerald-400'
                            : ws.orchestration.health === 'degraded' ? 'bg-amber-400'
                            : 'bg-red-400'
                        }`}
                      />
                    )}
                  </div>
                )}

                {/* Widget preview */}
                <div className="mt-4 pt-4 border-t border-app-border-subtle grid grid-cols-3 gap-2">
                  {ws.widgets.slice(0, 3).map((w) => (
                    <div key={w.id} className="p-2 rounded-lg bg-app-surface-subtle border border-app-border-subtle shadow-[0_1px_2px_rgba(0,0,0,0.10)]">
                      <div className="text-[10px] text-app-text-subtle mb-1">{w.title}</div>
                      {w.type === 'metric' && (
                        <div className="text-xs font-bold text-app-text-muted">{((w.data as Record<string, string>)?.value) || '—'}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* 新建驾驶舱对话框 */}
      <CreateCockpitDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onExecute={handleExecute}
        onCreateFromTemplate={handleCreateFromTemplate}
        templates={templates.map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: t.color, initPrompt: t.initPrompt }))}
        executing={executing}
      />

      {/* 进度浮层 */}
      <CreationProgressToast
        visible={progressVisible}
        stage={progressStage}
        message={progressMessage}
        done={progressDone}
        success={progressSuccess}
        usedLLM={progressUsedLLM}
        onClose={handleCloseProgress}
      />

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-app-surface-elevated border border-app-border text-app-text max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-app-text">
              确认删除驾驶舱
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-app-text-muted">
              驾驶舱「{deleteTarget?.name}」将被永久删除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              disabled={deleting}
              className="h-9 text-xs border-app-border text-app-text-muted hover:bg-app-surface-hover hover:text-app-text-secondary bg-transparent"
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="h-9 text-xs bg-red-500 hover:bg-red-400 text-white border-0"
            >
              {deleting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
