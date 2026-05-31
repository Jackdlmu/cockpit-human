import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { WorkspaceView } from '@/components/WorkspaceView';
import { WorkspaceDetail } from '@/components/WorkspaceDetail';
import { TemplateManager } from '@/pages/TemplateManager';
import { Loader2 } from 'lucide-react';
import { deleteWorkspace, cockpitAgentChatStream, createCockpitFromTemplate, getTemplates } from '@/api/client';
import { useAgents, useWorkspaces } from '@/hooks/useApiData';
import { useEventStream } from '@/hooks/useEventStream';
import { useLayoutSettings } from '@/hooks/useLayoutSettings';
import CreateCockpitDialog from '@/components/CreateCockpitDialog';
import CreationProgressToast from '@/components/CreationProgressToast';
import SettingsPanel from '@/components/SettingsPanel';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
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
import SidebarLayout from '@/components/layout/SidebarLayout';
import SidebarNav from '@/components/layout/SidebarNav';
import TabsLayout from '@/components/layout/TabsLayout';
import TabBar from '@/components/layout/TabBar';
import EmptyWelcome from '@/components/layout/EmptyWelcome';
import './App.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

type CreationProgressState = {
  visible: boolean;
  mode: 'agent' | 'template';
  stage: string;
  message: string;
  done: boolean;
  success: boolean;
  usedLLM: boolean;
  progressCurrent: number;
  progressTotal: number;
  progressLabel: string;
  initializationMode: 'llm' | 'real-data';
  workspaceId: string | null;
};

const initialCreationProgress: CreationProgressState = {
  visible: false,
  mode: 'agent',
  stage: 'thinking',
  message: '',
  done: false,
  success: false,
  usedLLM: false,
  progressCurrent: 0,
  progressTotal: 0,
  progressLabel: '组件初始化',
  initializationMode: 'llm',
  workspaceId: null,
};

