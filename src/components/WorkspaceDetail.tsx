import { useState, useRef, useEffect, useCallback } from 'react';
import type { Widget, Agent, WidgetType, Workspace } from '@/types';
import DOMPurify from 'dompurify';
import { useWorkspaceDetail } from '@/hooks/useApiData';
import { useWidgetData } from '@/hooks/useWidgetData';
import { getThresholdColor, extractThresholds } from '@/hooks/useThresholdColor';
import { WidgetInteractionProvider, useWidgetInteraction } from '@/contexts/WidgetInteractionContext';
import { WidgetDetailDrawer } from './WidgetDetailDrawer';
import { CanvasGrid } from './CanvasGrid';
import { WidgetLibraryPanel } from './WidgetLibraryPanel';
import { inferWidgetType, isTypeMismatched } from '@/lib/widget-type-inferer';
import { Switch } from '@/components/ui/switch';
import { AgentAvatar } from '@/components/AgentAvatar';
import { workspaceCommandStream, cockpitAgentChatStream, updateWorkspace } from '@/api/client';
import { toast } from 'sonner';
import {
  Layers, BarChart3, UserPlus, CheckCircle, Monitor, Target,
  ArrowLeft, RefreshCw, Send, Sparkles,
  ChevronDown, ChevronUp, Trash2,
  ArrowRight, TrendingUp, TrendingDown, ArrowLeftIcon, Loader2, Check,
  FileText, AlertCircle, ExternalLink,
  DollarSign, Code2, Users, Truck, Plus,
} from 'lucide-react';

/** Sparkline 微型趋势图组件（SVG 纯实现） */
function Sparkline({ values, color = '#818cf8', height = 32 }: { values: number[]; color?: string; height?: number }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 64;
  const h = height;
  const padding = 2;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - padding - ((v - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* 终点圆点 */}
      {(() => {
        const lastX = w;
        const lastY = h - padding - ((values[values.length - 1] - min) / range) * (h - padding * 2);
        return <circle cx={lastX} cy={lastY} r="2" fill={color} />;
      })()}
    </svg>
  );
}

interface WorkspaceDetailProps {
  workspaceId: string;
  agents: Agent[];
  workspaces?: Workspace[];
  onBack: () => void;
  onSelectWorkspace?: (id: string) => void;
  layoutMode?: 'sidebar' | 'tabs' | 'cards';
  onRequestDelete?: (id: string) => void;
}

/** 根据 workspace 编排状态判断智能体角色 */
function resolveAgentRole(agentId: string, workspace: Workspace): 'primary' | 'collaborator' {
  if (!workspace.orchestration) {
    return agentId === workspace.primaryAgentId ? 'primary' : 'collaborator';
  }
  if (workspace.orchestration.mode === 'platform-led') {
    return agentId === workspace.orchestration.primaryAgent?.id ? 'primary' : 'collaborator';
  }
  // cockpit-led / llm-direct：驾驶舱智能体是主智能体，所有外部 agent 都是协作
  return 'collaborator';
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

interface ChatSession {
  messages: ChatMessage[];
  updatedAt: number;
  version: number;
}

const wsIcons: Record<string, React.ElementType> = { BarChart3, UserPlus, CheckCircle, Monitor, Target, DollarSign, TrendingUp, Code2, Users, Truck };
const CHAT_STORAGE_KEY = (id: string) => `ycc_chat_${id}`;
const CHAT_STORAGE_VERSION = 1;

/** 从 localStorage 恢复对话历史 */
function loadChatSession(workspaceId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY(workspaceId));
    if (!raw) return [];
    const session: ChatSession = JSON.parse(raw);
    if (session.version !== CHAT_STORAGE_VERSION) return [];
    // 30 天过期
    if (Date.now() - session.updatedAt > 30 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(CHAT_STORAGE_KEY(workspaceId));
      return [];
    }
    return session.messages;
  } catch {
    return [];
  }
}

