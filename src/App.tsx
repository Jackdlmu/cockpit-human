import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router';
import { WorkspaceView } from '@/components/WorkspaceView';
import { WorkspaceDetail } from '@/components/WorkspaceDetail';
import { TemplateManager } from '@/pages/TemplateManager';
import { Loader2 } from 'lucide-react';
import { deleteWorkspace } from '@/api/client';
import { useAgents, useWorkspaces } from '@/hooks/useApiData';
import { useEventStream } from '@/hooks/useEventStream';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import './App.css';

function App() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const { agents, loading: agentsLoading } = useAgents();
  const { workspaces, loading: workspacesLoading, refresh: refreshWorkspaces } = useWorkspaces();
  const { events, connected: wsConnected } = useEventStream();

  // 事件 toast 通知 + workspace.created 自动刷新
  useEffect(() => {
    if (events.length === 0 || !wsConnected) return;
    const latest = events[events.length - 1];
    if (latest.type === 'system') return;

    if (latest.type === 'workspace.created') {
      refreshWorkspaces();
      const payload = latest.payload as any;
      toast.success('驾驶舱已创建', {
        description: payload?.name || '',
        duration: 4000,
      });
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
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedWorkspaceId(null);
  }, []);

  const handleDeleteWorkspace = useCallback(async (id: string) => {
    try {
      await deleteWorkspace(id);
      refreshWorkspaces();
      toast.success('驾驶舱已删除');
    } catch (err: any) {
      toast.error('删除失败', { description: err.message });
      throw err;
    }
  }, [refreshWorkspaces]);

  const loading = agentsLoading || workspacesLoading;

  // 管理页面路由
  if (location.pathname === '/admin/templates') {
    return (
      <>
        <TemplateManager onBack={() => navigate('/')} />
        <Toaster position="top-right" richColors />
      </>
    );
  }

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
        <WorkspaceDetail
          workspaceId={selectedWorkspaceId}
          agents={agents}
          onBack={handleBackToList}
        />
      ) : (
        <WorkspaceView
          workspaces={workspaces}
          onSelectWorkspace={handleSelectWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
        />
      )}
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
