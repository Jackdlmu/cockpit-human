import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { WorkspaceView } from '@/components/WorkspaceView';
import { WorkspaceDetail } from '@/components/WorkspaceDetail';
import { TemplateManager } from '@/pages/TemplateManager';
import { Loader2 } from 'lucide-react';
import { deleteWorkspace, cockpitAgentChatStream, createCockpitFromTemplate, getTemplates } from '@/api/client';
import { useAgents, useWorkspaces } from '@/hooks/useApiData';
import { useEventStream } from '@/hooks/useEventStream';
import { useLayoutSettings } from '@/hooks/useLayoutSettings';
import CreateCockpitDialog from '@/components/CreateCockpitDialog';
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

function App() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    try { return localStorage.getItem('yoncockpit-selected-ws'); }
    catch { return null; }
  });
  const navigate = useNavigate();
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

  // 用于在 workspace.initialized 事件中判断当前查看的 workspace
  const selectedWorkspaceIdRef = useRef<string | null>(null);
  selectedWorkspaceIdRef.current = layoutMode === 'tabs' ? activeTabId : selectedWorkspaceId;

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

  const handleOpenDialog = useCallback(() => {
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
  }, [workspaces.length]);

  const handleCloseDialog = useCallback(() => {
    if (!executing) setDialogOpen(false);
  }, [executing]);

  const handleExecute = useCallback((command: string) => {
    setExecuting(true);
    setDialogOpen(false);

    cockpitAgentChatStream(
      command,
      undefined,
      undefined,
      (_chunk, _stage) => {
        // 简化：不显示详细进度
      },
      (data) => {
        setExecuting(false);
        if (data.results) {
          const createResult = data.results?.find(
            (r: Record<string, unknown>) => r.success === true && (r.data as Record<string, string>)?.id?.startsWith('ws-')
          );
          if (createResult) {
            const newId = (createResult.data as Record<string, string>).id;
            toast.success('驾驶舱创建成功', { description: `ID: ${newId}` });
            refreshWorkspaces();
            // 自动打开新创建的驾驶舱
            if (layoutMode === 'tabs') {
              openTab(newId);
            } else {
              setSelectedWorkspaceId(newId);
              localStorage.setItem('yoncockpit-selected-ws', newId);
            }
            return;
          }
        }
        toast.success(data.message || '执行完成');
      },
      (err) => {
        setExecuting(false);
        toast.error('创建失败', { description: err.message });
      }
    );
  }, [layoutMode, openTab, refreshWorkspaces]);

  const handleCreateFromTemplate = useCallback(async (templateId: string, name: string, initPrompt: string) => {
    setExecuting(true);
    setDialogOpen(false);
    try {
      const res = await createCockpitFromTemplate(templateId, name, initPrompt);
      toast.success(
        res.initializing ? '驾驶舱创建成功，正在初始化数据...' : '驾驶舱创建成功',
        { description: `ID: ${res.workspace.id}` }
      );
      await refreshWorkspaces();
      // 自动打开新创建的驾驶舱
      if (layoutMode === 'tabs') {
        openTab(res.workspace.id);
      } else {
        setSelectedWorkspaceId(res.workspace.id);
        localStorage.setItem('yoncockpit-selected-ws', res.workspace.id);
      }
    } catch (err: unknown) {
      toast.error('创建失败', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setExecuting(false);
    }
  }, [layoutMode, openTab, refreshWorkspaces]);

  // 事件 toast 通知 + workspace.created 自动刷新
  useEffect(() => {
    if (events.length === 0 || !wsConnected) return;
    const latest = events[events.length - 1];
    if (latest.type === 'system') return;

    if (latest.type === 'workspace.created') {
      refreshWorkspaces();
      const payload = latest.payload as Record<string, unknown>;
      toast.success('驾驶舱已创建', {
        description: String(payload?.name || ''),
        duration: 4000,
      });
      return;
    }

    // 驾驶舱初始化相关事件：显示友好消息，不暴露原始 JSON
    if (latest.type === 'workspace.initializing') {
      const payload = latest.payload as Record<string, unknown>;
      toast.info('驾驶舱初始化中...', {
        description: String(payload?.name || ''),
        duration: 3000,
      });
      return;
    }
    if (latest.type === 'workspace.initialized') {
      const payload = latest.payload as Record<string, unknown>;
      const result = payload?.result as Record<string, unknown>;
      const hasError = result && (result.error || (typeof result.message === 'string' && result.message.includes('失败')));
      if (hasError) {
        toast.warning('驾驶舱初始化完成，但数据可能不完整', {
          description: String(payload?.name || ''),
          duration: 4000,
        });
      } else {
        toast.success('驾驶舱初始化完成', {
          description: String(payload?.name || ''),
          duration: 3000,
        });
      }
      refreshWorkspaces();
      // 如果当前正在查看这个 workspace，强制刷新详情页数据
      if ((payload?.workspaceId as string | undefined) === selectedWorkspaceIdRef.current) {
        setDetailRefreshKey(k => k + 1);
      }
      return;
    }
    if (latest.type === 'workspace.init_failed') {
      const payload = latest.payload as Record<string, unknown>;
      toast.error('驾驶舱初始化失败', {
        description: `${String(payload?.name || '')} — ${String(payload?.error || '未知错误')}`,
        duration: 5000,
      });
      return;
    }

    // 跳过 layout 调整等频繁事件，避免干扰
    // 历史事件不触发 toast（重连后拉取的历史记录）
    if (latest._isHistory) {
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
        <TemplateManager onBack={() => navigate('/')} />
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
      templates={templates.map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: t.color, initPrompt: t.initPrompt }))}
      executing={executing}
    />
  ) : null;

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
            onRefreshWorkspaces={refreshWorkspaces}
          />
        )}
        {renderDeleteConfirmDialog}
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
        <Toaster position="bottom-right" richColors />
      </TabsLayout>
    );
  }

  return null;
}

export default App;