function App() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    try { return localStorage.getItem('yoncockpit-selected-ws'); }
    catch { return null; }
  });
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  // 统一删除确认弹窗状态
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { agents, loading: agentsLoading } = useAgents();
  const { workspaces, loading: workspacesLoading, refresh: refreshWorkspaces } = useWorkspaces();
  const deleteConfirmName = workspaces.find((w) => w.id === deleteConfirmId)?.name || '';
  const { events, connected: wsConnected } = useEventStream();

  const {
    mode: layoutMode,
    sidebarCollapsed,
    openTabs,
    activeTabId,
    toggleSidebar,
    openTab,
    closeTab,
    setActiveTab,
    setOpenTabs,
    syncTabs,
  } = useLayoutSettings();

  // 同步 tabs + 验证 selectedWorkspaceId：当 workspace 被删除时自动清理
  useEffect(() => {
    if (workspacesLoading) return;
    const wsIds = new Set(workspaces.map((w) => w.id));
    syncTabs(wsIds);
    if (selectedWorkspaceId && !wsIds.has(selectedWorkspaceId)) {
      setSelectedWorkspaceId(null);
      localStorage.removeItem('yoncockpit-selected-ws');
    }
  }, [workspaces, workspacesLoading, selectedWorkspaceId, syncTabs]);

  // Tabs 模式：自动将所有 workspaces 平铺为 tabs（浏览器风格）
  useEffect(() => {
    if (layoutMode !== 'tabs' || workspacesLoading) return;
    if (workspaces.length === 0) {
      if (openTabs.length > 0) setOpenTabs([], null);
      return;
    }
    const wsIds = workspaces.map((w) => w.id);
    const tabSet = new Set(openTabs);
    // 保留现有 tab 顺序，将新 workspace 追加到末尾
    const newTabs = [...openTabs.filter((id) => tabSet.has(id) && wsIds.includes(id))];
    for (const id of wsIds) {
      if (!tabSet.has(id)) newTabs.push(id);
    }
    // 如果当前没有激活 tab，激活第一个
    const newActive = activeTabId && newTabs.includes(activeTabId) ? activeTabId : newTabs[0];
    if (newTabs.length !== openTabs.length || newActive !== activeTabId) {
      setOpenTabs(newTabs, newActive);
    }
  }, [layoutMode, workspaces, workspacesLoading, openTabs, activeTabId, setOpenTabs]);

  // ── 创建弹窗状态（sidebar/tabs 模式下使用） ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [initialTemplateId, setInitialTemplateId] = useState<string | null>(null);
  const [initialName, setInitialName] = useState<string | null>(null);
  const [initialCommand, setInitialCommand] = useState<string | null>(null);
  const [creationProgress, setCreationProgress] = useState<CreationProgressState>(initialCreationProgress);

  // 用于在实时事件中读取最新状态，避免闭包拿到旧值
  const selectedWorkspaceIdRef = useRef<string | null>(null);
  selectedWorkspaceIdRef.current = layoutMode === 'tabs' ? activeTabId : selectedWorkspaceId;
  const creationProgressRef = useRef<CreationProgressState>(initialCreationProgress);
  creationProgressRef.current = creationProgress;

  const handleOpenDialog = useCallback(() => {
    if (workspaces.length >= 30) {
      toast.error('驾驶舱数量已达上限（30个）', { description: '请先删除部分驾驶舱后再创建' });
      return;
    }
    setDialogOpen(true);
    setInitialTemplateId(null);
    setInitialName(null);
    setInitialCommand(null);
    getTemplates().then((data) => {
      setTemplates(data.templates);
    }).catch(() => {
      console.error('加载模板失败');
    });
  }, [workspaces.length]);

  const handleCloseDialog = useCallback(() => {
    if (!executing) {
      setDialogOpen(false);
      setInitialTemplateId(null);
      setInitialName(null);
      setInitialCommand(null);
    }
  }, [executing]);

  const handleCloseCreationProgress = useCallback(() => {
    setCreationProgress(initialCreationProgress);
  }, []);

  const handleExecute = useCallback((command: string) => {
    setExecuting(true);
    setDialogOpen(false);
    setInitialTemplateId(null);
    setInitialName(null);
    setInitialCommand(null);

    setCreationProgress({
      ...initialCreationProgress,
      visible: true,
      mode: 'agent',
      stage: 'thinking',
      message: '正在分析您的需求...',
    });

    let messageBuffer = '';

    cockpitAgentChatStream(
      command,
      undefined,
      undefined,
      undefined,
      (chunk, stage) => {
        messageBuffer += chunk;
        const lines = messageBuffer.split('\n').filter((l) => l.trim());
        const lastLine = lines[lines.length - 1] || '';
        const normalizedMessage = lastLine
          ? lastLine.replace(/^\s*[💡⚙️📋📝✅❌]\s*/, '').trim() || '处理中...'
          : '处理中...';
        setCreationProgress((prev) => ({
          ...prev,
          stage: stage || prev.stage,
          message: normalizedMessage,
        }));
      },
      (data) => {
        setExecuting(false);
        setCreationProgress((prev) => ({
          ...prev,
          done: true,
          success: true,
          usedLLM: data.usedLLM ?? false,
          message: data.message || '执行完成',
        }));

        if (data.results) {
          const createResult = data.results?.find(
            (r: Record<string, unknown>) => r.success === true && (r.data as Record<string, string>)?.id?.startsWith('ws-')
          );
          if (createResult) {
            const workspace = (createResult.data as Record<string, unknown>) || {};
            const newId = String(workspace.id || '');
            const initializing = data.initializing ?? Boolean(workspace.initializing);
            const initializationMode = (data.initializationMode || workspace.initializationMode || 'llm') as 'llm' | 'real-data';
            setCreationProgress((prev) => ({
              ...prev,
              mode: 'agent',
              workspaceId: newId || prev.workspaceId,
              message: initializing
                ? (initializationMode === 'real-data' ? '驾驶舱已创建，正在获取真实数据...' : '驾驶舱已创建，正在初始化组件数据...')
                : '驾驶舱创建成功',
              done: !initializing,
              success: !initializing || prev.success,
              stage: initializing ? 'initializing' : prev.stage,
              initializationMode,
              progressLabel: initializationMode === 'real-data' ? '真实数据初始化' : '组件初始化',
            }));
            refreshWorkspaces();
            if (layoutMode === 'tabs') {
              openTab(newId);
            } else {
              setSelectedWorkspaceId(newId);
              localStorage.setItem('yoncockpit-selected-ws', newId);
            }
            if (!initializing) {
              setTimeout(() => {
                handleCloseCreationProgress();
              }, 2000);
            }
            return;
          }
        }
        setTimeout(() => {
          handleCloseCreationProgress();
        }, 2000);
      },
      (err) => {
        setExecuting(false);
        setCreationProgress((prev) => ({
          ...prev,
          done: true,
          success: false,
          stage: 'completed',
          message: `创建失败：${err.message}`,
        }));
      }
    );
  }, [layoutMode, openTab, refreshWorkspaces, handleCloseCreationProgress]);

  const handleCreateFromTemplate = useCallback(async (templateId: string, name: string, initPrompt: string) => {
    setExecuting(true);
    setDialogOpen(false);
    setInitialTemplateId(null);
    setInitialName(null);
    setInitialCommand(null);
    setCreationProgress({
      ...initialCreationProgress,
      visible: true,
      mode: 'template',
      stage: 'executing',
      message: '正在根据模板创建驾驶舱...',
    });

    try {
      const res = await createCockpitFromTemplate(templateId, name, initPrompt);
      const initializationMode = res.initializationMode === 'real-data' ? 'real-data' : 'llm';

      if (res.initializing) {
        setCreationProgress((prev) => ({
          ...prev,
          mode: 'template',
          stage: 'initializing',
          message: initializationMode === 'real-data'
            ? '正在尝试获取真实数据，请稍候...'
            : '正在初始化组件数据，请稍候...',
          initializationMode,
          progressLabel: initializationMode === 'real-data' ? '真实数据初始化' : '组件初始化',
          workspaceId: res.workspace.id,
        }));
      } else {
        setCreationProgress((prev) => ({
          ...prev,
          mode: 'template',
          stage: 'completed',
          done: true,
          success: true,
          message: '驾驶舱创建完成',
          initializationMode,
          workspaceId: res.workspace.id,
        }));
        setTimeout(() => handleCloseCreationProgress(), 2000);
      }

      await refreshWorkspaces();
      // 自动打开新创建的驾驶舱
      if (layoutMode === 'tabs') {
        openTab(res.workspace.id);
      } else {
        setSelectedWorkspaceId(res.workspace.id);
        localStorage.setItem('yoncockpit-selected-ws', res.workspace.id);
      }
    } catch (err: unknown) {
      setCreationProgress((prev) => ({
        ...prev,
        done: true,
        success: false,
        stage: 'completed',
        message: `创建失败：${err instanceof Error ? err.message : String(err)}`,
      }));
    } finally {
      setExecuting(false);
    }
  }, [layoutMode, openTab, refreshWorkspaces, handleCloseCreationProgress]);

  // 事件 toast 通知 + workspace.created 自动刷新
  useEffect(() => {
    if (events.length === 0 || !wsConnected) return;
    const latest = events[events.length - 1];
    if (latest.type === 'system') return;
    // 重连/刷新服务后会回放历史事件；历史初始化失败不应重新弹出“创建失败”。
    if (latest._isHistory) {
      return;
    }

    if (latest.type === 'workspace.created') {
      refreshWorkspaces();
      return;
    }

    if (latest.type === 'workspace.initializing') {
      const payload = latest.payload as Record<string, unknown>;
      const workspaceId = String(payload?.workspaceId || '');
      const sourceWorkspaceId = creationProgressRef.current.workspaceId;
      const hasActiveCreation = creationProgressRef.current.visible && !creationProgressRef.current.done;
      if (sourceWorkspaceId && workspaceId && sourceWorkspaceId !== workspaceId) {
        return;
      }
      if (!sourceWorkspaceId && !hasActiveCreation) {
        refreshWorkspaces();
        return;
      }
      const mode = payload?.mode === 'real-data' ? 'real-data' : 'llm';
      const sourceType = payload?.sourceType === 'template' ? 'template' : 'agent';
      setCreationProgress((prev) => ({
        ...prev,
        visible: true,
        mode: sourceType,
        stage: 'initializing',
        done: false,
        success: false,
        initializationMode: mode,
        message: mode === 'real-data'
          ? '驾驶舱已创建，正在获取真实数据...'
          : '驾驶舱已创建，正在初始化组件数据...',
        progressCurrent: 0,
        progressTotal: 0,
        progressLabel: mode === 'real-data' ? '真实数据初始化' : '组件初始化',
        workspaceId: workspaceId || prev.workspaceId,
      }));
      return;
    }

    if (latest.type === 'workspace.init_progress') {
      const payload = latest.payload as Record<string, unknown>;
      const widgetTitle = String(payload?.widgetTitle || '');
      const workspaceId = String(payload?.workspaceId || '');
      const sourceWorkspaceId = creationProgressRef.current.workspaceId;
      const hasActiveCreation = creationProgressRef.current.visible && !creationProgressRef.current.done;
      if (sourceWorkspaceId && workspaceId && sourceWorkspaceId !== workspaceId) {
        return;
      }
      if (!sourceWorkspaceId && !hasActiveCreation) {
        return;
      }
      setCreationProgress((prev) => ({
        ...prev,
        visible: true,
        done: false,
        success: false,
        stage: 'initializing',
        progressCurrent: (payload?.current as number) ?? 0,
        progressTotal: (payload?.total as number) ?? 0,
        message: widgetTitle
          ? `${prev.initializationMode === 'real-data' ? '正在获取真实数据' : '正在初始化'}：${widgetTitle}`
          : prev.initializationMode === 'real-data'
            ? '正在获取真实数据...'
            : '正在初始化组件数据...',
        workspaceId: workspaceId || prev.workspaceId,
      }));
      return;
    }

    if (latest.type === 'workspace.initialized') {
      const payload = latest.payload as Record<string, unknown>;
      const result = payload?.result as Record<string, unknown>;
      const mode = result?.mode === 'real-data' ? 'real-data' : 'llm';
      const updated = typeof result?.updated === 'number' ? result.updated : undefined;
      const total = typeof result?.total === 'number' ? result.total : undefined;
      const resultMessage = typeof result?.message === 'string' ? result.message : '';
      const hasError = result && (result.error || (typeof result.message === 'string' && result.message.includes('失败')));
      const workspaceId = String(payload?.workspaceId || '');
      const sourceWorkspaceId = creationProgressRef.current.workspaceId;
      const hasActiveCreation = creationProgressRef.current.visible && !creationProgressRef.current.done;
      if (sourceWorkspaceId && workspaceId && sourceWorkspaceId !== workspaceId) {
        return;
      }
      if (!sourceWorkspaceId && !hasActiveCreation) {
        refreshWorkspaces();
        if ((payload?.workspaceId as string | undefined) === selectedWorkspaceIdRef.current) {
          setDetailRefreshKey(k => k + 1);
        }
        return;
      }
      if (hasError) {
        setCreationProgress((prev) => ({
          ...prev,
          visible: true,
          done: true,
          success: false,
          stage: 'completed',
          message: resultMessage ||
            (mode === 'real-data'
              ? '真实数据初始化未完全成功，请检查连接与模板数据源配置'
              : '初始化完成，但部分数据可能不完整'),
          initializationMode: mode,
          workspaceId: workspaceId || prev.workspaceId,
        }));
      } else {
        setCreationProgress((prev) => ({
          ...prev,
          visible: true,
          done: true,
          success: true,
          stage: 'completed',
          message: resultMessage ||
            (mode === 'real-data' && updated !== undefined && total !== undefined
              ? `真实数据初始化完成（${updated}/${total}）`
              : '驾驶舱初始化完成'),
          initializationMode: mode,
          workspaceId: workspaceId || prev.workspaceId,
        }));
        setTimeout(() => handleCloseCreationProgress(), 2000);
      }
      refreshWorkspaces();
      if ((payload?.workspaceId as string | undefined) === selectedWorkspaceIdRef.current) {
        setDetailRefreshKey(k => k + 1);
      }
      return;
    }

    if (latest.type === 'workspace.init_failed') {
      const payload = latest.payload as Record<string, unknown>;
      const result = payload?.result as Record<string, unknown> | undefined;
      const resultMessage = typeof result?.message === 'string' ? result.message : '';
      const workspaceId = String(payload?.workspaceId || '');
      const sourceWorkspaceId = creationProgressRef.current.workspaceId;
      const hasActiveCreation = creationProgressRef.current.visible && !creationProgressRef.current.done;
      if (sourceWorkspaceId && workspaceId && sourceWorkspaceId !== workspaceId) {
        return;
      }
      if (!sourceWorkspaceId && !hasActiveCreation) {
        refreshWorkspaces();
        if ((payload?.workspaceId as string | undefined) === selectedWorkspaceIdRef.current) {
          setDetailRefreshKey(k => k + 1);
        }
        return;
      }
      setCreationProgress((prev) => ({
        ...prev,
        visible: true,
        done: true,
        success: false,
        stage: 'completed',
        message: resultMessage
          ? `${resultMessage}\n${String(payload?.error || '')}`.trim()
          : `初始化失败：${String(payload?.error || '未知错误')}`,
        workspaceId: workspaceId || prev.workspaceId,
      }));
      refreshWorkspaces();
      if ((payload?.workspaceId as string | undefined) === selectedWorkspaceIdRef.current) {
        setDetailRefreshKey(k => k + 1);
      }
      return;
    }

    if (latest.type === 'workspace.updated') {
      return;
    }

    const sourceLabels: Record<string, string> = {
      yonclaw: 'YonClaw',
      openclaw: 'OpenClaw',
      hermes: 'Hermes',
    };
    const sourceName = sourceLabels[latest.sourceType] || latest.sourceType;

    toast.info(`${sourceName} · ${latest.type}`, {
      description: JSON.stringify(latest.payload).slice(0, 80),
      duration: 5000,
    });
  }, [events, wsConnected, refreshWorkspaces]);

  const handleSelectWorkspace = useCallback((wsId: string) => {
    setSelectedWorkspaceId(wsId);
    localStorage.setItem('yoncockpit-selected-ws', wsId);
    if (layoutMode === 'tabs') {
      openTab(wsId);
    }
  }, [layoutMode, openTab]);

  const handleBackToList = useCallback(() => {
    if (layoutMode === 'tabs' && activeTabId) {
      closeTab(activeTabId);
    } else if (layoutMode === 'cards') {
      setSelectedWorkspaceId(null);
      localStorage.removeItem('yoncockpit-selected-ws');
    }
    // sidebar 模式下 onBack 无操作
  }, [layoutMode, activeTabId, closeTab]);

  const handleDeleteWorkspace = useCallback(async (id: string) => {
    try {
      await deleteWorkspace(id);
      refreshWorkspaces();
      toast.success('驾驶舱已删除');
    } catch (err: unknown) {
      toast.error('删除失败', { description: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }, [refreshWorkspaces]);

  const requestDelete = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      await handleDeleteWorkspace(deleteConfirmId);
      setDeleteConfirmId(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirmId, handleDeleteWorkspace]);

  const loading = agentsLoading || workspacesLoading;

  // 管理页面路由
  if (location.pathname === '/admin/templates') {
    return (
      <>
        <TemplateManager />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  // WorkspaceDetail 共享渲染
  const renderWorkspaceDetail = (wsId: string) => (
    <WorkspaceDetail
      key={`${wsId}-${detailRefreshKey}`}
      workspaceId={wsId}
      agents={agents}
      workspaces={workspaces}
      onBack={handleBackToList}
      onSelectWorkspace={handleSelectWorkspace}
      layoutMode={layoutMode}
      onRequestDelete={requestDelete}
    />
  );

  // 共享的创建弹窗（sidebar/tabs 模式下需要）
  const renderCreateDialog = layoutMode !== 'cards' ? (
    <CreateCockpitDialog
      open={dialogOpen}
      onClose={handleCloseDialog}
      onExecute={handleExecute}
      onCreateFromTemplate={handleCreateFromTemplate}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        color: t.color,
        initPrompt: t.initPrompt,
        description: t.description,
        domain: t.domain,
        keywords: t.keywords || [],
        widgetsCount: t.widgets?.length,
        useDemoDataFallback: t.useDemoDataFallback,
      }))}
      executing={executing}
      initialTemplateId={initialTemplateId}
      initialName={initialName}
      initialCommand={initialCommand}
    />
  ) : null;

  const renderCreationProgress = (
    <CreationProgressToast
      visible={creationProgress.visible}
      stage={creationProgress.stage}
      message={creationProgress.message}
      done={creationProgress.done}
      success={creationProgress.success}
      usedLLM={creationProgress.usedLLM}
      progressCurrent={creationProgress.progressCurrent}
      progressTotal={creationProgress.progressTotal}
      progressLabel={creationProgress.progressLabel}
      initializationMode={creationProgress.initializationMode}
      onClose={handleCloseCreationProgress}
    />
  );

  // 共享的设置面板（sidebar/tabs 模式下需要）
  const renderSettingsSheet = layoutMode !== 'cards' ? (
    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-app-bg border-l border-app-border p-0"
      >
        <div className="h-full p-6">
          <SettingsPanel />
        </div>
      </SheetContent>
    </Sheet>
  ) : null;

  // 统一删除确认弹窗
  const renderDeleteConfirmDialog = (
    <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && !deleting && setDeleteConfirmId(null)}>
      <AlertDialogContent className="bg-app-surface-elevated border border-app-border text-app-text max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold text-app-text">确认删除驾驶舱</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-app-text-muted">
            驾驶舱「{deleteConfirmName}」将被永久删除，此操作不可撤销。
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
            onClick={confirmDelete}
            disabled={deleting}
            className="h-9 text-xs bg-red-500 hover:bg-red-400 text-white border-0"
          >
            {deleting ? '删除中...' : '确认删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Cards 模式：保持原有逻辑
  if (layoutMode === 'cards') {
    return (
      <div className="h-screen w-screen flex overflow-hidden bg-app-bg">
        {loading && !selectedWorkspaceId && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-app-overlay/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
              <span className="text-sm text-app-text-muted">加载中...</span>
            </div>
          </div>
        )}
        {selectedWorkspaceId ? (
          renderWorkspaceDetail(selectedWorkspaceId)
        ) : (
          <WorkspaceView
            workspaces={workspaces}
            onSelectWorkspace={handleSelectWorkspace}
            onDeleteWorkspace={handleDeleteWorkspace}
            onExecute={handleExecute}
            executing={executing}
            onCreateFromTemplate={handleCreateFromTemplate}
          />
        )}
        {renderDeleteConfirmDialog}
        {renderCreationProgress}
        <Toaster position="bottom-right" richColors />
      </div>
    );
  }

  // Sidebar 模式：侧边栏 + 主内容区
  if (layoutMode === 'sidebar') {
    const activeId = selectedWorkspaceId || workspaces[0]?.id || null;

    return (
      <SidebarLayout
        sidebar={
          <SidebarNav
            workspaces={workspaces}
            selectedId={activeId}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            onSelect={(id) => {
              setSelectedWorkspaceId(id);
              localStorage.setItem('yoncockpit-selected-ws', id);
            }}
            onCreate={handleOpenDialog}
            onSettings={() => setSettingsOpen(true)}
          />
        }
      >
        {activeId ? renderWorkspaceDetail(activeId) : (
          <EmptyWelcome onCreate={handleOpenDialog} workspaces={workspaces} onSelectWorkspace={handleSelectWorkspace} />
        )}
        {renderCreateDialog}
        {renderSettingsSheet}
        {renderDeleteConfirmDialog}
        {renderCreationProgress}
        <Toaster position="bottom-right" richColors />
      </SidebarLayout>
    );
  }

  // Tabs 模式：页签栏 + 主内容区
  if (layoutMode === 'tabs') {
    // 过滤已不存在的 workspace
    const wsIds = new Set(workspaces.map(w => w.id));
    const validActiveTab = activeTabId && wsIds.has(activeTabId) ? activeTabId : null;

    return (
      <TabsLayout
        tabBar={
          <TabBar
            workspaces={workspaces}
            openTabs={openTabs}
            activeTabId={validActiveTab}
            onSelect={setActiveTab}
            onClose={requestDelete}
            onCreate={handleOpenDialog}
            onSettings={() => setSettingsOpen(true)}
          />
        }
      >
        {validActiveTab ? renderWorkspaceDetail(validActiveTab) : (
          <EmptyWelcome onCreate={handleOpenDialog} workspaces={workspaces} onSelectWorkspace={handleSelectWorkspace} />
        )}
        {renderCreateDialog}
        {renderSettingsSheet}
        {renderDeleteConfirmDialog}
        {renderCreationProgress}
        <Toaster position="bottom-right" richColors />
      </TabsLayout>
    );
  }

  return null;
}

export default App;