/** 保存对话历史到 localStorage */
function saveChatSession(workspaceId: string, messages: ChatMessage[]) {
  try {
    const session: ChatSession = {
      messages,
      updatedAt: Date.now(),
      version: CHAT_STORAGE_VERSION,
    };
    localStorage.setItem(CHAT_STORAGE_KEY(workspaceId), JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

export function WorkspaceDetail(props: WorkspaceDetailProps) {
  return (
    <WidgetInteractionProvider>
      <WorkspaceDetailInner {...props} />
    </WidgetInteractionProvider>
  );
}

function WorkspaceDetailInner({ workspaceId, agents, workspaces: allWorkspaces, onBack, onSelectWorkspace, layoutMode, onRequestDelete }: WorkspaceDetailProps) {
  const { workspace, loading, refresh: refreshWorkspace } = useWorkspaceDetail(workspaceId);
  const { activeFilters, setFilter, clearFilter, clearAllFilters, hasFilters } = useWidgetInteraction();
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  // Agent selector
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const agentPickerRef = useRef<HTMLDivElement>(null);

  // Chat state
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatSession(workspaceId));
  const [streaming, setStreaming] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Widget detail drawer
  const [detailWidget, setDetailWidget] = useState<Widget | null>(null);
  // 下钻状态
  const [drillState, setDrillState] = useState<{ widget: Widget; context: Record<string, unknown>; dimension: string } | null>(null);

  // Canvas editing state
  const [isEditing, setIsEditing] = useState(false);
  const [widgetLibraryOpen, setWidgetLibraryOpen] = useState(false);
  const [localWidgets, setLocalWidgets] = useState<Widget[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Title editing state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (workspace) {
      setEditName(workspace.name);
      setEditDescription(workspace.description || '');
    }
  }, [workspace, isEditing]);

  // 从 workspace 同步 widgets
  useEffect(() => {
    if (workspace) {
      setLocalWidgets(workspace.widgets);
    }
  }, [workspace]);

  // 防抖保存布局
  const saveWidgets = useCallback((widgets: Widget[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      updateWorkspace(workspaceId, { widgets }).catch((err: unknown) => {
        toast.error('自动保存失败', { description: err instanceof Error ? err.message : String(err) });
      });
    }, 500);
  }, [workspaceId]);

  const handleLayoutChange = (newWidgets: Widget[]) => {
    setLocalWidgets(newWidgets);
    saveWidgets(newWidgets);
  };

  const handleDeleteWidget = (widgetId: string) => {
    const updated = localWidgets.filter((w) => w.id !== widgetId);
    setLocalWidgets(updated);
    saveWidgets(updated);
  };

  const handleSaveTitle = useCallback(async () => {
    if (!workspace) return;
    if (editName === workspace.name && editDescription === (workspace.description || '')) return;
    try {
      await updateWorkspace(workspaceId, { name: editName, description: editDescription });
      await refreshWorkspace();
      toast.success('已保存');
    } catch (err: unknown) {
      toast.error('保存失败', { description: err instanceof Error ? err.message : String(err) });
    }
  }, [workspace, workspaceId, editName, editDescription, refreshWorkspace]);

  const handleAddWidget = (template: { type: WidgetType; title: string; data?: Record<string, unknown> }) => {
    const pos = findEmptyPosition(localWidgets, 3, 2);
    const newWidget: Widget = {
      id: `widget-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`,
      type: template.type,
      title: template.title,
      position: { x: pos.x, y: pos.y, w: 3, h: 2 },
      data: template.data,
    };
    const updated = [...localWidgets, newWidget];
    setLocalWidgets(updated);
    saveWidgets(updated);
  };

  // 组件卸载时清理 saveTimeoutRef
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // 点击外部关闭智能体选择器
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) {
        setAgentPickerOpen(false);
      }
    }
    if (agentPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [agentPickerOpen]);

  // 切换驾驶舱时重置选中智能体
  useEffect(() => {
    if (workspace) {
      const isCockpitLed = workspace.orchestration?.mode === 'cockpit-led' || workspace.orchestration?.mode === 'llm-direct';
      setSelectedAgentId(isCockpitLed ? 'cockpit-self' : workspace.primaryAgentId);
    }
  }, [workspace]);

  // 有消息时自动展开对话区
  const hasMessages = messages.length > 0;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  // 持久化：消息变化时保存
  useEffect(() => {
    if (messages.length > 0) {
      saveChatSession(workspaceId, messages);
    }
  }, [messages, workspaceId]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading || !workspace) return;
    const text = input.trim();
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setInput('');
    setMessages((prev) => [...prev, userMsg]);
    setStreaming('');
    setIsLoading(true);
    if (!chatExpanded) setChatExpanded(true);

    // 优先使用 CockpitAgent 智能对话
    let full = '';
    cockpitAgentChatStream(
      text,
      workspaceId,
      undefined,
      (chunk) => {
        full += chunk;
        setStreaming(full);
      },
      (data) => {
        setIsLoading(false);
        setStreaming('');
        setMessages((prev) => [
          ...prev,
          { role: 'agent', content: data.message, timestamp: Date.now() },
        ]);
      },
      (err) => {
        // CockpitAgent 出错时 fallback 到传统模式（MockAdapter 兜底）
        console.warn('[Chat] CockpitAgent failed, falling back to adapter:', err);
        let fallbackFull = '';
        const isCockpitLedMode = workspace.orchestration?.mode === 'cockpit-led' || workspace.orchestration?.mode === 'llm-direct';
        const targetAgentId = selectedAgentId || (isCockpitLedMode ? 'cockpit-self' : workspace.primaryAgentId);
        workspaceCommandStream(
          workspaceId,
          text,
          targetAgentId,
          undefined,
          (chunk) => {
            fallbackFull += chunk;
            setStreaming(fallbackFull);
          },
          (data) => {
            setIsLoading(false);
            setStreaming('');
            setMessages((prev) => [
              ...prev,
              { role: 'agent', content: data.message, timestamp: Date.now() },
            ]);
          },
          (err2) => {
            setIsLoading(false);
            setStreaming('');
            setMessages((prev) => [
              ...prev,
              { role: 'agent', content: `❌ 出错：${err2.message}`, timestamp: Date.now() },
            ]);
          }
        );
      }
    );
  }, [input, isLoading, workspace, workspaceId, chatExpanded, selectedAgentId]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setChatExpanded(false);
    localStorage.removeItem(CHAT_STORAGE_KEY(workspaceId));
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-app-bg">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-app-bg gap-4">
        <div className="w-16 h-16 rounded-2xl bg-app-surface-subtle border border-app-border-subtle flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-app-text-muted" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-sm font-medium text-app-text">驾驶舱不存在</h3>
          <p className="text-xs text-app-text-subtle">该驾驶舱可能已被删除或 ID 无效</p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs bg-app-surface-hover text-app-text-secondary hover:bg-app-surface-subtle transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回列表
        </button>
      </div>
    );
  }

  const Icon = wsIcons[workspace.icon] || Layers;
  const associatedAgents = agents.filter((a) => workspace.agentIds.includes(a.id));
  // 驾驶舱智能体虚拟agent（当orchestration为cockpit-led/llm-direct时注入）
  const isCockpitLed = workspace.orchestration?.mode === 'cockpit-led' || workspace.orchestration?.mode === 'llm-direct';
  const cockpitAgentVirtual: Agent | null = isCockpitLed ? {
    id: 'cockpit-self',
    name: '驾驶舱智能体',
    avatar: '',
    description: '智能驾驶舱内置智能体，基于当前上下文独立运行',
    status: 'active',
    category: '内置',
    skills: [],
    usageCount: 0,
    lastUsed: '-',
    owner: 'system',
    sourceType: 'internal',
  } : null;

  // 根据 orchestration 动态判断主智能体
  // cockpit-led / llm-direct 时，驾驶舱智能体是主智能体，不使用模板预设的 agent
  const effectivePrimaryAgentId = workspace.orchestration?.mode === 'platform-led'
    ? workspace.orchestration.primaryAgent?.id
    : (isCockpitLed ? 'cockpit-self' : workspace.primaryAgentId);
  const primaryAgent = agents.find((a) => a.id === effectivePrimaryAgentId);

  // 用于显示的完整agent列表（含虚拟驾驶舱智能体）
  const displayAgents = cockpitAgentVirtual
    ? [...associatedAgents, cockpitAgentVirtual]
    : associatedAgents;
  // cockpit-led / llm-direct 时优先显示驾驶舱智能体，否则回退到模板预设的 agent
  const displayPrimaryAgent = isCockpitLed ? cockpitAgentVirtual : (primaryAgent || cockpitAgentVirtual);
  const displayCollaborators = displayAgents.filter((a) => a.id !== effectivePrimaryAgentId && a.id !== 'cockpit-self');

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-app-bg overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-app-border-subtle flex items-center px-6 shrink-0">
        {layoutMode === 'cards' && (
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted transition-colors mr-3">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center mr-3" style={{ backgroundColor: `${workspace.color}15` }}>
          <Icon className="w-4 h-4" style={{ color: workspace.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="text-sm font-semibold text-app-text bg-app-surface border border-app-border-subtle focus:border-red-400 rounded px-1.5 py-0.5 outline-none min-w-[80px] max-w-[200px]"
              />
            ) : (
              <h1 className="text-sm font-semibold text-app-text truncate">{workspace.name}</h1>
            )}
            <span className="text-[10px] text-app-text-subtle shrink-0">· 智能驾驶舱</span>
            {/* Agent Mode Tag */}
            {workspace.agentMode && workspace.agentMode !== 'single' && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] shrink-0 ${
                workspace.agentMode === 'llm-only'
                  ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                  : 'bg-primary/8 text-primary border-primary/15'
              }`}>
                <span>{agentModeLabel(workspace.agentMode)}</span>
              </div>
            )}
          </div>
          {isEditing ? (
            <input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="text-[10px] text-app-text-muted bg-app-surface border border-app-border-subtle focus:border-red-400 rounded px-1.5 py-0.5 outline-none w-full mt-0.5"
              placeholder="添加描述..."
            />
          ) : (
            <p className="text-[10px] text-app-text-muted truncate">{workspace.description}</p>
          )}
        </div>

        {/* Orchestration State + Agents */}
        <div className="flex items-center gap-3 mr-4">
          {/* 智能体头像列表：按顺序排列，第一个为主 */}
          <div className="flex items-center gap-2">
            {/* 健康状态指示 */}
            {workspace.orchestration && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  workspace.orchestration.health === 'healthy' ? 'bg-emerald-500'
                    : workspace.orchestration.health === 'degraded' ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                title={workspace.orchestration.reason}
              />
            )}
            <div className="flex -space-x-1.5">
              {displayAgents.map((agent, idx) => {
                const isPrimary = idx === 0;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setActiveAgentId(activeAgentId === agent.id ? null : agent.id)}
                    className={`relative transition-all ${activeAgentId === agent.id ? 'z-10 scale-110' : ''}`}
                  >
                    {agent.id === 'cockpit-self' ? (
                      <div
                        className={`rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm ${isPrimary ? 'w-7 h-7 ring-2 ring-red-500/40' : 'w-6 h-6'}`}
                        title={agent.name}
                      >
                        <Sparkles className={isPrimary ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
                      </div>
                    ) : (
                      <div className={isPrimary ? 'ring-2 ring-red-500/40 rounded-full' : ''}>
                        <AgentAvatar agent={agent} size={isPrimary ? 'sm' : 'sm'} showStatus />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Canvas Edit Controls */}
        <div className="flex items-center gap-3 mr-4">
          {isEditing && (
            <button
              onClick={() => setWidgetLibraryOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/8 border border-primary/15 text-primary text-xs hover:bg-primary/15 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              添加组件
            </button>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[10px] text-app-text-subtle">编辑</span>
            <Switch checked={isEditing} onCheckedChange={setIsEditing} />
          </label>
        </div>

        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted transition-colors"><RefreshCw className="w-4 h-4" /></button>
          {onRequestDelete && (
            <button
              onClick={() => onRequestDelete(workspaceId)}
              className="p-2 rounded-lg hover:bg-red-500/10 text-app-text-subtle hover:text-red-500 transition-colors"
              title="删除驾驶舱"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Active Agent Detail Banner */}
      {activeAgentId && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-app-surface border border-app-border-subtle shadow-[0_1px_3px_rgba(0,0,0,0.18)] animate-in slide-in-from-top-2">
          {(() => {
            const agent = agents.find((a) => a.id === activeAgentId) || (activeAgentId === 'cockpit-self' ? cockpitAgentVirtual : null);
            if (!agent) return null;
            const isPrimary = agent.id === 'cockpit-self' || (workspace.orchestration?.mode === 'platform-led'
              ? agent.id === workspace.orchestration.primaryAgent?.id
              : agent.id === workspace.primaryAgentId);
            const isCockpitSelf = agent.id === 'cockpit-self';
            return (
              <div className="flex items-center gap-4">
                {isCockpitSelf ? (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
                    <Sparkles className="w-5 h-5" />
                  </div>
                ) : (
                  <AgentAvatar agent={agent} size="lg" showStatus={false} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-app-text-secondary">{agent.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${agent.status === 'active' ? 'text-emerald-500 bg-emerald-500/10' : agent.status === 'error' ? 'text-red-500 bg-red-500/10' : 'text-amber-500 bg-amber-500/10'}`}>
                      {agent.status === 'active' ? '运行中' : agent.status === 'error' ? '异常' : '空闲'}
                    </span>
                    {isPrimary && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">
                        主
                      </span>
                    )}
                    {!isCockpitSelf && agent.sourceConnectionName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-surface-subtle text-app-text-muted border border-app-border-subtle">
                        {agent.sourceConnectionName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-app-text-muted mt-0.5">{agent.description}</p>
                  {!isCockpitSelf && (
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-app-text-subtle">
                      <span>{agent.usageCount.toLocaleString()} 次调用</span>
                      <span>·</span>
                      <span>{agent.skills.length} 项技能</span>
                      <span>·</span>
                      <span>最近 {agent.lastUsed}</span>
                    </div>
                  )}
                </div>
                <button onClick={() => setActiveAgentId(null)} className="p-1.5 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted transition-colors">
                  <ArrowLeftIcon className="w-4 h-4" />
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* 全局联动过滤条 */}
      {hasFilters && (
        <div className="px-6 pt-4 pb-0 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-app-text-subtle">过滤:</span>
          {Object.entries(activeFilters).map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-app-surface-subtle border border-app-border-subtle text-[10px] text-app-text-muted cursor-pointer hover:border-app-border transition-colors"
              onClick={() => clearFilter(key)}
              title="点击清除"
            >
              {key}: {String(value)}
              <span className="text-app-text-subtle hover:text-red-500">×</span>
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="text-[10px] text-app-text-subtle hover:text-red-500 transition-colors"
          >
            清除全部
          </button>
        </div>
      )}

      {/* Dashboard Grid — 画布模式 */}
      <div className={`flex-1 overflow-y-auto sidebar-scroll p-6 ${isEditing ? 'bg-app-surface-subtle/30' : ''}`}>
        <CanvasGrid
          widgets={localWidgets}
          isEditing={isEditing}
          onLayoutChange={handleLayoutChange}
          onDeleteWidget={handleDeleteWidget}
          renderWidget={(widget) => (
            <WidgetRenderer
              workspaceId={workspace.id}
              widget={widget}
              useDemoDataFallback={workspace.useDemoDataFallback}
              isEditing={isEditing}
              onClick={() => {
                if (isEditing) return;
                if (widget.link) {
                  const link = widget.link;
                  if (link.type === 'workspace' && onSelectWorkspace) {
                    if (link.targetId) {
                      onSelectWorkspace(link.targetId);
                    } else if (link.targetTemplate && allWorkspaces) {
                      const targetWs = allWorkspaces.find((w) => w.templateId === link.targetTemplate || w.id === link.targetTemplate);
                      if (targetWs) {
                        onSelectWorkspace(targetWs.id);
                      } else {
                        setDetailWidget(widget);
                      }
                    } else {
                      setDetailWidget(widget);
                    }
                  } else if (link.type === 'url' && link.url) {
                    window.open(link.url, '_blank');
                  } else if (link.type === 'widget' && link.targetId) {
                    setDetailWidget(widget);
                  } else {
                    setDetailWidget(widget);
                  }
                } else {
                  setDetailWidget(widget);
                }
              }}
              onDrillDown={(context, dimension) => {
                setDrillState({ widget, context, dimension });
                // 同时设置全局联动过滤
                Object.entries(context).forEach(([key, value]) => {
                  if (typeof value === 'string' || typeof value === 'number') {
                    setFilter(key, value);
                  }
                });
              }}
              filterContext={activeFilters}
            />
          )}
        />
      </div>

      {/* Widget Detail Drawer */}
      <WidgetDetailDrawer
        widget={detailWidget}
        workspaceId={workspaceId}
        onClose={() => setDetailWidget(null)}
      />

      {/* Drill-down Drawer */}
      <WidgetDetailDrawer
        widget={drillState?.widget || null}
        workspaceId={workspaceId}
        drillContext={drillState?.context}
        drillDimension={drillState?.dimension}
        onClose={() => setDrillState(null)}
      />

      {/* Widget Library Panel */}
      <WidgetLibraryPanel
        open={widgetLibraryOpen}
        onClose={() => setWidgetLibraryOpen(false)}
        onAdd={handleAddWidget}
      />

      {/* Chat Panel — 底部固定区域 */}
      <div className="shrink-0 border-t border-app-border-subtle">
        {/* Chat Messages — 在 Panel 内部向上展开 */}
        {hasMessages && chatExpanded && (
          <div className="px-6 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-app-text-subtle uppercase tracking-wider">
                会话历史 · {messages.length} 条
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleClear}
                  className="p-1 rounded hover:bg-app-surface-hover text-app-text-subtle hover:text-red-500 transition-colors"
                  title="清空会话"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setChatExpanded(false)}
                  className="p-1 rounded hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted transition-colors"
                  title="折叠"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="max-h-[200px] overflow-y-auto sidebar-scroll space-y-3 pb-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'agent' && (
                    <div className="shrink-0 mt-0.5">
                      {primaryAgent ? (
                        <AgentAvatar agent={primaryAgent} size="sm" showStatus={false} />
                      ) : workspace.orchestration?.mode === 'cockpit-led' || workspace.orchestration?.mode === 'llm-direct' ? (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                          <Sparkles className="w-3 h-3" />
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-red-500/15 text-app-text-secondary border border-red-500/10'
                      : 'bg-app-surface text-app-text-muted border border-app-border-subtle'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && streaming && (
                <div className="flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    {primaryAgent ? (
                      <AgentAvatar agent={primaryAgent} size="sm" showStatus={false} />
                    ) : workspace.orchestration?.mode === 'cockpit-led' || workspace.orchestration?.mode === 'llm-direct' ? (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                        <Sparkles className="w-3 h-3" />
                      </div>
                    ) : null}
                  </div>
                  <div className="max-w-[80%] px-4 py-2.5 rounded-xl text-sm leading-relaxed bg-app-surface text-app-text-muted border border-app-border-subtle">
                    {streaming}
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-red-500/60 animate-pulse align-middle" />
                  </div>
                </div>
              )}
              {isLoading && !streaming && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Loader2 className="w-3.5 h-3.5 text-red-500 animate-spin" />
                  </div>
                  <div className="text-sm text-app-text-muted">思考中...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {/* Collapsed hint */}
        {hasMessages && !chatExpanded && (
          <div className="px-6 pt-3 flex items-center justify-between">
            <button
              onClick={() => setChatExpanded(true)}
              className="flex items-center gap-1.5 text-[10px] text-app-text-subtle hover:text-app-text-muted transition-colors"
            >
              <ChevronUp className="w-3 h-3" />
              <span>展开会话历史 · {messages.length} 条</span>
            </button>
            <button
              onClick={handleClear}
              className="p-1 rounded hover:bg-app-surface-hover text-app-text-subtle hover:text-red-500 transition-colors"
              title="清空会话"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Chat Input Bar */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 bg-app-surface border border-app-border-subtle shadow-[0_1px_3px_rgba(0,0,0,0.15)] rounded-xl px-4 py-3 focus-within:border-app-border focus-within:bg-app-surface-hover transition-all">
            {/* Agent Selector */}
            <div className="relative shrink-0" ref={agentPickerRef}>
              {(() => {
                // 根据 orchestration 判断谁是主智能体、谁是协作智能体
                const chatPrimaryAgentId = workspace.orchestration?.mode === 'platform-led'
                  ? workspace.orchestration.primaryAgent?.id
                  : (isCockpitLed ? 'cockpit-self' : workspace.primaryAgentId);
                const chatCollaborators = displayAgents.filter((a) => a.id !== chatPrimaryAgentId && a.id !== 'cockpit-self');
                const chatPrimary = displayPrimaryAgent;
                const hasCollaborators = chatCollaborators.length > 0;
                const currentAgent = displayAgents.find((a) => a.id === (selectedAgentId || chatPrimaryAgentId || 'cockpit-self'));

                return (
                  <>
                    <button
                      onClick={() => hasCollaborators && setAgentPickerOpen(!agentPickerOpen)}
                      disabled={!hasCollaborators}
                      className={`flex items-center gap-1 p-1 rounded-lg transition-colors ${
                        hasCollaborators
                          ? 'hover:bg-app-surface-hover cursor-pointer'
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                      title={hasCollaborators ? '切换会话智能体' : '当前只有主智能体'}
                    >
                      {currentAgent ? (
                        currentAgent.id === 'cockpit-self' ? (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                            <Sparkles className="w-2.5 h-2.5" />
                          </div>
                        ) : (
                          <AgentAvatar agent={currentAgent} size="sm" showStatus={false} />
                        )
                      ) : (
                        <Sparkles className="w-4 h-4 text-app-text-subtle" />
                      )}
                      {hasCollaborators && (
                        <ChevronDown className={`w-3 h-3 text-app-text-subtle transition-transform ${agentPickerOpen ? 'rotate-180' : ''}`} />
                      )}
                    </button>

                    {agentPickerOpen && hasCollaborators && (
                      <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl bg-app-surface-elevated border border-app-border shadow-xl shadow-black/40 py-2 z-50">
                        <div className="px-3 py-1.5 text-[10px] text-app-text-subtle uppercase tracking-wider">主智能体</div>
                        {chatPrimary && (() => {
                          const isSelected = (selectedAgentId || chatPrimaryAgentId || 'cockpit-self') === chatPrimary.id;
                          return (
                            <button
                              onClick={() => { setSelectedAgentId(chatPrimary.id); setAgentPickerOpen(false); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${isSelected ? 'bg-app-surface-hover' : 'hover:bg-app-surface-hover/60'}`}
                            >
                              {chatPrimary.id === 'cockpit-self' ? (
                                <div className="w-5 h-5 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shrink-0">
                                  <Sparkles className="w-2.5 h-2.5" />
                                </div>
                              ) : (
                                <AgentAvatar agent={chatPrimary} size="sm" showStatus={false} />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-app-text-secondary">{chatPrimary.name}</div>
                                <div className="text-[10px] text-app-text-muted truncate">{chatPrimary.description}</div>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                            </button>
                          );
                        })()}

                        {chatCollaborators.length > 0 && (
                          <>
                            <div className="mx-3 my-1.5 border-t border-app-border-subtle" />
                            <div className="px-3 py-1.5 text-[10px] text-app-text-subtle uppercase tracking-wider">协作智能体</div>
                            {chatCollaborators.map((agent) => {
                              const isSelected = selectedAgentId === agent.id;
                              return (
                                <button
                                  key={agent.id}
                                  onClick={() => { setSelectedAgentId(agent.id); setAgentPickerOpen(false); }}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${isSelected ? 'bg-app-surface-hover' : 'hover:bg-app-surface-hover/60'}`}
                                >
                                  <AgentAvatar agent={agent} size="sm" showStatus={false} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-app-text-secondary">{agent.name}</div>
                                    <div className="text-[10px] text-app-text-muted truncate">{agent.description}</div>
                                  </div>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={(() => {
                const agent = agents.find((a) => a.id === (selectedAgentId || workspace.primaryAgentId));
                if (agent) return `与 ${agent.name} 会话，基于「${workspace.name}」上下文...`;
                if (workspace.orchestration?.mode === 'cockpit-led' || workspace.orchestration?.mode === 'llm-direct') {
                  return '与驾驶舱智能体会话，输入自然语言指令...';
                }
                return '输入指令...';
              })()}
              className="flex-1 bg-transparent text-app-text-secondary text-sm outline-none placeholder:text-app-text-muted"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-app-text-subtle">
              {displayPrimaryAgent ? `${displayPrimaryAgent.name} · 基于当前驾驶舱上下文` : '自然语言指令'}
            </span>
            {hasMessages && (
              <span className="text-[10px] text-app-text-subtle">
                已保存 · 刷新保留
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Widget Renderer ── */
/* ── Widget 类型色映射（渐变装饰线） ── */
const TYPE_GRADIENTS: Record<string, string> = {
  metric:   'from-emerald-500/70 via-emerald-400/50 to-transparent',
  chart:    'from-indigo-500/70 via-indigo-400/50 to-transparent',
  table:    'from-sky-500/70 via-sky-400/50 to-transparent',
  list:     'from-amber-500/70 via-amber-400/50 to-transparent',
  kanban:   'from-violet-500/70 via-violet-400/50 to-transparent',
  timeline: 'from-cyan-500/70 via-cyan-400/50 to-transparent',
  report:   'from-rose-500/70 via-rose-400/50 to-transparent',
  html:     'from-fuchsia-500/70 via-fuchsia-400/50 to-transparent',
  progress: 'from-teal-500/70 via-teal-400/50 to-transparent',
  status:   'from-orange-500/70 via-orange-400/50 to-transparent',
  universal:'from-slate-500/70 via-slate-400/50 to-transparent',
  gauge:    'from-red-500/70 via-red-400/50 to-transparent',
  funnel:   'from-purple-500/70 via-purple-400/50 to-transparent',
  radar:    'from-pink-500/70 via-pink-400/50 to-transparent',
  heatmap:  'from-orange-500/70 via-amber-400/50 to-transparent',
  bullet:   'from-cyan-500/70 via-sky-400/50 to-transparent',
  alert:    'from-red-500/70 via-orange-400/50 to-transparent',
  map:      'from-emerald-500/70 via-teal-400/50 to-transparent',
  sparkline:'from-indigo-500/70 via-blue-400/50 to-transparent',
};

function WidgetRenderer({ workspaceId, widget, useDemoDataFallback, isEditing, onClick, onDrillDown, filterContext }: { workspaceId: string; widget: Widget; useDemoDataFallback?: boolean; isEditing?: boolean; onClick?: () => void; onDrillDown?: (context: Record<string, unknown>, dimension: string) => void; filterContext?: Record<string, unknown> }) {
  const gridSize = { w: widget.position.w, h: widget.position.h };
  const hasDetail = !!widget.detail || !!((widget.data as Record<string, unknown>)?.detail) || !!((widget.data as Record<string, unknown>)?.fullContent) || widget.type === 'report' || widget.type === 'html';
  const hasLink = !!widget.link;
  const isClickable = !isEditing && (hasDetail || hasLink);
  const gradient = TYPE_GRADIENTS[widget.type] || TYPE_GRADIENTS.universal;

  return (
    <div
      className={`group h-full rounded-2xl bg-widget-bg border border-widget-border overflow-hidden flex flex-col transition-all duration-300 ease-widget ${isEditing ? 'ring-1 ring-primary/20 shadow-md' : 'shadow-widget hover:shadow-widget-hover hover:border-widget-border-hover'} ${isClickable ? 'cursor-pointer' : ''}`}
      onClick={isClickable ? onClick : undefined}
    >
      {/* 渐变顶部装饰线 */}
      <div className={`h-[3px] w-full bg-gradient-to-r ${gradient}`} />
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-app-border-subtle/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-br ${gradient.replace('/70', '').replace('/50', '').replace(' to-transparent', '').replace(' via-', ' ')}`} />
          <h4 className="text-[11px] font-medium text-app-text-muted truncate tracking-wide">{widget.title}</h4>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasLink && <ExternalLink className="w-3 h-3 text-app-text-subtle/60 group-hover:text-primary/70 transition-colors" />}
          {hasDetail && <ArrowRight className="w-3 h-3 text-app-text-subtle/60 group-hover:text-primary/70 transition-colors" />}
        </div>
      </div>
      {/* 内容区 */}
      <div className="flex-1 p-3.5 min-h-0">
        <WidgetContent workspaceId={workspaceId} widget={widget} useDemoDataFallback={useDemoDataFallback} gridSize={gridSize} onDrillDown={onDrillDown} filterContext={filterContext} />
      </div>
    </div>
  );
}

// 空数据检测辅助函数
function isEmptyValue(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed === '' || trimmed === '—' || trimmed === 'N/A' || trimmed === 'null' || trimmed === '暂无数据';
  }
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object' && val !== null) return Object.keys(val).length === 0;
  return false;
}

function EmptyWidgetState({ title, source, error }: { title: string; source?: string; error?: string | null }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2">
      <div className="w-8 h-8 rounded-xl bg-app-surface-subtle border border-app-border-subtle flex items-center justify-center">
        <Monitor className="w-3.5 h-3.5 text-app-text-subtle/50" />
      </div>
      <div className="text-[11px] text-app-text-subtle font-medium">{error ? '数据获取失败' : '暂无数据'}</div>
      {source === 'static' && <div className="text-[10px] text-app-text-subtle/60">演示数据</div>}
      {error && <div className="text-[10px] text-app-text-subtle/40">{error}</div>}
      <div className="text-[10px] text-app-text-subtle/40">{title}</div>
    </div>
  );
}

function WidgetContent({ workspaceId, widget, useDemoDataFallback, gridSize, onDrillDown, filterContext }: { workspaceId: string; widget: Widget; useDemoDataFallback?: boolean; gridSize: { w: number; h: number }; onDrillDown?: (context: Record<string, unknown>, dimension: string) => void; filterContext?: Record<string, unknown> }) {
  const { data: liveData, loading, error } = useWidgetData(workspaceId, widget, useDemoDataFallback, filterContext);

  // 使用动态数据（如果存在），否则回退到 widget.data
  const displayData = liveData || widget.data || {};
  const dataSource = (displayData as Record<string, unknown> | undefined)?.__source as string | undefined;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="relative w-5 h-5">
          <div className="absolute inset-0 rounded-full border-2 border-app-border-subtle" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        </div>
      </div>
    );
  }

  // 智能类型校验：如果 widget.type 与数据内容明显不匹配，用推断类型渲染
  const inferredType = inferWidgetType(displayData);
  const effectiveType = (widget.type === inferredType) ? widget.type :
    isTypeMismatched(widget.type, displayData) ? inferredType :
    widget.type;

  switch (effectiveType) {
    case 'metric': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容：yonclaw 可能把报告内容误存为 metric 类型（data.content 有值但 value 为空）
      if (isEmptyValue(d.value as string | undefined) && typeof d.content === 'string') {
        const contentText = d.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return (
          <div className="h-full flex flex-col">
            <p className="text-xs text-app-text-secondary leading-relaxed line-clamp-4 flex-1">{contentText}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-app-text-subtle mt-2">
              <FileText className="w-3 h-3" />
              <span>点击查看详情</span>
            </div>
          </div>
        );
      }
      if (isEmptyValue(d.value as string | undefined)) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }

      const valueStr = String(d.value ?? '');
      const trend = String(d.trend || '');
      const changeStr = String(d.change || '');
      const caption = String(d.caption || '');
      const variant = String(d.variant || ''); // 'accent' | 'status' | 'compare' | 'mini'
      const isPositive = trend === 'up';

      // ── 变体：迷你卡 ──
      if (variant === 'mini' || gridSize.h <= 1) {
        return (
          <div className="h-full flex flex-col justify-center px-3">
            <span className="text-[10px] text-app-text-subtle uppercase tracking-wider">{widget.title}</span>
            <span className="text-lg font-bold text-app-text tracking-tight tabular-nums mt-0.5">{valueStr}</span>
            {!isEmptyValue(changeStr) && (
              <span className={`text-[10px] mt-0.5 ${isPositive ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-app-text-subtle'}`}>
                {isPositive ? '▲' : trend === 'down' ? '▼' : '—'} {changeStr}
              </span>
            )}
          </div>
        );
      }

      // ── 变体：强调卡（品牌色背景）─
      if (variant === 'accent') {
        const accentColor = (d.accentColor || '#6366f1') as string;
        return (
          <div className="h-full flex flex-col justify-center rounded-xl p-4" style={{ backgroundColor: accentColor + '12', border: `1px solid ${accentColor}20` }}>
            <span className="text-xs font-medium" style={{ color: accentColor }}>{widget.title}</span>
            <span className="text-3xl font-bold tracking-tight tabular-nums mt-1" style={{ color: accentColor }}>{valueStr}</span>
            {!isEmptyValue(changeStr) && (
              <span className="text-xs mt-1" style={{ color: accentColor, opacity: 0.8 }}>{changeStr}</span>
            )}
          </div>
        );
      }

      // ── 变体：状态卡（语义边框）─
      if (variant === 'status') {
        const status = String(d.status || 'normal');
        const statusConfig: Record<string, { border: string; bg: string; dot: string; text: string }> = {
          normal: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/6', dot: 'bg-emerald-500', text: 'text-emerald-500' },
          warning: { border: 'border-amber-500/20', bg: 'bg-amber-500/6', dot: 'bg-amber-500', text: 'text-amber-500' },
          danger: { border: 'border-red-500/20', bg: 'bg-red-500/6', dot: 'bg-red-500', text: 'text-red-500' },
          info: { border: 'border-blue-500/20', bg: 'bg-blue-500/6', dot: 'bg-blue-500', text: 'text-blue-500' },
        };
        const cfg = statusConfig[status] || statusConfig.normal;
        return (
          <div className={`h-full flex flex-col justify-center rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${status === 'danger' || status === 'warning' ? 'animate-pulse' : ''}`} />
              <span className="text-xs text-app-text-subtle">{widget.title}</span>
            </div>
            <span className={`text-2xl font-bold tracking-tight tabular-nums mt-2 ${cfg.text}`}>{valueStr}</span>
            {!isEmptyValue(changeStr) && <span className="text-xs text-app-text-subtle mt-1">{changeStr}</span>}
          </div>
        );
      }

      // ── 变体：对比卡（双列数值）─
      if (variant === 'compare') {
        const compareValue = String(d.compareValue || d.previous || d.target || '—');
        const compareLabel = String(d.compareLabel || '对比值');
        return (
          <div className="h-full flex flex-col justify-center rounded-xl border border-app-border-subtle bg-app-surface-subtle p-4">
            <span className="text-[10px] text-app-text-subtle uppercase tracking-wider">{widget.title}</span>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-2xl font-bold text-app-text tracking-tight tabular-nums">{valueStr}</span>
              <span className="text-xs text-app-text-subtle">vs</span>
              <span className="text-lg font-medium text-app-text-muted tabular-nums">{compareValue}</span>
            </div>
            {!isEmptyValue(changeStr) && (
              <span className={`text-xs mt-1 ${isPositive ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-app-text-subtle'}`}>
                {changeStr}
              </span>
            )}
          </div>
        );
      }

      // ── 标准卡（带 Sparkline 迷你趋势）─
      const isCompact = gridSize.h <= 2;
      const valueSize = isCompact
        ? (gridSize.w <= 2 ? 'text-xl' : 'text-2xl')
        : (gridSize.w <= 2 ? 'text-2xl' : gridSize.w >= 6 ? 'text-4xl' : 'text-3xl');
      const showChange = gridSize.h > 1 && !isEmptyValue(changeStr);
      const trendColor = isPositive ? 'text-emerald-500' : trend === 'down' ? 'text-red-500' : 'text-app-text-subtle';
      const trendIconBg = isPositive ? 'bg-emerald-500/8' : trend === 'down' ? 'bg-red-500/8' : 'bg-app-surface-subtle';
      const sparkline = d.sparkline as { labels?: string[]; values?: number[] } | undefined;
      const hasSparkline = sparkline && Array.isArray(sparkline.values) && sparkline.values.length > 1;
      const numericValue = Number(valueStr.replace(/,/g, '').replace(/%/g, ''));
      const valueMax = Number(d.max ?? d.target ?? 100);
      const thresholds = extractThresholds(d);
      const thresholdColor = !isNaN(numericValue) && isFinite(numericValue)
        ? getThresholdColor(numericValue, valueMax, thresholds)
        : null;

      return (
        <div className="h-full flex flex-col justify-center gap-1">
          <div className="flex items-end justify-between gap-2">
            <div
              className={`${valueSize} font-bold tracking-tight tabular-nums leading-none ${thresholdColor ? thresholdColor.text : 'text-app-text'} cursor-pointer hover:opacity-80 transition-opacity`}
              onClick={(e) => {
                e.stopPropagation();
                onDrillDown?.({ metric: widget.title, value: numericValue }, `${widget.title}: ${valueStr}`);
              }}
              title="点击查看详情"
            >{valueStr}</div>
            {hasSparkline && gridSize.w >= 3 && (
              <div className={`shrink-0 ${isCompact ? 'w-16 h-8' : 'w-24 h-10'}`}>
                <Sparkline values={sparkline.values!} color={isPositive ? 'hsl(var(--success))' : trend === 'down' ? 'hsl(var(--destructive))' : 'hsl(var(--info))'} />
              </div>
            )}
          </div>
          {showChange && (
            <div className={`flex items-center gap-1.5 mt-1 ${isCompact ? 'text-[11px]' : 'text-xs'}`}>
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${trendIconBg}`}>
                {isPositive ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
              </span>
              <span className={`font-semibold ${trendColor}`}>{changeStr}</span>
            </div>
          )}
          {caption && (
            <span className={`text-[11px] text-app-text-subtle/80 ${isCompact ? 'mt-0.5' : 'mt-1'}`}>{caption}</span>
          )}
        </div>
      );
    }
    case 'chart': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容 LLM 可能用的别名：labels / categories / names / xAxis
      const rawLabels = (d.labels || d.categories || d.names || d.xAxis || d.xaxis || d.dimensions || []) as unknown[];
      const labels = Array.isArray(rawLabels) ? rawLabels.map(String) : [];
      const rawValues = (d.values || d.data || d.series || d.yValues || d.yaxis || d.numbers || []) as unknown[];
      const values = Array.isArray(rawValues) ? rawValues.map((v) => (typeof v === 'number' ? v : Number(v) || 0)) : [];
      if (labels.length === 0 || values.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const max = Math.max(...values, 1);
      const maxItems = gridSize.h <= 2 ? 3 : gridSize.h <= 3 ? 5 : labels.length;
      const showValues = gridSize.w >= 4;
      const slicedLabels = labels.slice(0, maxItems);
      const slicedValues = values.slice(0, maxItems);
      const total = slicedValues.reduce((a, b) => a + b, 0);

      // 数据点≤5且grid足够大时，用环形图；否则用条形图
      const useDonut = slicedLabels.length <= 5 && gridSize.w >= 4 && gridSize.h >= 3 && total > 0;

      // 多色序列
      const colorStops = [
        ['from-indigo-500', 'to-blue-400'],
        ['from-emerald-500', 'to-teal-400'],
        ['from-amber-500', 'to-orange-400'],
        ['from-rose-500', 'to-pink-400'],
        ['from-violet-500', 'to-fuchsia-400'],
        ['from-cyan-500', 'to-sky-400'],
      ];

      if (useDonut) {
        // 构建 conic-gradient
        let acc = 0;
        const segments = slicedValues.map((v) => {
          const start = acc;
          const pct = (v / total) * 100;
          acc += pct;
          return { start, end: acc };
        });
        const gradient = segments.map((s, i) => {
          const colors = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];
          return `${colors[i % colors.length]} ${s.start}% ${s.end}%`;
        }).join(', ');

        return (
          <div className="h-full flex items-center gap-5">
            <div className="relative shrink-0" style={{ width: '72px', height: '72px' }}>
              <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
              <div className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-widget-bg flex items-center justify-center shadow-sm">
                <span className="text-[10px] font-bold text-app-text-secondary tabular-nums">{total}</span>
              </div>
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              {slicedLabels.map((label, i) => {
                const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500'];
                const pct = total > 0 ? Math.round((slicedValues[i] / total) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-2.5 group">
                    <div className={`w-2 h-2 rounded-sm ${colors[i % colors.length]}`} />
                    <span className="text-[11px] text-app-text-muted truncate flex-1">{label}</span>
                    <span className="text-[11px] text-app-text-secondary font-semibold tabular-nums">{slicedValues[i]}</span>
                    <span className="text-[10px] text-app-text-subtle w-7 text-right tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {slicedLabels.map((label, i) => {
            const barColors = ['from-indigo-500 to-indigo-400', 'from-emerald-500 to-emerald-400', 'from-amber-500 to-amber-400', 'from-rose-500 to-rose-400', 'from-violet-500 to-violet-400'];
            const pct = max > 0 ? (slicedValues[i] / max) * 100 : 0;
            return (
              <div
                key={i}
                className="group flex items-center gap-2.5 cursor-pointer rounded-lg px-1 -mx-1 py-0.5 hover:bg-app-surface-hover transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDrillDown?.({ category: label, value: slicedValues[i] }, `${widget.title} / ${label}`);
                }}
                title={`下钻: ${label}`}
              >
                {gridSize.w >= 3 && <span className="text-[11px] text-app-text-muted w-9 text-right shrink-0 truncate">{label}</span>}
                <div className="flex-1 h-2.5 bg-app-surface-subtle rounded-full overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${barColors[i % barColors.length]} transition-all duration-500 ease-out`} style={{ width: `${pct}%` }} />
                </div>
                {showValues && <span className="text-[11px] text-app-text-secondary font-medium w-10 text-right tabular-nums">{slicedValues[i]}</span>}
              </div>
            );
          })}
        </div>
      );
    }
    case 'table': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容 LLM 可能用的别名：rows / data / records / entries
      const rawRows = (d.rows || d.data || d.records || d.entries || []) as unknown[];
      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      // 兼容两种格式：对象数组 [{k:v}] 或 字符串数组 [[cell, cell]]
      const isObjectRows = rawRows.length > 0 && rawRows[0] !== null && typeof rawRows[0] === 'object' && !Array.isArray(rawRows[0]);
      const isArrayRows = rawRows.length > 0 && Array.isArray(rawRows[0]);
      // 如果第一行是数组且所有元素都是 string/number，视为 header 行
      const hasHeaderRow = isArrayRows && (rawRows[0] as unknown[]).every((c) => typeof c === 'string' || typeof c === 'number');
      const allColumns = (d.columns as string[]) || (isObjectRows
        ? Object.keys(rawRows[0] as Record<string, unknown>)
        : hasHeaderRow
          ? (rawRows[0] as string[])
          : isArrayRows
            ? Array.from({ length: (rawRows[0] as unknown[]).length }, (_, i) => `列${i + 1}`)
            : []);
      const dataRows = isObjectRows ? rawRows.filter(r => r != null && typeof r === 'object') : (hasHeaderRow ? rawRows.slice(1) : rawRows);
      const allRows = isObjectRows
        ? dataRows.map((r) => allColumns.map((c) => String((r as Record<string, any>)[c] ?? '')))
        : dataRows.map((r) => Array.isArray(r) ? r.map(String) : [String(r)]);
      // 自适应：根据 grid 尺寸限制列数和行数
      const maxCols = gridSize.w <= 2 ? 1 : gridSize.w <= 3 ? 2 : Math.max(1, allColumns.length);
      const maxRows = gridSize.h <= 2 ? 2 : gridSize.h <= 3 ? 4 : allRows.length;
      const columns = allColumns.slice(0, maxCols);
      const rows = allRows.slice(0, maxRows);
      return (
        <div className="space-y-1">
          {/* 表头 */}
          {columns.length > 0 && (
            <div className="flex items-center gap-3 px-2 pb-1.5 border-b border-app-border-subtle/60">
              {columns.map((col, j) => (
                <span key={j} className="text-[10px] font-semibold text-app-text-subtle uppercase tracking-wider truncate">{col}</span>
              ))}
            </div>
          )}
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-2 rounded-xl bg-app-surface-subtle/50 hover:bg-app-surface-hover transition-colors cursor-pointer border border-transparent hover:border-app-border-subtle/60"
              onClick={(e) => {
                e.stopPropagation();
                const keyValue = row[0] || '';
                onDrillDown?.({ rowKey: keyValue, rowIndex: i }, `${widget.title} / ${keyValue}`);
              }}
              title={`下钻: ${row[0] || ''}`}
            >
              {row.slice(0, maxCols).map((cell, j) => (
                <span key={j} className={`text-[11px] truncate ${j === 0 ? 'font-semibold text-app-text-secondary' : 'text-app-text-muted'}`}>{cell}</span>
              ))}
            </div>
          ))}
        </div>
      );
    }
    case 'kanban': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容 LLM 可能用的别名：stages / statuses / columns / phases
      const rawStages = (d.stages || d.statuses || d.columns || d.phases || []) as unknown[];
      const stages = Array.isArray(rawStages) ? rawStages.map((s) => (typeof s === 'string' ? s : s != null ? (s as Record<string, string>).name || (s as Record<string, string>).title || (s as Record<string, string>).label || (s as Record<string, string>).status || JSON.stringify(s) : '')) : [];
      if (stages.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const maxStages = gridSize.h <= 2 ? 2 : gridSize.h <= 3 ? 3 : stages.length;
      const visibleStages = stages.slice(0, maxStages);
      return (
        <div className="space-y-2">
          {visibleStages.map((stage, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-app-surface-subtle border border-app-border-subtle/50 hover:border-app-border/60 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">{i + 1}</div>
              <span className="text-xs text-app-text-secondary font-medium">{stage}</span>
              {gridSize.w > 2 && i < visibleStages.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-app-text-subtle ml-auto" />}
            </div>
          ))}
        </div>
      );
    }
    case 'timeline': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容 LLM 可能用的别名：steps / milestones / events / nodes
      const rawSteps = (d.steps || d.milestones || d.events || d.nodes || []) as unknown[];
      const steps = Array.isArray(rawSteps) ? rawSteps.map((s) => (typeof s === 'string' ? s : s != null ? (s as Record<string, string>).title || (s as Record<string, string>).name || (s as Record<string, string>).label || (s as Record<string, string>).step || JSON.stringify(s) : '')) : [];
      if (steps.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const maxSteps = gridSize.h <= 2 ? 2 : gridSize.h <= 3 ? 3 : steps.length;
      const visibleSteps = steps.slice(0, maxSteps);
      return (
        <div className="space-y-0">
          {visibleSteps.map((step, i) => {
            const stepStr = String(step);
            const completed = stepStr.includes('✓');
            const active = stepStr.includes('→');
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${completed ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' : active ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'bg-app-surface-hover text-app-text-subtle border border-app-border-subtle'}`}>
                    {completed ? '✓' : i + 1}
                  </div>
                  {gridSize.h > 2 && i < visibleSteps.length - 1 && <div className={`w-px flex-1 my-1 ${completed ? 'bg-emerald-500/25' : 'bg-app-border-subtle'}`} />}
                </div>
                <div className="pb-4 pt-0.5">
                  <span className={`text-xs ${completed ? 'text-app-text-muted line-through opacity-70' : active ? 'text-app-text-secondary font-semibold' : 'text-app-text-muted'}`}>{stepStr.replace('✓', '').replace('→', '').trim()}</span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'list': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容 LLM 可能用的别名：items / tasks / entries / todos / list
      const rawItems = (d.items || d.tasks || d.entries || d.todos || d.list || []) as unknown[];
      const items = Array.isArray(rawItems) ? rawItems.map((item) => (typeof item === 'string' ? item : item != null ? (item as Record<string, string>).name || (item as Record<string, string>).title || (item as Record<string, string>).label || (item as Record<string, string>).task || (item as Record<string, string>).description || JSON.stringify(item) : '')) : [];
      if (items.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const maxItems = gridSize.h <= 2 ? 2 : gridSize.h <= 3 ? 3 : items.length;
      const visibleItems = items.slice(0, maxItems);
      return (
        <div className="space-y-1.5">
          {visibleItems.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-app-surface-subtle/60 border border-transparent hover:border-app-border-subtle transition-colors">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${String(item).includes('严重') || String(item).includes('错误') || String(item).includes('失败') ? 'bg-red-500' : String(item).includes('警告') || String(item).includes('注意') ? 'bg-amber-500' : 'bg-primary/60'}`} />
              <span className="text-xs text-app-text-secondary leading-relaxed">{item}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'report': {
      const d = (displayData || {}) as Record<string, unknown>;
      const summary = (d.summary || d.content || d.description || '') as string;
      // 兼容 LLM 可能用的别名：highlights / keyPoints / metrics / stats / overview
      const highlights = (d.highlights || d.keyPoints || d.metrics || d.stats || d.overview) as Array<{ label?: string; value?: string; name?: string; title?: string; key?: string; val?: string; num?: string }> | undefined;
      const clampClass = gridSize.h <= 2 ? 'line-clamp-2' : gridSize.h === 3 ? 'line-clamp-3' : 'line-clamp-6';
      return (
        <div className="space-y-3 h-full flex flex-col">
          {summary && (
            <p className={`text-xs text-app-text-secondary leading-relaxed ${clampClass}`}>{summary}</p>
          )}
          {gridSize.w >= 4 && highlights && highlights.length > 0 && (
            <div className="space-y-2">
              {(highlights as unknown[]).filter(h => h != null && typeof h === 'object').slice(0, 3).map((h, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-app-surface-subtle/60">
                  <div className="w-4 h-4 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                  </div>
                  <span className="text-[11px] text-app-text-secondary leading-snug">{(h as Record<string, unknown>).label || (h as Record<string, unknown>).name || (h as Record<string, unknown>).title || (h as Record<string, unknown>).key || ''}{(h as Record<string, unknown>).label || (h as Record<string, unknown>).name || (h as Record<string, unknown>).title || (h as Record<string, unknown>).key ? '：' : ''}{(h as Record<string, unknown>).value || (h as Record<string, unknown>).val || (h as Record<string, unknown>).num || '—'}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[10px] text-app-text-subtle mt-auto">
            <FileText className="w-3 h-3" />
            <span>点击阅读全文</span>
          </div>
        </div>
      );
    }
    case 'html': {
      const d = (displayData || {}) as Record<string, unknown>;
      const html = (d.html || d.content || '') as string;
      if (!html || typeof html !== 'string') {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const { text, metrics, headings, listItems, tableRows } = extractHtmlPreview(html);
      const clampClass = gridSize.h <= 2 ? 'line-clamp-2' : gridSize.h === 3 ? 'line-clamp-3' : 'line-clamp-6';
      const maxMetrics = gridSize.w <= 2 ? 2 : 3;

      return (
        <div className="space-y-2.5 h-full flex flex-col">
          {/* 指标卡：可视化展示提取的关键数字 */}
          {metrics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {metrics.slice(0, maxMetrics).map((m, i) => {
                const colors = ['bg-primary/8 border-primary/15 text-primary', 'bg-emerald-500/8 border-emerald-500/15 text-emerald-500', 'bg-amber-500/8 border-amber-500/15 text-amber-500', 'bg-rose-500/8 border-rose-500/15 text-rose-500'];
                return (
                  <div key={i} className={`px-2.5 py-1.5 rounded-lg border ${colors[i % colors.length]}`}>
                    <span className="text-[11px] font-semibold">{m}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 表格预览 */}
          {tableRows.length > 0 && gridSize.w >= 4 && (
            <div className="rounded-xl bg-app-surface-subtle/60 border border-app-border-subtle overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-app-border-subtle/50">
                {tableRows[0].slice(0, 3).map((cell, j) => (
                  <span key={j} className="text-[10px] font-semibold text-app-text-subtle uppercase tracking-wider truncate flex-1">{cell}</span>
                ))}
              </div>
              {tableRows.slice(1, 2).map((row, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                  {row.slice(0, 3).map((cell, j) => (
                    <span key={j} className="text-[11px] text-app-text-muted truncate flex-1">{cell}</span>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* 列表预览 */}
          {listItems.length > 0 && (
            <div className="space-y-1.5">
              {listItems.slice(0, 2).map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full mt-1.5 shrink-0 bg-primary/50" />
                  <span className="text-[11px] text-app-text-muted truncate">{item}</span>
                </div>
              ))}
            </div>
          )}

          {/* 摘要 */}
          {text && (
            <p className={`text-xs text-app-text-secondary leading-relaxed flex-1 ${clampClass}`}>{text}</p>
          )}

          {/* 章节速览 */}
          {gridSize.h > 2 && headings.length > 0 && (
            <div className="space-y-1.5">
              {headings.slice(0, 2).map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-primary/40" />
                  <span className="text-[10px] text-app-text-subtle truncate">{h}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[10px] text-app-text-subtle mt-auto pt-1">
            <FileText className="w-3 h-3" />
            <span>点击阅读完整报告</span>
          </div>
        </div>
      );
    }
    case 'progress': {
      const d = (displayData || {}) as Record<string, unknown>;
      const value = Number(d.value ?? 0);
      const max = Number(d.max ?? 100);
      const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
      const label = (d.label || `${value}/${max}`) as string;
      const color = (d.color || 'primary') as string;
      const colorClass: Record<string, string> = {
        primary: 'bg-gradient-to-r from-primary to-primary/80',
        indigo: 'bg-gradient-to-r from-indigo-500 to-indigo-400',
        emerald: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
        amber: 'bg-gradient-to-r from-amber-500 to-amber-400',
        red: 'bg-gradient-to-r from-red-500 to-red-400',
        blue: 'bg-gradient-to-r from-blue-500 to-blue-400',
        purple: 'bg-gradient-to-r from-purple-500 to-purple-400',
      };
      const barColor = colorClass[color] || colorClass.primary;
      const barHeight = gridSize.w <= 2 ? 'h-2' : 'h-2.5';
      return (
        <div className="h-full flex flex-col justify-center gap-3">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-app-text tracking-tight tabular-nums">{label}</span>
            <span className="text-xs font-semibold text-app-text-subtle tabular-nums">{Math.round(pct)}%</span>
          </div>
          <div className={`${barHeight} w-full bg-app-surface-subtle rounded-full overflow-hidden`}>
            <div className={`h-full rounded-full ${barColor} transition-all duration-700 shadow-sm`} style={{ width: `${pct}%` }} />
          </div>
          {gridSize.h > 2 && Boolean(d.caption || d.description) && (
            <span className="text-[11px] text-app-text-subtle">{String(d.caption || d.description || '')}</span>
          )}
        </div>
      );
    }
    case 'status': {
      const d = (displayData || {}) as Record<string, unknown>;
      const rawItems = (d.items || d.statuses || d.list || []) as unknown[];
      const items = Array.isArray(rawItems)
        ? rawItems.filter((it): it is typeof it & Record<string, unknown> => it != null && typeof it === 'object')
        : [];
      if (items.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const statusConfig: Record<string, { dot: string; bg: string; text: string }> = {
        green:   { dot: 'bg-emerald-500', bg: 'bg-emerald-500/8', text: 'text-emerald-500' },
        ok:      { dot: 'bg-emerald-500', bg: 'bg-emerald-500/8', text: 'text-emerald-500' },
        normal:  { dot: 'bg-emerald-500', bg: 'bg-emerald-500/8', text: 'text-emerald-500' },
        yellow:  { dot: 'bg-amber-500', bg: 'bg-amber-500/8', text: 'text-amber-500' },
        warning: { dot: 'bg-amber-500', bg: 'bg-amber-500/8', text: 'text-amber-500' },
        orange:  { dot: 'bg-amber-500', bg: 'bg-amber-500/8', text: 'text-amber-500' },
        red:     { dot: 'bg-red-500', bg: 'bg-red-500/8', text: 'text-red-500' },
        danger:  { dot: 'bg-red-500', bg: 'bg-red-500/8', text: 'text-red-500' },
        error:   { dot: 'bg-red-500', bg: 'bg-red-500/8', text: 'text-red-500' },
        critical:{ dot: 'bg-red-500', bg: 'bg-red-500/8', text: 'text-red-500' },
        gray:    { dot: 'bg-app-text-subtle', bg: 'bg-app-text-subtle/8', text: 'text-app-text-subtle' },
        grey:    { dot: 'bg-app-text-subtle', bg: 'bg-app-text-subtle/8', text: 'text-app-text-subtle' },
        unknown: { dot: 'bg-app-text-subtle', bg: 'bg-app-text-subtle/8', text: 'text-app-text-subtle' },
        offline: { dot: 'bg-app-text-subtle', bg: 'bg-app-text-subtle/8', text: 'text-app-text-subtle' },
      };
      const maxItems = gridSize.h <= 2 ? 2 : gridSize.h <= 3 ? 3 : items.length;
      const visibleItems = items.slice(0, maxItems);
      return (
        <div className="space-y-1.5">
          {visibleItems.map((item, i) => {
            const st = String(item.status || item.state || item.type || 'unknown');
            const cfg = statusConfig[st.toLowerCase()] || statusConfig.unknown;
            return (
              <div key={i} className={`flex items-center justify-between p-2.5 rounded-xl ${cfg.bg} border border-transparent hover:border-app-border-subtle transition-colors`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot} ${st === 'danger' || st === 'critical' || st === 'error' ? 'animate-pulse' : ''}`} />
                  <span className="text-xs text-app-text-secondary font-medium">{item.label || item.name || item.title || ''}</span>
                </div>
                <span className={`text-[11px] font-semibold ${cfg.text} tabular-nums`}>{item.value || item.val || item.desc || '—'}</span>
              </div>
            );
          })}
        </div>
      );
    }
    case 'universal': {
      const d = (displayData || {}) as Record<string, unknown>;
      const rawContent = (d.content || d.text || d.markdown || d.body || d.html || '') as string;
      if (isEmptyValue(rawContent)) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      // 如果内容包含 HTML 标签，提取纯文本预览
      const hasHtmlTags = /<[a-z][\s\S]*?>/i.test(rawContent);
      const content = hasHtmlTags ? rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : rawContent;
      // 简单 markdown 渲染：支持标题、列表、粗体
      const lines = content.split('\n');
      const clampClass = gridSize.h <= 2 ? 'line-clamp-2' : gridSize.h === 3 ? 'line-clamp-3' : 'line-clamp-6';
      return (
        <div className={`space-y-2 h-full text-xs text-app-text-secondary leading-relaxed overflow-hidden ${clampClass}`}>
          {lines.map((line, i) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('# ')) {
              return <h3 key={i} className="text-sm font-semibold text-app-text mt-2">{trimmed.slice(2)}</h3>;
            }
            if (trimmed.startsWith('## ')) {
              return <h4 key={i} className="text-xs font-semibold text-app-text-muted mt-1.5">{trimmed.slice(3)}</h4>;
            }
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary/50" />
                  <span>{trimmed.slice(2)}</span>
                </div>
              );
            }
            if (trimmed.match(/^\d+\.\s/)) {
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-app-text-subtle mt-0.5">{trimmed.match(/^\d+/)?.[0]}.</span>
                  <span>{trimmed.replace(/^\d+\.\s*/, '')}</span>
                </div>
              );
            }
            if (trimmed === '') {
              return <div key={i} className="h-1" />;
            }
            // 粗体 **text** — 使用 DOMPurify 消毒
            const bolded = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            const sanitized = DOMPurify.sanitize(bolded, { ALLOWED_TAGS: ['strong', 'em', 'code', 'br'] });
            return <p key={i} className="text-xs text-app-text-secondary" dangerouslySetInnerHTML={{ __html: sanitized }} />;
          })}
        </div>
      );
    }
    case 'gauge': {
      const d = (displayData || {}) as Record<string, unknown>;
      const value = Number(d.value ?? 0);
      const min = Number(d.min ?? 0);
      const max = Number(d.max ?? 100);
      const unit = (d.unit || '') as string;
      const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
      // 阈值着色（使用通用 hook）
      const thresholds = extractThresholds(d);
      const th = getThresholdColor(value, max, thresholds);
      const gaugeColor = th.color;
      // SVG 半圆仪表盘
      const r = 36;
      const cx = 40;
      const cy = 42;
      const arcLen = Math.PI * r; // 半圆周长
      const dashOffset = arcLen * (1 - pct / 100);
      const showLabel = gridSize.h > 2;
      return (
        <div
          className="h-full flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onDrillDown?.({ gauge: widget.title, value, pct: Math.round(pct) }, `${widget.title}: ${value}${unit}`);
          }}
          title="点击查看详情"
        >
          <svg width="80" height={showLabel ? 50 : 46} viewBox="0 0 80 50">
            {/* 背景弧 */}
            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="currentColor" strokeWidth="8" className="text-app-surface-subtle" strokeLinecap="round" />
            {/* 值弧 */}
            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={gaugeColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={arcLen} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
            {/* 中心数值 */}
            <text x={cx} y={cy + 2} textAnchor="middle" className="fill-app-text" fontSize="14" fontWeight="700">{value}{unit}</text>
          </svg>
          {showLabel && (
            <span className="text-[10px] text-app-text-subtle mt-1">{Math.round(pct)}%</span>
          )}
        </div>
      );
    }
    case 'funnel': {
      const d = (displayData || {}) as Record<string, unknown>;
      const rawStages = (d.stages || d.steps || d.phases || []) as Array<{ name?: string; value?: number; rate?: number; label?: string }>;
      if (!Array.isArray(rawStages) || rawStages.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const stages = rawStages.filter(s => s != null && typeof s === 'object').map((s) => ({
        name: s.name || s.label || '阶段',
        value: Number(s.value ?? 0),
        rate: s.rate !== undefined ? s.rate : undefined,
      }));
      const maxValue = Math.max(...stages.map((s) => s.value), 1);
      const funnelColors = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];
      const maxStages = gridSize.h <= 2 ? 3 : gridSize.h <= 3 ? 4 : stages.length;
      const visible = stages.slice(0, maxStages);
      return (
        <div className="h-full flex flex-col justify-center space-y-1.5">
          {visible.map((stage, i) => {
            const widthPct = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
            const prevValue = i > 0 ? visible[i - 1].value : stage.value;
            const dropRate = i > 0 && prevValue > 0 ? Math.round((1 - stage.value / prevValue) * 100) : undefined;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 flex items-center">
                  <div className="h-6 rounded-md flex items-center justify-center text-[10px] font-semibold text-white shadow-sm" style={{ width: `${Math.max(widthPct, 12)}%`, backgroundColor: funnelColors[i % funnelColors.length], minWidth: '36px', transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }}>
                    {stage.value}
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right">
                  <span className="text-[11px] text-app-text-secondary font-medium truncate block">{stage.name}</span>
                  {stage.rate !== undefined ? (
                    <span className="text-[10px] text-app-text-subtle tabular-nums">转化率 {stage.rate}%</span>
                  ) : dropRate !== undefined ? (
                    <span className="text-[10px] text-red-500 tabular-nums">↓ {dropRate}%</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'radar': {
      const d = (displayData || {}) as Record<string, unknown>;
      const rawLabels = (d.labels || d.dimensions || d.categories || []) as string[];
      const rawValues = (d.values || d.data || d.scores || []) as number[];
      if (!Array.isArray(rawLabels) || rawLabels.length === 0 || !Array.isArray(rawValues) || rawValues.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const labels = rawLabels.slice(0, 8);
      const values = rawValues.slice(0, 8).map((v) => Math.min(100, Math.max(0, Number(v) || 0)));
      const n = labels.length;
      const cx = 50, cy = 50, r = 35;
      // 计算多边形顶点
      const points = values.map((v, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const vr = (v / 100) * r;
        return `${cx + vr * Math.cos(angle)},${cy + vr * Math.sin(angle)}`;
      }).join(' ');
      // 网格线（20%, 40%, 60%, 80%, 100%）
      const grids = [20, 40, 60, 80, 100].map((pct) => {
        const gr = (pct / 100) * r;
        const gp = Array.from({ length: n }, (_, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          return `${cx + gr * Math.cos(angle)},${cy + gr * Math.sin(angle)}`;
        }).join(' ');
        return gp;
      });
      return (
        <div className="h-full flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ maxHeight: '140px' }}>
            {/* 网格 */}
            {grids.map((gp, i) => (
              <polygon key={i} points={gp} fill="none" stroke="currentColor" strokeWidth="0.5" className="text-app-border-subtle" />
            ))}
            {/* 轴线 */}
            {labels.map((_, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="currentColor" strokeWidth="0.5" className="text-app-border-subtle" />;
            })}
            {/* 数据面 */}
            <polygon points={points} fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth="1.5" />
            {/* 数据点 */}
            {values.map((v, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              const vr = (v / 100) * r;
              return <circle key={i} cx={cx + vr * Math.cos(angle)} cy={cy + vr * Math.sin(angle)} r="2" fill="#6366f1" />;
            })}
            {/* 标签 */}
            {labels.map((label, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              const lx = cx + (r + 10) * Math.cos(angle);
              const ly = cy + (r + 10) * Math.sin(angle);
              return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="7" className="fill-app-text-muted">{label}</text>;
            })}
          </svg>
        </div>
      );
    }
    case 'heatmap': {
      const d = (displayData || {}) as Record<string, unknown>;
      const rawRows = (d.rows || d.data || d.cells || []) as Array<{ x?: string; y?: string; value?: number; label?: string; column?: string; row?: string }>;
      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      // 提取唯一的 x/y 标签
      const xLabels = [...new Set(rawRows.filter(r => r != null).map((r) => r.x || r.column || r.label || '').filter(Boolean))];
      const yLabels = [...new Set(rawRows.filter(r => r != null).map((r) => r.y || r.row || '').filter(Boolean))];
      if (xLabels.length === 0) xLabels.push(...rawRows.filter(r => r != null).map((_, i) => String(i)));
      if (yLabels.length === 0) yLabels.push('');
      const values = rawRows.filter(r => r != null).map((r) => Number(r.value ?? 0));
      const maxV = Math.max(...values, 1);
      const minV = Math.min(...values, 0);
      const range = maxV - minV || 1;
      const cellColor = (v: number) => {
        const intensity = (v - minV) / range;
        // 从浅蓝到主色蓝
        const rr = Math.round(224 - intensity * 90);
        const gg = Math.round(232 - intensity * 140);
        const bb = Math.round(255 - intensity * 60);
        return `rgb(${rr},${gg},${bb})`;
      };
      const cellW = Math.max(24, Math.min(48, Math.floor(200 / xLabels.length)));
      const cellH = Math.max(18, Math.min(32, Math.floor(120 / yLabels.length)));
      return (
        <div className="h-full overflow-auto">
          <div className="inline-block">
            {/* 表头 */}
            <div className="flex">
              <div className="w-12 shrink-0" />
              {xLabels.map((x, i) => (
                <div key={i} className="text-[9px] text-app-text-subtle text-center px-0.5" style={{ width: cellW }}>{x}</div>
              ))}
            </div>
            {/* 数据行 */}
            {yLabels.map((y, yi) => (
              <div key={yi} className="flex items-center">
                <div className="w-12 shrink-0 text-[9px] text-app-text-subtle truncate pr-1">{y}</div>
                {xLabels.map((x, xi) => {
                  const cell = rawRows.find((r) => (r.x || r.column || r.label) === x && (r.y || r.row || '') === y);
                  const v = cell ? Number(cell.value ?? 0) : 0;
                  return (
                    <div key={xi} className="rounded-sm m-0.5 flex items-center justify-center text-[9px] font-medium" style={{ width: cellW - 4, height: cellH - 4, backgroundColor: cellColor(v), color: (v - minV) / range > 0.5 ? '#fff' : '#334155' }} title={`${x}${y ? ` / ${y}` : ''}: ${v}`}>
                      {v}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'bullet': {
      const d = (displayData || {}) as Record<string, unknown>;
      const value = Number(d.value ?? 0);
      const target = Number(d.target ?? 0);
      const max = Number(d.max ?? Math.max(value, target) * 1.2);
      const ranges = (d.ranges || [{ value: max * 0.6, color: '#ef4444' }, { value: max * 0.8, color: '#f59e0b' }, { value: max, color: '#22c55e' }]) as Array<{ value: number; color: string }>;
      const pct = max > 0 ? (value / max) * 100 : 0;
      const targetPct = max > 0 ? (target / max) * 100 : 0;
      const label = (d.label || '') as string;
      // 阈值告警着色
      const thresholds = extractThresholds(d);
      const th = getThresholdColor(value, max, thresholds);
      return (
        <div className="h-full flex flex-col justify-center gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-app-text-secondary font-medium">{label}</span>
            <span className={`text-sm font-bold tabular-nums ${th.text}`}>{value}{target > 0 ? <span className="text-app-text-subtle font-normal text-xs ml-1">/ {target}</span> : ''}</span>
          </div>
          <div className="relative h-3 bg-app-surface-subtle rounded-full overflow-hidden">
            {/* 背景区间 */}
            {ranges.filter(r => r != null && typeof r === 'object').map((range, i, filtered) => {
              const prev = i > 0 ? filtered[i - 1].value : 0;
              const rp = max > 0 ? ((range.value - prev) / max) * 100 : 0;
              const pp = max > 0 ? (prev / max) * 100 : 0;
              return <div key={i} className="absolute top-0 bottom-0" style={{ left: `${pp}%`, width: `${rp}%`, backgroundColor: range.color + '25' }} />;
            })}
            {/* 实际值条 */}
            <div className="absolute top-0.5 bottom-0.5 left-0 rounded-full shadow-sm" style={{ width: `${pct}%`, backgroundColor: th.color, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
            {/* 目标线 */}
            {target > 0 && (
              <div className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${targetPct}%`, transform: 'translateX(-50%)' }}>
                <div className="w-0.5 h-full bg-red-500/80" />
                <span className="text-[8px] text-red-500 mt-0.5 font-medium">目标</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    case 'alert': {
      const d = (displayData || {}) as Record<string, unknown>;
      const rawAlerts = (d.alerts || d.items || d.events || d.list || []) as Array<{ level?: string; severity?: string; type?: string; message?: string; title?: string; name?: string; time?: string; timestamp?: string }>;
      if (!Array.isArray(rawAlerts) || rawAlerts.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const alerts = rawAlerts.filter(a => a != null && typeof a === 'object').map((a) => ({
        level: String(a.level || a.severity || a.type || 'info').toLowerCase(),
        message: a.message || a.title || a.name || '告警事件',
        time: a.time || a.timestamp || '',
      }));
      const levelConfig: Record<string, { dot: string; bg: string; border: string; icon: typeof AlertCircle }> = {
        critical: { dot: 'bg-red-500', bg: 'bg-red-500/5', border: 'border-red-500/15', icon: AlertCircle },
        danger: { dot: 'bg-red-500', bg: 'bg-red-500/5', border: 'border-red-500/15', icon: AlertCircle },
        error: { dot: 'bg-red-500', bg: 'bg-red-500/5', border: 'border-red-500/15', icon: AlertCircle },
        warning: { dot: 'bg-amber-500', bg: 'bg-amber-500/5', border: 'border-amber-500/15', icon: AlertCircle },
        warn: { dot: 'bg-amber-500', bg: 'bg-amber-500/5', border: 'border-amber-500/15', icon: AlertCircle },
        info: { dot: 'bg-blue-500', bg: 'bg-blue-500/5', border: 'border-blue-500/15', icon: AlertCircle },
        success: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/15', icon: AlertCircle },
      };
      const maxItems = gridSize.h <= 2 ? 2 : gridSize.h <= 3 ? 3 : alerts.length;
      const visible = alerts.slice(0, maxItems);
      return (
        <div className="space-y-1.5">
          {visible.map((alert, i) => {
            const cfg = levelConfig[alert.level] || levelConfig.info;
            const Icon = cfg.icon;
            return (
              <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] text-app-text-secondary leading-snug block">{alert.message}</span>
                  {alert.time && <span className="text-[9px] text-app-text-subtle mt-0.5 block">{alert.time}</span>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'map': {
      // 地图占位：展示数据列表，提示需要地图库支持
      const d = (displayData || {}) as Record<string, unknown>;
      const rawPoints = (d.points || d.locations || d.regions || d.data || []) as Array<{ name?: string; value?: number; lat?: number; lng?: number; region?: string }>;
      if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const points = rawPoints.filter(p => p != null && typeof p === 'object').map((p) => ({ name: p.name || p.region || '未知', value: Number(p.value ?? 0) }));
      const maxV = Math.max(...points.map((p) => p.value), 1);
      return (
        <div className="space-y-1.5">
          {points.slice(0, gridSize.h <= 2 ? 3 : 5).map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-app-surface-subtle border border-app-border-subtle/50 hover:border-app-border/60 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">{i + 1}</div>
              <span className="text-xs text-app-text-secondary font-medium flex-1 truncate">{p.name}</span>
              <div className="flex items-center gap-2.5">
                <div className="w-20 h-1.5 bg-app-surface-hover rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-700" style={{ width: `${(p.value / maxV) * 100}%` }} />
                </div>
                <span className="text-[11px] text-app-text-secondary font-semibold tabular-nums w-9 text-right">{p.value}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-[10px] text-app-text-subtle px-1 mt-1">
            <AlertCircle className="w-3 h-3" />
            <span>地图可视化需引入地图库（ECharts/MapLibre）</span>
          </div>
        </div>
      );
    }
    default: {
      // 智能兜底：根据 data 结构推断最佳渲染方式
      const d = (displayData || {}) as Record<string, unknown>;

      // 1. 有 stages → 按 kanban 渲染
      const rawStages = (d.stages || []) as unknown[];
      const stages = Array.isArray(rawStages) ? rawStages.map((s) => (typeof s === 'string' ? s : s != null ? (s as Record<string, string>).name || (s as Record<string, string>).title || (s as Record<string, string>).label || JSON.stringify(s) : '')) : [];
      if (stages.length > 0) {
        return (
          <div className="space-y-2">
            {stages.map((stage, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-app-surface-subtle border border-app-border-subtle/50 hover:border-app-border/60 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">{i + 1}</div>
                <span className="text-xs text-app-text-secondary font-medium">{stage}</span>
                {i < stages.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-app-text-subtle ml-auto" />}
              </div>
            ))}
          </div>
        );
      }

      // 2. 有 items → 按 list 渲染
      const rawItems = (d.items || []) as unknown[];
      const items = Array.isArray(rawItems) ? rawItems.map((item) => (typeof item === 'string' ? item : (item as Record<string, string>).name || (item as Record<string, string>).title || (item as Record<string, string>).label || JSON.stringify(item))) : [];
      if (items.length > 0) {
        return (
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-app-surface-subtle/60 border border-transparent hover:border-app-border-subtle transition-colors">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary/50" />
                <span className="text-xs text-app-text-secondary">{item}</span>
              </div>
            ))}
          </div>
        );
      }

      // 3. 有 rows → 按 table 渲染
      const rawRows = (d.rows || []) as unknown[];
      const isObjectRows = rawRows.length > 0 && rawRows[0] !== null && typeof rawRows[0] === 'object' && !Array.isArray(rawRows[0]);
      const isArrayRows = rawRows.length > 0 && Array.isArray(rawRows[0]);
      const hasHeaderRow = isArrayRows && (rawRows[0] as unknown[]).every((c) => typeof c === 'string' || typeof c === 'number');
      const columns = (d.columns as string[]) || (isObjectRows
        ? Object.keys(rawRows[0] as Record<string, unknown>)
        : hasHeaderRow
          ? (rawRows[0] as string[])
          : isArrayRows
            ? Array.from({ length: (rawRows[0] as unknown[]).length }, (_, i) => `列${i + 1}`)
            : []);
      const dataRows = isObjectRows ? rawRows.filter(r => r != null && typeof r === 'object') : (hasHeaderRow ? rawRows.slice(1) : rawRows);
      const rows = isObjectRows
        ? dataRows.map((r) => columns.map((c) => String((r as Record<string, unknown>)[c] ?? '')))
        : dataRows.map((r) => Array.isArray(r) ? r.map(String) : [String(r)]);
      if (rows.length > 0) {
        return (
          <div className="space-y-1.5">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-app-surface-subtle/50 hover:bg-app-surface-hover transition-colors border border-transparent hover:border-app-border-subtle/60">
                {row.map((cell, j) => (
                  <span key={j} className={`text-[11px] ${j === 0 ? 'font-semibold text-app-text-secondary' : 'text-app-text-muted'}`}>{cell}</span>
                ))}
              </div>
            ))}
          </div>
        );
      }

      // 4. 有 labels + values → 按 chart 渲染
      const rawLabels = (d.labels || []) as unknown[];
      const labels = Array.isArray(rawLabels) ? rawLabels.map(String) : [];
      const rawValues = (d.values || []) as unknown[];
      const values = Array.isArray(rawValues) ? rawValues.map((v) => (typeof v === 'number' ? v : Number(v) || 0)) : [];
      if (labels.length > 0 && values.length > 0) {
        const max = Math.max(...values, 1);
        return (
          <div className="space-y-2">
            {labels.map((label, i) => (
              <div key={i} className="flex items-center gap-2.5 group">
                <span className="text-[11px] text-app-text-muted w-9 text-right shrink-0">{label}</span>
                <div className="flex-1 h-2.5 bg-app-surface-subtle rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary/40 transition-all duration-500" style={{ width: `${(values[i] / max) * 100}%` }} />
                </div>
                <span className="text-[11px] text-app-text-secondary font-medium w-10 text-right tabular-nums">{values[i]}</span>
              </div>
            ))}
          </div>
        );
      }

      // 5. 有 value → 按 metric 渲染
      const value = (d.value || d.数值 || d.amount) as string;
      if (value) {
        return (
          <div>
            <div className="text-2xl font-bold text-app-text tracking-tight">{value}</div>
            {Boolean(d.change || d.变化) && (
              <div className="flex items-center gap-1 mt-2 text-xs text-app-text-muted">
                <span>{String(d.change || d.变化)}</span>
              </div>
            )}
          </div>
        );
      }

      // 6. 有 html → 按 html 预览渲染
      const htmlContent = (d.html || d.body || '') as string;
      if (htmlContent) {
        const { text, metrics, headings } = extractHtmlPreview(htmlContent);
        const clampClass = gridSize.h <= 2 ? 'line-clamp-2' : gridSize.h === 3 ? 'line-clamp-3' : 'line-clamp-6';
        const maxMetrics = gridSize.w <= 2 ? 2 : 4;
        return (
          <div className="space-y-3 h-full flex flex-col">
            {metrics.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {metrics.slice(0, maxMetrics).map((m, i) => (
                  <div key={i} className="px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/15">
                    <span className="text-[11px] font-semibold text-primary">{m}</span>
                  </div>
                ))}
              </div>
            )}
            {text && <p className={`text-xs text-app-text-secondary leading-relaxed flex-1 ${clampClass}`}>{text}</p>}
            {gridSize.h > 2 && headings.length > 0 && (
              <div className="space-y-1">
                {headings.slice(0, 3).map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary/40" />
                    <span className="text-[10px] text-app-text-subtle truncate">{h}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-app-text-subtle mt-auto pt-1">
              <FileText className="w-3 h-3" />
              <span>点击查看完整报告</span>
            </div>
          </div>
        );
      }

      // 7. 有 summary/content → 按 report 渲染
      const summary = (d.summary || d.content || d.description || '') as string;
      const summaryClampClass = gridSize.h <= 2 ? 'line-clamp-2' : gridSize.h === 3 ? 'line-clamp-3' : 'line-clamp-6';
      if (summary) {
        return (
          <div className="space-y-2">
            <p className={`text-xs text-app-text-secondary leading-relaxed ${summaryClampClass}`}>{summary}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-app-text-subtle">
              <FileText className="w-3 h-3" />
              <span>点击阅读全文</span>
            </div>
          </div>
        );
      }

      // 7. 真正空数据：检查是否有其他可渲染字段（key 名做中文映射，不显示英文）
      const keys = Object.keys(d);
      if (keys.length > 0) {
        // 字段名中文映射表（避免显示英文 key）
        const keyLabels: Record<string, string> = {
          categories: '', labels: '', names: '', xAxis: '', dimensions: '',
          statuses: '', stages: '', columns: '', phases: '',
          items: '', tasks: '', entries: '', todos: '', list: '',
          steps: '', milestones: '', events: '', nodes: '',
          rows: '', data: '', records: '',
          highlights: '', keyPoints: '', metrics: '', stats: '', overview: '',
          values: '', series: '', yValues: '', numbers: '',
          summary: '', content: '', description: '',
          change: '', trend: '',
        };
        // 尝试找到第一个可渲染的字符串数组
        for (const key of keys) {
          const val = d[key];
          if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') {
            return (
              <div className="space-y-2">
                {keyLabels[key] === undefined && (
                  <p className="text-[10px] text-app-text-subtle">{key}</p>
                )}
                {val.map((v, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-app-surface-subtle/60 border border-transparent hover:border-app-border-subtle transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary/50" />
                    <span className="text-xs text-app-text-secondary">{v}</span>
                  </div>
                ))}
              </div>
            );
          }
        }
      }

      // 8. 最终兜底：友好空状态
      return (
        <div className="h-full flex flex-col items-center justify-center text-app-text-subtle">
          <div className="text-xs mb-1">暂无数据</div>
          <div className="text-[10px] text-app-text-subtle">组件类型：{widget.type}</div>
        </div>
      );
    }
  }
}

function agentModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    'single': '单智能体',
    'multi-coordinator': '多智能体·协调',
    'multi-parallel': '多智能体·并行',
    'llm-only': 'LLM 驱动',
  };
  return labels[mode] || mode;
}

/** 从 HTML 中提取预览信息：指标、表格、列表、摘要、标题 */
function extractHtmlPreview(html: string) {
  const cleanHtml = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // 提取纯文本
  const textOnly = cleanHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const text = textOnly.slice(0, 300);

  // 提取关键指标：数字、百分比、金额、评分、日期
  const metrics: string[] = [];
  const metricPatterns = [
    /(\d+\.?\d*)\s*%/g,           // 百分比
    /[¥$€]\s*(\d[\d,]*\.?\d*)/g,  // 金额
    /(\d[\d,]*\.?\d*)\s*(万|亿|千|百万|千万)/g,  // 中文大数
    /(\d+\.?\d*)\s*分/g,          // 评分
    /(\d{4}[年/-]\d{1,2}[月/-]\d{1,2})/g,  // 日期
  ];
  for (const pattern of metricPatterns) {
    let match;
    while ((match = pattern.exec(textOnly)) !== null) {
      const m = match[0].trim();
      if (!metrics.includes(m) && metrics.length < 10) {
        metrics.push(m);
      }
    }
  }

  // 提取标题（h1-h3）
  const headings: string[] = [];
  const headingMatch = cleanHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi);
  if (headingMatch) {
    for (const h of headingMatch) {
      const clean = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean && !headings.includes(clean) && headings.length < 10) {
        headings.push(clean);
      }
    }
  }

  // 提取列表项（ul/ol 中的 li）
  const listItems: string[] = [];
  const listMatch = cleanHtml.match(/<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/gi);
  if (listMatch) {
    for (const list of listMatch.slice(0, 2)) {
      const liMatches = list.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
      if (liMatches) {
        for (const li of liMatches.slice(0, 3)) {
          const clean = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (clean && !listItems.includes(clean) && listItems.length < 6) {
            listItems.push(clean);
          }
        }
      }
    }
  }

  // 提取表格首行数据
  const tableRows: string[][] = [];
  const tableMatch = cleanHtml.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
  if (tableMatch) {
    const firstTable = tableMatch[0];
    const trMatches = firstTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (trMatches) {
      for (const tr of trMatches.slice(0, 3)) {
        const cells = tr.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
        if (cells) {
          const row = cells.map((c) => c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
          if (row.length > 0) tableRows.push(row);
        }
      }
    }
  }

  return { text, metrics, headings, listItems, tableRows };
}

function findEmptyPosition(widgets: Widget[], w: number, h: number, cols = 12): { x: number; y: number } {
  const occupied = new Set<string>();
  for (const widget of widgets) {
    const { x, y, w: ww, h: hh } = widget.position;
    for (let dy = 0; dy < hh; dy++) {
      for (let dx = 0; dx < ww; dx++) {
        occupied.add(`${x + dx},${y + dy}`);
      }
    }
  }
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x <= cols - w; x++) {
      let fits = true;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          if (occupied.has(`${x + dx},${y + dy}`)) { fits = false; break; }
        }
        if (!fits) break;
      }
      if (fits) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
