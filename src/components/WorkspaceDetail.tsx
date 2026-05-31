import { useState, useRef, useEffect, useCallback, useMemo, type ElementType } from 'react';
import type {
  Widget,
  Agent,
  WidgetType,
  Workspace,
  WidgetAdaptiveHeadline,
  WidgetAdaptiveSection,
  WidgetMetricItem,
} from '@/types';
import DOMPurify from 'dompurify';
import { useWorkspaceDetail } from '@/hooks/useApiData';
import { useWidgetData } from '@/hooks/useWidgetData';
import { getThresholdColor, extractThresholds } from '@/hooks/useThresholdColor';
import { WidgetInteractionProvider, useWidgetInteraction } from '@/contexts/WidgetInteractionContext';
import { WidgetDetailDrawer } from './WidgetDetailDrawer';
import { CanvasGrid } from './CanvasGrid';
import { WidgetLibraryPanel } from './WidgetLibraryPanel';
import { inferWidgetType, isTypeMismatched } from '@/lib/widget-type-inferer';
import { getDefaultWidgetSize, normalizeWidget, normalizeWidgets } from '@/lib/widget-normalizer';
import { buildReportDisplayData } from '@/lib/report-widget';
import { computeDivergingBars, getSignedValueSemanticClasses, getTrendSemanticClasses, shouldUseTrendSeriesChart } from '@/lib/visual-adapters';
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

function TrendSeriesChart({ labels, values, unit = '', onPointClick }: { labels: string[]; values: number[]; unit?: string; onPointClick?: (label: string, value: number) => void }) {
  if (labels.length === 0 || values.length === 0) return null;
  const safeValues = values.map((value) => (Number.isFinite(value) ? value : 0));
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || 1;
  const width = 520;
  const height = 168;
  const padX = 36;
  const padTop = 18;
  const padBottom = 30;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;
  const points = safeValues.map((value, index) => {
    const x = padX + (labels.length === 1 ? chartW / 2 : (index / (labels.length - 1)) * chartW);
    const y = padTop + chartH - ((value - min) / range) * chartH;
    return { x, y, value, label: labels[index] };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${path} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`;
  const trend = safeValues[safeValues.length - 1] > safeValues[0] ? 'up' : safeValues[safeValues.length - 1] < safeValues[0] ? 'down' : 'flat';
  const tone = getTrendSemanticClasses(trend);
  const stroke = trend === 'down' ? 'hsl(var(--success))' : trend === 'up' ? 'hsl(var(--destructive))' : 'hsl(var(--info))';
  const showEveryLabel = labels.length <= 6 ? 1 : Math.ceil(labels.length / 6);

  return (
    <div className="h-full min-h-0">
      <svg className="h-full min-h-[150px] w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {[0, 1, 2].map((step) => {
          const y = padTop + (chartH / 2) * step;
          return <line key={step} x1={padX} x2={width - padX} y1={y} y2={y} stroke="currentColor" strokeWidth="1" className="text-app-border-subtle/75" />;
        })}
        <path d={areaPath} fill={stroke} opacity="0.08" />
        <path d={path} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={index === points.length - 1 ? 4 : 3}
              fill="hsl(var(--widget-bg))"
              stroke={stroke}
              strokeWidth="2"
              className="cursor-pointer"
              vectorEffect="non-scaling-stroke"
              onClick={(event) => {
                event.stopPropagation();
                onPointClick?.(point.label, point.value);
              }}
            />
            {(labels.length <= 5 || index === points.length - 1) && (
              <text x={point.x} y={Math.max(12, point.y - 10)} textAnchor="middle" fontSize="12" className={`fill-current ${tone.text} font-semibold`}>
                {point.value}{unit}
              </text>
            )}
            {index % showEveryLabel === 0 && (
              <text x={point.x} y={height - 9} textAnchor="middle" fontSize="11" className="fill-app-text-muted">
                {point.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
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

interface RuntimeWidgetSnapshot {
  widgetId: string;
  title: string;
  data: Record<string, unknown>;
}

const wsIcons: Record<string, ElementType> = { BarChart3, UserPlus, CheckCircle, Monitor, Target, DollarSign, TrendingUp, Code2, Users, Truck };
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

function buildWorkspaceAgentDisplay(workspace: Workspace, agents: Agent[]) {
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

  if (isCockpitLed) {
    return {
      isCockpitLed,
      cockpitAgentVirtual,
      primaryAgent: cockpitAgentVirtual,
      collaboratorAgents: [] as Agent[],
      displayAgents: cockpitAgentVirtual ? [cockpitAgentVirtual] : [],
    };
  }

  const availableAgents = agents.filter((agent) => workspace.agentIds.includes(agent.id));
  const primaryAgent = availableAgents.find((agent) => agent.id === workspace.primaryAgentId)
    || agents.find((agent) => agent.id === workspace.primaryAgentId)
    || availableAgents[0]
    || null;
  const collaboratorAgents = primaryAgent
    ? availableAgents.filter((agent) => agent.id !== primaryAgent.id)
    : availableAgents;
  const displayAgents = primaryAgent ? [primaryAgent, ...collaboratorAgents] : collaboratorAgents;

  return {
    isCockpitLed,
    cockpitAgentVirtual,
    primaryAgent,
    collaboratorAgents,
    displayAgents,
  };
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
  const { activeFilters, setFilter } = useWidgetInteraction();
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
  const [runtimeWidgetSnapshots, setRuntimeWidgetSnapshots] = useState<Record<string, RuntimeWidgetSnapshot>>({});

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
      setLocalWidgets(normalizeWidgets(workspace.widgets));
    }
  }, [workspace]);

  useEffect(() => {
    setRuntimeWidgetSnapshots({});
  }, [workspaceId]);

  useEffect(() => {
    const validIds = new Set(localWidgets.map((widget) => widget.id));
    setRuntimeWidgetSnapshots((prev) => {
      const nextEntries = Object.entries(prev).filter(([widgetId]) => validIds.has(widgetId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries);
    });
  }, [localWidgets]);

  const chatRequestContext = useMemo(() => {
    const history = messages.slice(-8).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const runtimeWidgetData = Object.values(runtimeWidgetSnapshots)
      .filter((snapshot) => snapshot && snapshot.data && Object.keys(snapshot.data).length > 0)
      .map((snapshot) => ({
        widgetId: snapshot.widgetId,
        title: snapshot.title,
        data: snapshot.data,
      }));

    const focusedWidget = drillState?.widget || detailWidget;
    const focusedWidgetSummary = focusedWidget
      ? {
          id: focusedWidget.id,
          title: focusedWidget.title,
          type: focusedWidget.type,
          detail: drillState?.dimension || '',
        }
      : undefined;

    return {
      history,
      runtimeWidgetData,
      viewContext: {
        activeFilters,
        focusedWidget: focusedWidgetSummary,
        drillContext: drillState?.context,
      },
    };
  }, [messages, runtimeWidgetSnapshots, activeFilters, detailWidget, drillState]);

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

  const handleRenameWidget = useCallback((widgetId: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setLocalWidgets((prev) => {
      const updated = prev.map((widget) => (
        widget.id === widgetId ? { ...widget, title: nextTitle } : widget
      ));
      saveWidgets(updated);
      return updated;
    });
  }, [saveWidgets]);

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
    const size = getDefaultWidgetSize(template.type);
    const pos = findEmptyPosition(localWidgets, size.w, size.h);
    const newWidget: Widget = {
      id: `widget-${Date.now()}-${crypto.randomUUID().slice(0, 5)}`,
      type: template.type,
      title: template.title,
      position: { x: pos.x, y: pos.y, w: size.w, h: size.h },
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
      chatRequestContext,
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
          chatRequestContext,
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
  }, [input, isLoading, workspace, workspaceId, chatExpanded, selectedAgentId, chatRequestContext]);

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
  const {
    isCockpitLed,
    cockpitAgentVirtual,
    primaryAgent,
    collaboratorAgents,
    displayAgents,
  } = buildWorkspaceAgentDisplay(workspace, agents);
  const displayPrimaryAgent = primaryAgent || cockpitAgentVirtual;
  const healthTone = workspace.orchestration?.health === 'healthy'
    ? 'text-emerald-500'
    : workspace.orchestration?.health === 'degraded'
      ? 'text-amber-500'
      : workspace.orchestration?.health === 'unavailable' || workspace.status === 'error'
        ? 'text-red-500'
        : 'text-app-text-secondary';
  const healthDot = workspace.orchestration?.health === 'healthy'
    ? 'bg-emerald-500'
    : workspace.orchestration?.health === 'degraded'
      ? 'bg-amber-500'
      : workspace.orchestration?.health === 'unavailable' || workspace.status === 'error'
        ? 'bg-red-500'
        : 'bg-app-text-subtle';

  return (
    <div className="bi-page flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="bi-toolbar shrink-0">
        <div className="px-6 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4">
                {layoutMode === 'cards' && (
                  <button onClick={onBack} className="rounded-xl p-2 text-app-text-subtle transition-colors hover:bg-app-surface-hover hover:text-app-text-muted">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-app-border-subtle bg-app-surface" style={{ backgroundColor: `${workspace.color}12` }}>
                  <Icon className="h-4.5 w-4.5" style={{ color: workspace.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleSaveTitle}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="min-w-[120px] max-w-[320px] rounded-lg border border-app-border-subtle bg-app-surface px-2 py-1 text-lg font-semibold text-app-text outline-none focus:border-red-400"
                      />
                    ) : (
                      <h1 className="truncate text-xl font-semibold text-app-text">{workspace.name}</h1>
                    )}
                    <span className="rounded-full border border-app-border-subtle bg-app-surface px-2 py-0.5 text-[10px] text-app-text-subtle">
                      智能驾驶舱
                    </span>
                    {workspace.executionOwner === 'external' && (
                      <span className="rounded-full border border-primary/15 bg-primary/8 px-2 py-0.5 text-[10px] text-primary">
                        {workspace.externalProvider === 'yonclaw'
                          ? 'YonClaw 主控'
                          : workspace.externalProvider === 'openclaw'
                            ? 'OpenClaw 主控'
                            : '外部主控'}
                      </span>
                    )}
                    {workspace.executionOwner !== 'external' && workspace.orchestration?.mode === 'cockpit-led' && (
                      <span className="rounded-full border border-app-border-subtle bg-app-surface px-2 py-0.5 text-[10px] text-app-text-subtle">
                        驾驶舱兜底
                      </span>
                    )}
                    {workspace.agentMode && workspace.agentMode !== 'single' && (
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        workspace.agentMode === 'llm-only'
                          ? 'border-purple-500/20 bg-purple-500/10 text-purple-500'
                          : 'border-primary/15 bg-primary/8 text-primary'
                      }`}>
                        {agentModeLabel(workspace.agentMode)}
                      </span>
                    )}
                  </div>
                  {isEditing ? (
                    <input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      onBlur={handleSaveTitle}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="mt-2 w-full rounded-lg border border-app-border-subtle bg-app-surface px-2 py-1 text-sm text-app-text-muted outline-none focus:border-red-400"
                      placeholder="添加描述..."
                    />
                  ) : (
                    <p className="mt-1.5 max-w-4xl truncate text-sm text-app-text-muted">
                      {workspace.description || '当前驾驶舱尚未填写描述。'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {displayAgents.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-app-border-subtle bg-app-surface px-3 py-2">
                  <div className="flex -space-x-2">
                    {displayAgents.slice(0, 4).map((agent, idx) => {
                      const isPrimary = displayPrimaryAgent?.id === agent.id || idx === 0;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => setActiveAgentId(activeAgentId === agent.id ? null : agent.id)}
                          className={`relative transition-all ${activeAgentId === agent.id ? 'z-20 scale-110' : isPrimary ? 'z-10' : 'z-0'}`}
                        >
                          {agent.id === 'cockpit-self' ? (
                            <div
                              className={`flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm ${isPrimary ? 'h-8 w-8 ring-2 ring-red-500/40' : 'h-7 w-7 ring-2 ring-app-surface'}`}
                              title={agent.name}
                            >
                              <Sparkles className={isPrimary ? 'h-4 w-4' : 'h-3 w-3'} />
                            </div>
                          ) : (
                            <div className={isPrimary ? 'rounded-full ring-2 ring-red-500/40' : 'rounded-full ring-2 ring-app-surface'}>
                              <AgentAvatar agent={agent} size="sm" showStatus />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-app-text-subtle">
                    <span>{collaboratorAgents.length > 0 ? `${displayAgents.length} 个智能体` : '主智能体'}</span>
                    <span className={`inline-flex items-center gap-1 ${healthTone}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${healthDot}`} />
                      {workspace.orchestration?.health || workspace.status}
                    </span>
                  </div>
                </div>
              )}
              {isEditing && (
                <button
                  onClick={() => setWidgetLibraryOpen(true)}
                  className="inline-flex items-center gap-1 rounded-xl border border-primary/15 bg-primary/8 px-3 py-2 text-xs text-primary transition-colors hover:bg-primary/15"
                >
                  <Plus className="h-3.5 w-3.5" />
                  添加组件
                </button>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-app-border-subtle bg-app-surface-subtle px-3 py-2">
                <span className="text-[11px] text-app-text-subtle">编辑模式</span>
                <Switch checked={isEditing} onCheckedChange={setIsEditing} />
              </label>
              <button
                onClick={() => {
                  refreshWorkspace();
                  setDetailWidget(null);
                  setDrillState(null);
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-app-border-subtle px-3 py-2 text-xs text-app-text-muted transition-colors hover:bg-app-surface-hover hover:text-app-text-secondary"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                刷新
              </button>
              {onRequestDelete && (
                <button
                  onClick={() => onRequestDelete(workspaceId)}
                  className="inline-flex items-center gap-1 rounded-xl border border-red-500/15 bg-red-500/8 px-3 py-2 text-xs text-red-500 transition-colors hover:bg-red-500/12"
                  title="删除驾驶舱"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeAgentId && (
        <div className="mx-6 mt-3 rounded-2xl border border-app-border-subtle bg-app-surface px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] animate-in slide-in-from-top-2">
          {(() => {
            const agent = agents.find((a) => a.id === activeAgentId) || (activeAgentId === 'cockpit-self' ? cockpitAgentVirtual : null);
            if (!agent) return null;
            const isPrimary = agent.id === displayPrimaryAgent?.id;
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
                      <span>{agent.skills.length} 项技能</span>
                      <span>·</span>
                      <span>{agent.sourceConnectionName || '外部连接智能体'}</span>
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

      {/* Dashboard Grid — 画布模式 */}
      <div className={`flex-1 overflow-y-auto sidebar-scroll p-5 pb-28 ${isEditing ? 'bg-app-surface-subtle/40' : ''}`}>
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
              onRename={(title) => handleRenameWidget(widget.id, title)}
              onRuntimeDataChange={(snapshot) => {
                setRuntimeWidgetSnapshots((prev) => {
                  const current = prev[widget.id];
                  const next = { ...prev };
                  if (!snapshot || !snapshot.data || Object.keys(snapshot.data).length === 0) {
                    if (!current) return prev;
                    delete next[widget.id];
                    return next;
                  }
                  const sameData = current
                    && current.title === snapshot.title
                    && JSON.stringify(current.data) === JSON.stringify(snapshot.data);
                  if (sameData) {
                    return prev;
                  }
                  next[widget.id] = snapshot;
                  return next;
                });
              }}
              onClick={() => {
                if (isEditing) return;
                const safeWidget = normalizeWidget(widget, localWidgets.findIndex((item) => item.id === widget.id)) || widget;
                if (safeWidget.link) {
                  const link = safeWidget.link;
                  if (link.type === 'workspace' && onSelectWorkspace) {
                    if (link.targetId) {
                      onSelectWorkspace(link.targetId);
                    } else if (link.targetTemplate && allWorkspaces) {
                      const targetWs = allWorkspaces.find((w) => w.id === link.targetTemplate || w.name === link.targetTemplate);
                      if (targetWs) {
                        onSelectWorkspace(targetWs.id);
                      } else {
                        setDetailWidget(safeWidget);
                      }
                    } else {
                      setDetailWidget(safeWidget);
                    }
                  } else if (link.type === 'url' && link.url) {
                    window.open(link.url, '_blank');
                  } else if (link.type === 'widget' && link.targetId) {
                    setDetailWidget(safeWidget);
                  } else {
                    setDetailWidget(safeWidget);
                  }
                } else {
                  setDetailWidget(safeWidget);
                }
              }}
              onDrillDown={(context, dimension) => {
                setDrillState({ widget: normalizeWidget(widget, localWidgets.findIndex((item) => item.id === widget.id)) || widget, context, dimension });
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
  adaptive: 'from-cyan-500/70 via-blue-400/50 to-transparent',
  gauge:    'from-red-500/70 via-red-400/50 to-transparent',
  funnel:   'from-purple-500/70 via-purple-400/50 to-transparent',
  radar:    'from-pink-500/70 via-pink-400/50 to-transparent',
  heatmap:  'from-orange-500/70 via-amber-400/50 to-transparent',
  bullet:   'from-cyan-500/70 via-sky-400/50 to-transparent',
  alert:    'from-red-500/70 via-orange-400/50 to-transparent',
  map:      'from-emerald-500/70 via-teal-400/50 to-transparent',
  sparkline:'from-indigo-500/70 via-blue-400/50 to-transparent',
};

export function WidgetRenderer({ workspaceId, widget, useDemoDataFallback, isEditing, onClick, onRename, onDrillDown, filterContext, onRuntimeDataChange, previewMode = false }: { workspaceId: string; widget: Widget; useDemoDataFallback?: boolean; isEditing?: boolean; onClick?: () => void; onRename?: (title: string) => void; onDrillDown?: (context: Record<string, unknown>, dimension: string) => void; filterContext?: Record<string, unknown>; onRuntimeDataChange?: (snapshot: RuntimeWidgetSnapshot | null) => void; previewMode?: boolean }) {
  const renderWidget = previewMode ? { ...widget, dataSource: undefined } : widget;
  const [titleDraft, setTitleDraft] = useState(renderWidget.title);
  const skipTitleCommitRef = useRef(false);
  const gridSize = { w: renderWidget.position.w, h: renderWidget.position.h };
  const hasDetail = !!renderWidget.detail || !!((renderWidget.data as Record<string, unknown>)?.detail) || !!((renderWidget.data as Record<string, unknown>)?.fullContent) || renderWidget.type === 'report' || renderWidget.type === 'html';
  const hasLink = !!renderWidget.link;
  const isClickable = !previewMode && !isEditing && (hasDetail || hasLink);
  const canRename = !!isEditing && !previewMode && !!onRename;
  const gradient = TYPE_GRADIENTS[renderWidget.type] || TYPE_GRADIENTS.universal;

  useEffect(() => {
    setTitleDraft(renderWidget.title);
  }, [renderWidget.title]);

  const commitTitle = useCallback(() => {
    if (skipTitleCommitRef.current) {
      skipTitleCommitRef.current = false;
      return;
    }
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleDraft(renderWidget.title);
      return;
    }
    if (nextTitle !== renderWidget.title) {
      onRename?.(nextTitle);
    }
  }, [onRename, renderWidget.title, titleDraft]);

  return (
    <div
      className={`bi-widget-shell group relative flex flex-col ${isEditing ? 'ring-1 ring-primary/25' : ''} ${isClickable ? 'cursor-pointer' : ''}`}
      onClick={isClickable ? onClick : undefined}
    >
      {/* 渐变顶部装饰线 */}
      <div className={`relative z-10 h-[3px] w-full bg-gradient-to-r ${gradient}`} />
      {/* 标题栏 */}
      <div className="bi-widget-titlebar relative z-10">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full bg-gradient-to-br shadow-sm ${gradient.replace('/70', '').replace('/50', '').replace(' to-transparent', '').replace(' via-', ' ')}`} />
          {canRename ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  skipTitleCommitRef.current = true;
                  setTitleDraft(renderWidget.title);
                  e.currentTarget.blur();
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-app-border-subtle bg-app-surface px-2 py-1 text-[13px] font-semibold text-app-text-secondary outline-none transition-colors focus:border-primary/45 focus:bg-app-bg"
              aria-label="组件名称"
            />
          ) : (
            <h4 className="truncate text-[13px] font-semibold text-app-text-secondary tracking-[0.01em]">{renderWidget.title}</h4>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasLink && <ExternalLink className="w-3.5 h-3.5 text-app-text-subtle/70 group-hover:text-primary/70 transition-colors" />}
          {hasDetail && <ArrowRight className="w-3.5 h-3.5 text-app-text-subtle/70 group-hover:text-primary/70 transition-colors" />}
        </div>
      </div>
      {/* 内容区 */}
      <div className="bi-widget-content relative z-10 flex-1">
        <WidgetContent workspaceId={workspaceId} widget={renderWidget} useDemoDataFallback={useDemoDataFallback} gridSize={gridSize} onDrillDown={onDrillDown} filterContext={filterContext} onRuntimeDataChange={onRuntimeDataChange} />
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

function EmptyWidgetState({ title, source, error, initError }: { title: string; source?: string; error?: string | null; initError?: string | null }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2.5 text-center">
      <div className="w-9 h-9 rounded-xl bg-app-surface-subtle border border-app-border-subtle flex items-center justify-center">
        <Monitor className="w-3.5 h-3.5 text-app-text-subtle/50" />
      </div>
      <div className="text-[13px] text-app-text-muted font-semibold">
        {initError ? '数据初始化失败' : error ? '数据获取失败' : '暂无数据'}
      </div>
      {source === 'static' && <div className="text-[11px] text-app-text-subtle/80">演示数据</div>}
      {error && <div className="max-w-[220px] text-[11px] leading-relaxed text-app-text-subtle/70">{error}</div>}
      {initError && <div className="max-w-[220px] text-[11px] leading-relaxed text-app-text-subtle/70">{initError}</div>}
      <div className="text-[11px] text-app-text-subtle/60">{title}</div>
    </div>
  );
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '');
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMetricTone(value: unknown): WidgetMetricItem['tone'] {
  const tone = String(value || '').toLowerCase();
  if (tone === 'success' || tone === 'warning' || tone === 'danger' || tone === 'info') {
    return tone;
  }
  return 'default';
}

function toneClasses(tone?: WidgetMetricItem['tone'] | WidgetAdaptiveHeadline['tone']) {
  switch (tone) {
    case 'success':
      return { chip: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/15', text: 'text-emerald-600', dot: 'bg-emerald-500' };
    case 'warning':
      return { chip: 'bg-amber-500/10 text-amber-600 border-amber-500/15', text: 'text-amber-600', dot: 'bg-amber-500' };
    case 'danger':
      return { chip: 'bg-red-500/10 text-red-600 border-red-500/15', text: 'text-red-600', dot: 'bg-red-500' };
    case 'info':
      return { chip: 'bg-sky-500/10 text-sky-600 border-sky-500/15', text: 'text-sky-600', dot: 'bg-sky-500' };
    default:
      return { chip: 'bg-app-surface-subtle text-app-text-subtle border-app-border-subtle', text: 'text-app-text-secondary', dot: 'bg-primary/60' };
  }
}

const DATA_VIZ_PALETTE = [
  {
    hex: 'hsl(var(--primary))',
    dotClass: 'bg-primary',
    gradientClass: 'from-primary to-red-400',
    badgeClass: 'bg-primary/8 border-primary/15 text-primary',
  },
  {
    hex: '#0f766e',
    dotClass: 'bg-teal-600',
    gradientClass: 'from-teal-600 to-emerald-400',
    badgeClass: 'bg-teal-500/8 border-teal-500/15 text-teal-600',
  },
  {
    hex: '#d97706',
    dotClass: 'bg-amber-500',
    gradientClass: 'from-amber-500 to-orange-400',
    badgeClass: 'bg-amber-500/8 border-amber-500/15 text-amber-600',
  },
  {
    hex: '#4f46e5',
    dotClass: 'bg-indigo-500',
    gradientClass: 'from-indigo-600 to-indigo-400',
    badgeClass: 'bg-indigo-500/8 border-indigo-500/15 text-indigo-600',
  },
  {
    hex: '#e11d48',
    dotClass: 'bg-rose-500',
    gradientClass: 'from-rose-600 to-rose-400',
    badgeClass: 'bg-rose-500/8 border-rose-500/15 text-rose-600',
  },
  {
    hex: '#0284c7',
    dotClass: 'bg-sky-500',
    gradientClass: 'from-sky-600 to-cyan-400',
    badgeClass: 'bg-sky-500/8 border-sky-500/15 text-sky-600',
  },
] as const;

function getVizStyle(index: number) {
  return DATA_VIZ_PALETTE[index % DATA_VIZ_PALETTE.length];
}

function getDensityProfile(gridSize: { w: number; h: number }) {
  const compact = gridSize.w <= 2 || gridSize.h <= 2;
  const relaxed = gridSize.w >= 5 || gridSize.h >= 4;
  return {
    compact,
    relaxed,
    bodyTextClass: compact ? 'text-[12px] leading-5' : 'text-[13px] leading-6',
    labelTextClass: compact ? 'text-[11px]' : 'text-[12px]',
    metaTextClass: compact ? 'text-[10px]' : 'text-[11px]',
  };
}

function normalizeMetricItem(item: unknown, index: number): WidgetMetricItem | null {
  if (item === null || item === undefined) return null;
  if (typeof item === 'string' || typeof item === 'number') {
    return {
      label: `指标 ${index + 1}`,
      value: typeof item === 'number' ? item : item.trim(),
      tone: 'default',
    };
  }

  const record = toRecord(item);
  if (!record) return null;
  const label = toStringValue(record.label || record.name || record.title || record.key || record.metric);
  const rawValue = record.value ?? record.val ?? record.amount ?? record.num ?? record.result;
  if (!label && isEmptyValue(rawValue)) return null;

  const trendRaw = String(record.trend || record.direction || '').toLowerCase();
  const trend: WidgetMetricItem['trend'] =
    trendRaw === 'up' || trendRaw === 'increase' || trendRaw === 'positive' ? 'up' :
    trendRaw === 'down' || trendRaw === 'decrease' || trendRaw === 'negative' ? 'down' :
    trendRaw === 'flat' || trendRaw === 'stable' ? 'flat' :
    undefined;

  return {
    label: label || `指标 ${index + 1}`,
    value: typeof rawValue === 'number' ? rawValue : toStringValue(rawValue) || '—',
    change: toStringValue(record.change || record.delta || record.comparison || record.diff),
    trend,
    caption: toStringValue(record.caption || record.description || record.note || record.subLabel),
    tone: toMetricTone(record.tone || record.status || record.level),
  };
}

function extractMetricItems(data: Record<string, unknown>): WidgetMetricItem[] {
  const candidates = [
    data.secondaryMetrics,
    data.metrics,
    data.kpis,
    data.stats,
    data.highlights,
    data.items,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const metrics = candidate
      .map((item, index) => normalizeMetricItem(item, index))
      .filter((item): item is WidgetMetricItem => item !== null);
    if (metrics.length > 0) return metrics;
  }
  return [];
}

function extractHeadline(data: Record<string, unknown>, widgetTitle: string): WidgetAdaptiveHeadline {
  const raw = toRecord(data.headline);
  const subtitle = toStringValue(data.subtitle || data.summary || data.description || data.caption);
  return {
    eyebrow: toStringValue(raw?.eyebrow || data.eyebrow || data.category || data.domain),
    title: toStringValue(raw?.title || data.title || widgetTitle),
    subtitle: toStringValue(raw?.subtitle || subtitle),
    status: toStringValue(raw?.status || data.statusLabel || data.status),
    tone: toMetricTone(raw?.tone || data.tone || data.level),
  };
}

function normalizeAdaptiveSection(section: unknown, index: number): WidgetAdaptiveSection | null {
  if (section === null || section === undefined) return null;
  if (typeof section === 'string') {
    return {
      type: 'text',
      title: `区块 ${index + 1}`,
      content: section.trim(),
    };
  }

  const record = toRecord(section);
  if (!record) return null;

  const type = toStringValue(record.type || record.kind || record.layout) as WidgetAdaptiveSection['type'];
  const title = toStringValue(record.title || record.name || record.label);
  const description = toStringValue(record.description || record.summary || record.caption);
  const content = toStringValue(record.content || record.text || record.markdown || record.body);
  const metrics = Array.isArray(record.metrics)
    ? record.metrics.map((item, metricIndex) => normalizeMetricItem(item, metricIndex)).filter((item): item is WidgetMetricItem => item !== null)
    : [];

  const itemsRaw = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.list)
      ? record.list
      : Array.isArray(record.entries)
        ? record.entries
        : [];

  const rowsRaw = Array.isArray(record.rows)
    ? record.rows
    : Array.isArray(record.data)
      ? record.data
      : Array.isArray(record.records)
        ? record.records
        : [];

  return {
    type: type || (
      metrics.length > 0 ? 'metrics' :
      rowsRaw.length > 0 ? 'table' :
      itemsRaw.length > 0 ? 'list' :
      content ? 'text' :
      'highlights'
    ),
    title,
    description,
    content,
    metrics,
    items: itemsRaw,
    columns: Array.isArray(record.columns) ? record.columns.map(String) : undefined,
    rows: rowsRaw as Array<string[] | Record<string, unknown>>,
  };
}

function extractAdaptiveSections(data: Record<string, unknown>): WidgetAdaptiveSection[] {
  const candidates = [data.sections, data.blocks, data.cards];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const sections = candidate
      .map((item, index) => normalizeAdaptiveSection(item, index))
      .filter((item): item is WidgetAdaptiveSection => item !== null);
    if (sections.length > 0) return sections;
  }

  const fallbackSections: WidgetAdaptiveSection[] = [];
  const metricItems = extractMetricItems(data);
  if (metricItems.length > 0) {
    fallbackSections.push({ type: 'metrics', title: '关键指标', metrics: metricItems.slice(0, 4) });
  }
  const textContent = toStringValue(data.content || data.text || data.markdown || data.body || data.summary);
  if (textContent) {
    fallbackSections.push({ type: 'text', title: '摘要', content: textContent });
  }
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data.list) ? data.list : [];
  if (items.length > 0) {
    fallbackSections.push({ type: 'list', title: '要点', items });
  }
  const rows = Array.isArray(data.rows) ? data.rows : Array.isArray(data.records) ? data.records : [];
  if (rows.length > 0) {
    fallbackSections.push({ type: 'table', title: '明细', rows: rows as Array<string[] | Record<string, unknown>>, columns: Array.isArray(data.columns) ? data.columns.map(String) : undefined });
  }
  return fallbackSections;
}

function normalizeUniversalContent(rawContent: string) {
  const hasHtmlTags = /<[a-z][\s\S]*?>/i.test(rawContent);
  const content = hasHtmlTags ? rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : rawContent;
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, arr) => !(line === '' && arr[index - 1] === ''));

  const headings: string[] = [];
  const bullets: string[] = [];
  const ordered: string[] = [];
  const paragraphs: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('# ')) {
      headings.push(line.slice(2).trim());
      continue;
    }
    if (line.startsWith('## ')) {
      headings.push(line.slice(3).trim());
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      bullets.push(line.slice(2).trim());
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      ordered.push(line.replace(/^\d+\.\s*/, ''));
      continue;
    }
    paragraphs.push(line);
  }

  return {
    text: content,
    headings,
    bullets,
    ordered,
    paragraphs,
  };
}

function renderMetricChip(metric: WidgetMetricItem, index: number) {
  const tone = toneClasses(metric.tone);
  const trendText = metric.change || (metric.trend === 'up' ? '上升' : metric.trend === 'down' ? '下降' : '');
  const trendTone = getTrendSemanticClasses(metric.trend || '');
  return (
    <div key={`${metric.label}-${index}`} className="rounded-md border border-app-border-subtle bg-app-surface-subtle/55 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-app-text-muted">{metric.label}</span>
        {metric.trend && (
          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${trendTone.bg} ${trendTone.border} ${trendTone.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${trendTone.dot}`} />
            {metric.trend === 'up' ? '上升' : metric.trend === 'down' ? '下降' : '持平'}
          </span>
        )}
      </div>
      <div className={`bi-tabular mt-1.5 text-[15px] font-semibold ${tone.text}`}>{metric.value}</div>
      {trendText && <div className="mt-1 text-[11px] text-app-text-muted">{trendText}</div>}
      {metric.caption && <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-app-text-subtle/85">{metric.caption}</div>}
    </div>
  );
}

function renderAdaptiveSection(section: WidgetAdaptiveSection, gridSize: { w: number; h: number }, sectionIndex: number) {
  const title = section.title || `区块 ${sectionIndex + 1}`;
  const maxMetrics = gridSize.w <= 3 ? 2 : gridSize.w >= 6 ? 4 : 3;
  const maxItems = gridSize.h <= 2 ? 2 : gridSize.h <= 3 ? 3 : 4;
  const density = getDensityProfile(gridSize);

  return (
    <div key={`${title}-${sectionIndex}`} className="rounded-2xl border border-app-border-subtle/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.75),rgba(246,243,241,0.72))] p-3.5">
      {(section.title || section.description) && (
        <div className="mb-2.5">
          {section.title && <div className="text-[13px] font-semibold text-app-text-secondary">{section.title}</div>}
          {section.description && <div className="mt-1 text-[11px] leading-relaxed text-app-text-muted">{section.description}</div>}
        </div>
      )}

      {section.type === 'metrics' && section.metrics && section.metrics.length > 0 && (
        <div className={`grid gap-2 ${gridSize.w >= 5 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {section.metrics.slice(0, maxMetrics).map((metric, index) => renderMetricChip(metric, index))}
        </div>
      )}

      {section.type === 'list' && Array.isArray(section.items) && section.items.length > 0 && (
        <div className="space-y-1.5">
          {section.items.slice(0, maxItems).map((item, index) => {
            const record = toRecord(item);
            const text = record
              ? toStringValue(record.label || record.title || record.name || record.description || record.value)
              : toStringValue(item);
            return (
              <div key={`${text}-${index}`} className="flex items-start gap-2 rounded-xl bg-widget-bg/65 px-2.5 py-2">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/65" />
                <span className={`${density.bodyTextClass} text-app-text-secondary`}>{text}</span>
              </div>
            );
          })}
        </div>
      )}

      {section.type === 'table' && Array.isArray(section.rows) && section.rows.length > 0 && (
        <div className="space-y-1.5">
          {Array.isArray(section.columns) && section.columns.length > 0 && (
            <div className="flex items-center gap-2 border-b border-app-border-subtle/60 px-2 pb-1.5">
              {section.columns.slice(0, gridSize.w <= 3 ? 2 : 3).map((column, index) => (
                <span key={`${column}-${index}`} className="flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text-muted">
                  {column}
                </span>
              ))}
            </div>
          )}
          {section.rows.slice(0, maxItems).map((row, index) => {
            const cells = Array.isArray(row)
              ? row.map(String)
              : (() => {
                  const record = toRecord(row);
                  if (!record) return [];
                  const keys = section.columns && section.columns.length > 0 ? section.columns : Object.keys(record);
                  return keys.slice(0, gridSize.w <= 3 ? 2 : 3).map((key) => toStringValue(record[key]) || '—');
                })();
            return (
              <div key={`row-${index}`} className="flex items-center gap-2 rounded-xl bg-widget-bg/65 px-2.5 py-2">
                {cells.slice(0, gridSize.w <= 3 ? 2 : 3).map((cell, cellIndex) => (
                  <span key={`${cell}-${cellIndex}`} className={`flex-1 truncate text-[12px] ${cellIndex === 0 ? 'font-semibold text-app-text-secondary' : 'text-app-text-muted'}`}>
                    {cell}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {(section.type === 'text' || section.type === 'highlights' || section.type === 'status' || section.type === 'timeline') && (
        <>
          {section.content && (
            <p className={`${density.bodyTextClass} text-app-text-secondary ${gridSize.h <= 2 ? 'line-clamp-3' : 'line-clamp-5'}`}>
              {section.content}
            </p>
          )}
          {!section.content && Array.isArray(section.items) && section.items.length > 0 && (
            <div className="space-y-1.5">
              {section.items.slice(0, maxItems).map((item, index) => {
                const record = toRecord(item);
                const label = record
                  ? toStringValue(record.label || record.title || record.name || record.status || record.value)
                  : toStringValue(item);
                const detail = record ? toStringValue(record.description || record.caption || record.note) : '';
                return (
                  <div key={`${label}-${index}`} className="rounded-xl bg-widget-bg/65 px-2.5 py-2">
                    <div className={`${density.labelTextClass} font-semibold text-app-text-secondary`}>{label}</div>
                    {detail && <div className="mt-1 text-[11px] leading-relaxed text-app-text-muted">{detail}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WidgetContent({ workspaceId, widget, useDemoDataFallback, gridSize, onDrillDown, filterContext, onRuntimeDataChange }: { workspaceId: string; widget: Widget; useDemoDataFallback?: boolean; gridSize: { w: number; h: number }; onDrillDown?: (context: Record<string, unknown>, dimension: string) => void; filterContext?: Record<string, unknown>; onRuntimeDataChange?: (snapshot: RuntimeWidgetSnapshot | null) => void }) {
  const { data: liveData, loading, error, source } = useWidgetData(workspaceId, widget, useDemoDataFallback, filterContext);
  const density = getDensityProfile(gridSize);

  // 使用动态数据（如果存在），否则回退到 widget.data
  const displayData = liveData || widget.data || {};
  const runtimeDataRecord = liveData
    && liveData !== widget.data
    && typeof liveData === 'object'
    && !Array.isArray(liveData)
    ? liveData as Record<string, unknown>
    : null;

  useEffect(() => {
    if (!onRuntimeDataChange) return;
    if (runtimeDataRecord && Object.keys(runtimeDataRecord).length > 0) {
      onRuntimeDataChange({
        widgetId: widget.id,
        title: widget.title,
        data: runtimeDataRecord,
      });
      return;
    }
    onRuntimeDataChange(null);
  }, [onRuntimeDataChange, runtimeDataRecord, widget.id, widget.title, source]);

  const dataSource = (displayData as Record<string, unknown> | undefined)?.__source as string | undefined;

  // 检测 LLM 初始化失败状态（由后端在 initializeWorkspaceWithLLM 失败时写入）
  const displayRecord = displayData && typeof displayData === 'object' && !Array.isArray(displayData)
    ? displayData as Record<string, unknown>
    : undefined;
  const initStatus = displayRecord?.__initStatus as string | undefined;
  const initError = displayRecord?.__initError as string | undefined;
  const hasRenderableData = displayRecord
    ? Object.entries(displayRecord).some(([key, value]) => !key.startsWith('__') && !isEmptyValue(value))
    : false;
  if (initStatus === 'failed' && !hasRenderableData) {
    return <EmptyWidgetState title={widget.title} initError={initError || 'LLM 初始化失败，请检查连接配置'} />;
  }

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
      const metricItems = extractMetricItems(d);
      const primaryMetric = normalizeMetricItem(d.primaryMetric || d.metric, 0);
      const fallbackPrimary = primaryMetric || (metricItems.length > 0 ? metricItems[0] : null);
      const rawPrimaryValue = d.value ?? fallbackPrimary?.value;
      const rawPrimaryChange = d.change ?? fallbackPrimary?.change;
      const rawPrimaryTrend = d.trend ?? fallbackPrimary?.trend;
      const rawPrimaryCaption = d.caption ?? fallbackPrimary?.caption;

      // 兼容：yonclaw 可能把报告内容误存为 metric 类型（data.content 有值但 value 为空）
      if (isEmptyValue(rawPrimaryValue) && typeof d.content === 'string') {
        const contentText = d.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return (
          <div className="h-full flex flex-col">
            <p className="flex-1 text-[13px] leading-6 text-app-text-secondary line-clamp-4">{contentText}</p>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-app-text-muted">
              <FileText className="w-3 h-3" />
              <span>点击查看详情</span>
            </div>
          </div>
        );
      }
      if (isEmptyValue(rawPrimaryValue)) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }

      const valueStr = String(rawPrimaryValue ?? '');
      const trend = String(rawPrimaryTrend || '');
      const changeStr = String(rawPrimaryChange || '');
      const caption = String(rawPrimaryCaption || '');
      const variant = String(d.variant || ''); // 'accent' | 'status' | 'compare' | 'mini'
      const isPositive = trend === 'up';
      const isNegative = trend === 'down';
      const trendTone = getTrendSemanticClasses(trend);
      const compareValue = String(d.compareValue || d.previous || d.target || '—');
      const compareLabel = String(d.compareLabel || d.previousLabel || d.targetLabel || '对比');
      const consumeFirstMetricAsPrimary = isEmptyValue(d.value) && !primaryMetric && metricItems.length > 0;
      const secondaryMetrics = consumeFirstMetricAsPrimary && fallbackPrimary && metricItems[0] === fallbackPrimary
        ? metricItems.slice(1)
        : metricItems;
      const summaryRows = [d.summaryRows, d.insights, d.notes, d.annotations, d.highlights]
        .find(Array.isArray) as unknown[] | undefined;
      const normalizedSummaries = Array.isArray(summaryRows)
        ? summaryRows
            .map((item) => {
              if (typeof item === 'string') return { label: item, detail: '' };
              const record = toRecord(item);
              if (!record) return null;
              return {
                label: toStringValue(record.label || record.title || record.name || record.key || record.metric),
                detail: toStringValue(record.value || record.description || record.caption || record.note),
              };
            })
            .filter((item): item is { label: string; detail: string } => item !== null && !!item.label)
        : [];

      // ── 变体：迷你卡 ──
      if (variant === 'mini' || gridSize.h <= 1) {
        return (
          <div className="h-full flex flex-col justify-center px-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-app-text-muted">{widget.title}</span>
            <span className="text-lg font-bold text-app-text tracking-tight tabular-nums mt-0.5">{valueStr}</span>
            {!isEmptyValue(changeStr) && (
              <span className={`mt-0.5 text-[11px] ${trendTone.text}`}>
                {isPositive ? '▲' : isNegative ? '▼' : '—'} {changeStr}
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
              <span className="text-[13px] text-app-text-muted">{widget.title}</span>
            </div>
            <span className={`text-2xl font-bold tracking-tight tabular-nums mt-2 ${cfg.text}`}>{valueStr}</span>
            {!isEmptyValue(changeStr) && <span className="mt-1 text-[12px] text-app-text-muted">{changeStr}</span>}
          </div>
        );
      }

      // ── 变体：对比卡（双列数值）─
      if (variant === 'compare') {
        return (
          <div className="h-full flex flex-col justify-center rounded-xl border border-app-border-subtle bg-app-surface-subtle p-4">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-app-text-muted">{widget.title}</span>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-2xl font-bold text-app-text tracking-tight tabular-nums">{valueStr}</span>
              <span className="text-[12px] text-app-text-muted">{compareLabel}</span>
              <span className="text-lg font-medium text-app-text-muted tabular-nums">{compareValue}</span>
            </div>
            {!isEmptyValue(changeStr) && (
              <span className={`mt-1 text-[12px] ${trendTone.text}`}>
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
      const sparkline = d.sparkline as { labels?: string[]; values?: number[] } | undefined;
      const hasSparkline = sparkline && Array.isArray(sparkline.values) && sparkline.values.length > 1;
      const numericValue = parseNumericValue(rawPrimaryValue);
      const valueMax = Number(d.max ?? d.target ?? 100);
      const thresholds = extractThresholds(d);
      const thresholdColor = numericValue !== null
        ? getThresholdColor(numericValue, valueMax, thresholds)
        : null;
      const hasExplicitThresholds = !!thresholds && thresholds.length > 0;
      const showComparison = !isEmptyValue(compareValue) && compareValue !== '—' && gridSize.w >= 4;
      const showSecondaryMetrics = secondaryMetrics.length > 0 && (gridSize.w >= 4 || gridSize.h >= 3);
      const showSummary = normalizedSummaries.length > 0 && gridSize.h >= 3;
      const maxSecondaryMetrics = gridSize.w >= 6 ? 4 : gridSize.w >= 4 ? 3 : 2;
      const valueColor = hasExplicitThresholds && thresholdColor ? thresholdColor.text : 'text-app-text';

      return (
        <div className="h-full flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div
                className={`${valueSize} bi-tabular font-semibold tracking-tight leading-none ${valueColor} cursor-pointer transition-opacity hover:opacity-80`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDrillDown?.({ metric: widget.title, value: numericValue ?? valueStr }, `${widget.title}: ${valueStr}`);
                }}
                title="点击查看详情"
              >
                {valueStr}
              </div>
              {caption && (
                <span className="mt-1.5 block text-[12px] leading-relaxed text-app-text-muted">{caption}</span>
              )}
            </div>
            {hasSparkline && gridSize.w >= 3 && (
              <div className={`shrink-0 rounded-md border border-app-border-subtle bg-app-surface-subtle/65 px-2.5 py-2 ${isCompact ? 'w-20' : 'w-28'}`}>
                <Sparkline values={sparkline.values!} color={trendTone.sparklineColor} height={isCompact ? 26 : 32} />
              </div>
            )}
          </div>

          {showChange && (
            <div className={`flex items-center gap-1.5 ${isCompact ? 'text-[12px]' : 'text-[13px]'}`}>
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${trendTone.bg}`}>
                {isPositive ? <TrendingUp className={`w-3 h-3 ${trendTone.icon}`} /> : isNegative ? <TrendingDown className={`w-3 h-3 ${trendTone.icon}`} /> : <ArrowRight className={`w-3 h-3 ${trendTone.icon}`} />}
              </span>
              <span className={`font-semibold ${trendTone.text}`}>{changeStr}</span>
            </div>
          )}

          {showComparison && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-app-border-subtle bg-app-surface-subtle/55 px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-app-text-muted">当前</div>
                <div className="bi-tabular mt-1 text-[15px] font-semibold text-app-text-secondary">{valueStr}</div>
              </div>
              <div className="rounded-md border border-app-border-subtle bg-app-surface-subtle/55 px-3 py-2.5">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-app-text-muted">{compareLabel}</div>
                <div className="bi-tabular mt-1 text-[15px] font-semibold text-app-text-secondary">{compareValue}</div>
              </div>
            </div>
          )}

          {showSecondaryMetrics && (
            <div className={`grid gap-2 ${gridSize.w >= 6 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {secondaryMetrics.slice(0, maxSecondaryMetrics).map((metric, index) => renderMetricChip(metric, index))}
            </div>
          )}

          {showSummary && (
            <div className="space-y-1.5 mt-auto">
              {normalizedSummaries.slice(0, gridSize.h >= 4 ? 3 : 2).map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex items-start gap-2 rounded-md bg-app-surface-subtle/55 px-2.5 py-2">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-app-text-secondary">{item.label}</div>
                    {item.detail && <div className="mt-0.5 text-[11px] leading-relaxed text-app-text-muted">{item.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
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
      const styleConfig = d.styleConfig && typeof d.styleConfig === 'object' ? d.styleConfig as Record<string, unknown> : {};
      const donutConfig = styleConfig.donut && typeof styleConfig.donut === 'object' ? styleConfig.donut as Record<string, unknown> : {};
      const requestedVariant = String(styleConfig.variant || d.variant || 'auto');
      const unit = toStringValue(d.unit || d.单位);
      const configuredMaxSlices = Number(donutConfig.maxSlices);
      const donutMaxSlices = Number.isFinite(configuredMaxSlices) ? Math.max(2, Math.min(8, Math.floor(configuredMaxSlices))) : 5;
      const maxItems = gridSize.h <= 2 ? 3 : gridSize.h <= 3 ? 5 : requestedVariant === 'donut' ? Math.min(labels.length, donutMaxSlices) : labels.length;
      const showValues = gridSize.w >= 4;
      const slicedLabels = labels.slice(0, maxItems);
      const slicedValues = values.slice(0, maxItems);
      const total = slicedValues.reduce((a, b) => a + b, 0);
      const barItems = computeDivergingBars(slicedLabels, slicedValues);
      const hasMixedSigns = slicedValues.some((value) => value < 0) && slicedValues.some((value) => value > 0);
      const useTrendSeries = shouldUseTrendSeriesChart(slicedLabels, widget.title, requestedVariant);

      const enoughRoomForDonut = gridSize.w >= 4 && gridSize.h >= 3;
      const compactDonut = gridSize.w < 5 || gridSize.h < 4;
      const autoDonut = labels.length <= donutMaxSlices && total > 0;
      const useDonut = useTrendSeries || requestedVariant === 'bar'
        ? false
        : requestedVariant === 'donut'
          ? enoughRoomForDonut && total > 0
          : autoDonut && enoughRoomForDonut;

      if (useTrendSeries) {
        return (
          <TrendSeriesChart
            labels={slicedLabels}
            values={slicedValues}
            unit={unit}
            onPointClick={(label, value) => onDrillDown?.({ category: label, value }, `${widget.title} / ${label}`)}
          />
        );
      }

      if (useDonut) {
        const innerRatio = Number(donutConfig.innerRatio);
        const safeInnerRatio = Number.isFinite(innerRatio) ? Math.max(0.42, Math.min(0.72, innerRatio)) : 0.58;
        const donutSize = gridSize.w >= 7 && gridSize.h >= 5 ? 126 : gridSize.w >= 6 && gridSize.h >= 4 ? 108 : gridSize.w >= 5 ? 92 : 76;
        const holeSize = Math.round(donutSize * safeInnerRatio);
        const legendLimit = compactDonut ? Math.min(slicedLabels.length, 4) : Math.min(slicedLabels.length, donutMaxSlices);
        // 构建 conic-gradient
        let acc = 0;
        const segments = slicedValues.map((v) => {
          const start = acc;
          const pct = (v / total) * 100;
          acc += pct;
          return { start, end: acc };
        });
        const gradient = segments.map((s, i) => {
          const style = getVizStyle(i);
          return `${style.hex} ${s.start}% ${s.end}%`;
        }).join(', ');

        return (
          <div className={`h-full min-h-0 ${gridSize.w >= 6 ? 'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5' : 'flex items-center gap-4'}`}>
            <div className="relative shrink-0" style={{ width: `${donutSize}px`, height: `${donutSize}px` }}>
              <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
              <div
                className="absolute inset-0 m-auto flex items-center justify-center rounded-full bg-widget-bg shadow-sm ring-1 ring-app-border-subtle/60"
                style={{ width: `${holeSize}px`, height: `${holeSize}px` }}
              >
                <span className={`${density.metaTextClass} font-bold text-app-text-secondary tabular-nums`}>{total}</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2 overflow-hidden">
              {slicedLabels.slice(0, legendLimit).map((label, i) => {
                const style = getVizStyle(i);
                const pct = total > 0 ? Math.round((slicedValues[i] / total) * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-2.5 group">
                    <div className={`h-2 w-2 rounded-sm ${style.dotClass}`} />
                    <span className={`${density.labelTextClass} min-w-0 truncate flex-1 text-app-text-muted`}>{label}</span>
                    <span className={`${density.labelTextClass} bi-tabular font-semibold text-app-text-secondary`}>{slicedValues[i]}</span>
                    <span className={`w-7 text-right ${density.metaTextClass} bi-tabular text-app-text-subtle`}>{pct}%</span>
                  </div>
                );
              })}
              {slicedLabels.length > legendLimit && (
                <div className={`${density.metaTextClass} text-app-text-subtle`}>
                  另 {slicedLabels.length - legendLimit} 项已折叠
                </div>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {barItems.map((item, i) => {
            const style = getVizStyle(i);
            const signedTone = getSignedValueSemanticClasses(item.value);
            return (
              <div
                key={i}
                className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-app-surface-hover"
                onClick={(e) => {
                  e.stopPropagation();
                  onDrillDown?.({ category: item.label, value: item.value }, `${widget.title} / ${item.label}`);
                }}
                title={`下钻: ${item.label}`}
              >
                {gridSize.w >= 3 && <span className={`w-9 shrink-0 truncate text-right ${density.labelTextClass} text-app-text-muted`}>{item.label}</span>}
                <div className="relative h-3 flex-1 rounded-full bg-app-surface-subtle">
                  {hasMixedSigns ? (
                    <>
                      <div className="absolute bottom-[-2px] top-[-2px] w-px bg-app-border-hover" style={{ left: `${item.zeroPct}%` }} />
                      {item.negativePct > 0 && (
                        <div
                          className={`absolute top-0 h-full rounded-l-full ${signedTone.bar} transition-all duration-500 ease-out`}
                          style={{ left: `${item.zeroPct - item.negativePct}%`, width: `${item.negativePct}%` }}
                        />
                      )}
                      {item.positivePct > 0 && (
                        <div
                          className={`absolute top-0 h-full rounded-r-full ${signedTone.bar} transition-all duration-500 ease-out`}
                          style={{ left: `${item.zeroPct}%`, width: `${item.positivePct}%` }}
                        />
                      )}
                    </>
                  ) : (
                    <div
                      className={`h-full rounded-full ${item.value < 0 ? signedTone.bar : `bg-gradient-to-r ${style.gradientClass}`} transition-all duration-500 ease-out`}
                      style={{ width: `${Math.max(item.negativePct, item.positivePct, item.value === 0 ? 2 : 0)}%` }}
                    />
                  )}
                </div>
                {showValues && <span className={`w-10 text-right ${density.labelTextClass} bi-tabular font-semibold ${signedTone.text}`}>{item.value}</span>}
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
        <div className="h-full min-h-0 overflow-hidden rounded-md border border-app-border-subtle bg-app-surface/60">
          {/* 表头 */}
          {columns.length > 0 && (
            <div className="grid border-b border-app-border-subtle bg-app-surface-subtle/70 px-3 py-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, columnGap: '12px' }}>
              {columns.map((col, j) => (
                <span key={j} className={`truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text-muted ${j > 0 ? 'text-right' : ''}`}>{col}</span>
              ))}
            </div>
          )}
          <div className="divide-y divide-app-border-subtle/70">
            {rows.map((row, i) => (
              <div
                key={i}
                className="grid cursor-pointer px-3 py-2 transition-colors hover:bg-app-surface-hover"
                style={{ gridTemplateColumns: `repeat(${Math.min(maxCols, row.length)}, minmax(0, 1fr))`, columnGap: '12px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  const keyValue = row[0] || '';
                  onDrillDown?.({ rowKey: keyValue, rowIndex: i }, `${widget.title} / ${keyValue}`);
                }}
                title={`下钻: ${row[0] || ''}`}
              >
                {row.slice(0, maxCols).map((cell, j) => (
                  <span key={j} className={`truncate text-[12px] ${j === 0 ? 'font-semibold text-app-text-secondary' : 'bi-tabular text-right text-app-text-muted'}`}>{cell}</span>
                ))}
              </div>
            ))}
          </div>
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
        <div className="space-y-1.5">
          {visibleStages.map((stage, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md border border-app-border-subtle bg-app-surface-subtle/55 p-2.5 transition-colors hover:border-app-border-hover">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</div>
              <span className="text-[13px] text-app-text-secondary font-medium">{stage}</span>
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
                  <span className={`text-[13px] ${completed ? 'text-app-text-muted line-through opacity-70' : active ? 'text-app-text-secondary font-semibold' : 'text-app-text-muted'}`}>{stepStr.replace('✓', '').replace('→', '').trim()}</span>
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
            <div key={i} className="flex items-start gap-2.5 rounded-md border border-transparent bg-app-surface-subtle/55 p-2.5 transition-colors hover:border-app-border-subtle">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${String(item).includes('严重') || String(item).includes('错误') || String(item).includes('失败') ? 'bg-red-500' : String(item).includes('警告') || String(item).includes('注意') ? 'bg-amber-500' : 'bg-primary/60'}`} />
              <span className="text-[13px] leading-6 text-app-text-secondary">{item}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'report': {
      const reportData = (displayData || {}) as Record<string, unknown>;
      const report = buildReportDisplayData(reportData, 'report');
      const summary = report.summary;
      const highlights = report.highlights;
      const sections = extractReportSections(reportData);
      const metricBadges = extractPreviewMetrics([
        summary,
        ...highlights.map((item) => `${item.label} ${item.value}`),
        ...sections.map((section) => `${section.title} ${section.summary}`),
      ].join(' '));
      const showVisualSummary = metricBadges.length > 0 || sections.length > 0;
      return (
        <div className="flex h-full min-h-0 flex-col gap-2.5">
          {summary && (
            <div className="shrink-0 rounded-md border border-app-border-subtle bg-app-surface-subtle/45 px-3 py-2.5">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-app-text-muted">摘要</div>
              <p className="line-clamp-2 text-[13px] leading-6 text-app-text-secondary">{summary}</p>
            </div>
          )}

          {showVisualSummary && gridSize.w >= 4 && (
            <div className="shrink-0 space-y-2">
              {metricBadges.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {metricBadges.slice(0, 3).map((metric, index) => {
                    const style = getVizStyle(index);
                    return (
                      <div key={`${metric}-${index}`} className={`rounded-md border px-2.5 py-2 ${style.badgeClass}`}>
                        <div className="truncate text-[12px] font-semibold">{metric}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 sidebar-scroll">
            {highlights.length > 0 && highlights.slice(0, gridSize.h <= 3 ? 3 : 5).map((h, i) => {
                  const style = getVizStyle(i);
                  const label = h.label;
                  const value = h.value || '—';
                  return (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-app-border-subtle bg-app-surface/70 px-2.5 py-2">
                      <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${style.badgeClass}`}>
                        <span className="text-[10px] font-bold">{i + 1}</span>
                      </div>
                      <span className="text-[12px] leading-6 text-app-text-secondary">
                        {label}
                        {label ? '：' : ''}
                        {value}
                      </span>
                    </div>
                  );
                })}

            {sections.length > 0 && sections.slice(0, gridSize.h <= 3 ? 4 : 8).map((section, index) => {
              const style = getVizStyle(index);
              return (
                <div key={`${section.title}-${index}`} className="rounded-md border border-app-border-subtle bg-app-surface/70 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dotClass}`} />
                    <span className="truncate text-[12px] font-semibold text-app-text-secondary">{section.title}</span>
                  </div>
                  {section.summary && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-app-text-muted">{section.summary}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 pt-1 text-[11px] text-app-text-muted">
            <FileText className="w-3 h-3" />
            <span>{report.html || report.detailUrl ? '点击查看完整报告' : '点击阅读全文'}</span>
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
                const style = getVizStyle(i);
                return (
                  <div key={i} className={`rounded-lg border px-2.5 py-1.5 ${style.badgeClass}`}>
                    <span className="text-[12px] font-semibold">{m}</span>
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
                  <span key={j} className="truncate flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-app-text-muted">{cell}</span>
                ))}
              </div>
              {tableRows.slice(1, 2).map((row, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                  {row.slice(0, 3).map((cell, j) => (
                    <span key={j} className="truncate flex-1 text-[12px] text-app-text-muted">{cell}</span>
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
                  <span className="truncate text-[12px] text-app-text-muted">{item}</span>
                </div>
              ))}
            </div>
          )}

          {/* 摘要 */}
          {text && (
            <p className={`flex-1 text-[13px] leading-6 text-app-text-secondary ${clampClass}`}>{text}</p>
          )}

          {/* 章节速览 */}
          {gridSize.h > 2 && headings.length > 0 && (
            <div className="space-y-1.5">
              {headings.slice(0, 2).map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-primary/40" />
                  <span className="truncate text-[11px] text-app-text-muted">{h}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-app-text-muted">
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
            <span className="text-[12px] font-semibold text-app-text-muted tabular-nums">{Math.round(pct)}%</span>
          </div>
          <div className={`${barHeight} w-full bg-app-surface-subtle rounded-full overflow-hidden`}>
            <div className={`h-full rounded-full ${barColor} transition-all duration-700 shadow-sm`} style={{ width: `${pct}%` }} />
          </div>
          {gridSize.h > 2 && Boolean(d.caption || d.description) && (
            <span className="text-[12px] leading-relaxed text-app-text-muted">{String(d.caption || d.description || '')}</span>
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
            const label = String(item.label || item.name || item.title || '');
            const value = String(item.value || item.val || item.desc || '—');
            return (
              <div key={i} className={`flex items-center justify-between rounded-md border border-transparent p-2.5 ${cfg.bg} transition-colors hover:border-app-border-subtle`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot} ${st === 'danger' || st === 'critical' || st === 'error' ? 'animate-pulse' : ''}`} />
                  <span className="text-[13px] text-app-text-secondary font-medium">{label}</span>
                </div>
                <span className={`bi-tabular text-[12px] font-semibold ${cfg.text}`}>{value}</span>
              </div>
            );
          })}
        </div>
      );
    }
    case 'adaptive': {
      const d = (displayData || {}) as Record<string, unknown>;
      const headline = extractHeadline(d, widget.title);
      const sections = extractAdaptiveSections(d);
      const showHeadline = !isEmptyValue(headline.eyebrow) || !isEmptyValue(headline.title) || !isEmptyValue(headline.subtitle) || !isEmptyValue(headline.status);
      const tone = toneClasses(headline.tone);

      if (sections.length === 0 && !showHeadline) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }

      return (
        <div className="h-full flex flex-col gap-3">
          {showHeadline && (
            <div className="rounded-2xl border border-app-border-subtle/70 bg-gradient-to-br from-app-surface-subtle/80 via-widget-bg to-widget-bg px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {headline.eyebrow && (
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-app-text-muted">{headline.eyebrow}</div>
                  )}
                  {headline.title && (
                    <div className="mt-1 text-[16px] font-semibold text-app-text-secondary">{headline.title}</div>
                  )}
                  {headline.subtitle && (
                    <p className={`mt-1.5 text-[12px] leading-6 text-app-text-secondary ${gridSize.h <= 2 ? 'line-clamp-2' : 'line-clamp-3'}`}>
                      {headline.subtitle}
                    </p>
                  )}
                </div>
                {headline.status && (
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium ${tone.chip}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    {headline.status}
                  </span>
                )}
              </div>
            </div>
          )}

          {sections.length > 0 && (
            <div className="flex-1 space-y-2.5 overflow-hidden">
              {sections.slice(0, gridSize.h <= 2 ? 1 : gridSize.h <= 3 ? 2 : 3).map((section, index) => renderAdaptiveSection(section, gridSize, index))}
            </div>
          )}
        </div>
      );
    }
    case 'universal': {
      const d = (displayData || {}) as Record<string, unknown>;
      const rawContent = (d.content || d.text || d.markdown || d.body || d.html || d.summary || '') as string;
      const normalized = rawContent ? normalizeUniversalContent(rawContent) : null;
      const metricItems = extractMetricItems(d);
      const sections = extractAdaptiveSections(d);
      const htmlPreview = typeof d.html === 'string' && d.html ? extractHtmlPreview(d.html) : null;
      const showStructuredSections = sections.length > 0 && (Array.isArray(d.sections) || Array.isArray(d.blocks) || Array.isArray(d.cards));

      if (isEmptyValue(rawContent) && metricItems.length === 0 && sections.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }

      if (showStructuredSections) {
        return (
          <div className="h-full flex flex-col gap-2.5">
            {metricItems.length > 0 && (
              <div className={`grid gap-2 ${gridSize.w >= 5 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {metricItems.slice(0, gridSize.w >= 6 ? 4 : 2).map((metric, index) => renderMetricChip(metric, index))}
              </div>
            )}
            <div className="flex-1 space-y-2.5">
              {sections.slice(0, gridSize.h <= 2 ? 1 : 2).map((section, index) => renderAdaptiveSection(section, gridSize, index))}
            </div>
          </div>
        );
      }

      const clampClass = gridSize.h <= 2 ? 'line-clamp-2' : gridSize.h === 3 ? 'line-clamp-3' : 'line-clamp-5';
      return (
        <div className="h-full flex flex-col gap-3 overflow-hidden">
          {metricItems.length > 0 && (
            <div className={`grid gap-2 ${gridSize.w >= 5 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {metricItems.slice(0, gridSize.w >= 6 ? 4 : 2).map((metric, index) => renderMetricChip(metric, index))}
            </div>
          )}

          {htmlPreview && (htmlPreview.metrics.length > 0 || htmlPreview.headings.length > 0 || htmlPreview.listItems.length > 0) && (
            <div className="space-y-2">
              {htmlPreview.metrics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {htmlPreview.metrics.slice(0, gridSize.w <= 3 ? 2 : 4).map((metric, index) => (
                    <span key={`${metric}-${index}`} className="rounded-full border border-primary/15 bg-primary/8 px-2 py-1 text-[11px] font-medium text-primary">
                      {metric}
                    </span>
                  ))}
                </div>
              )}
              {htmlPreview.headings.length > 0 && (
                <div className="text-[13px] font-semibold text-app-text-secondary">{htmlPreview.headings[0]}</div>
              )}
            </div>
          )}

          {normalized && (
            <div className="space-y-2 overflow-hidden">
              {normalized.headings.slice(0, 2).map((heading, index) => (
                <h4 key={`${heading}-${index}`} className={index === 0 ? 'text-[15px] font-semibold text-app-text-secondary' : 'text-[13px] font-semibold text-app-text-muted'}>
                  {heading}
                </h4>
              ))}

              {normalized.paragraphs.length > 0 && (
                <div className={`text-[13px] leading-6 text-app-text-secondary ${clampClass}`}>
                  {normalized.paragraphs.slice(0, 2).map((paragraph, index) => {
                    const bolded = paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    const sanitized = DOMPurify.sanitize(bolded, { ALLOWED_TAGS: ['strong', 'em', 'code', 'br'] });
                    return <p key={`${paragraph}-${index}`} className={index > 0 ? 'mt-1.5' : ''} dangerouslySetInnerHTML={{ __html: sanitized }} />;
                  })}
                </div>
              )}

              {(normalized.bullets.length > 0 || normalized.ordered.length > 0) && (
                <div className="space-y-1.5">
                  {normalized.bullets.slice(0, gridSize.h <= 2 ? 2 : 3).map((item, index) => (
                    <div key={`${item}-${index}`} className="flex items-start gap-2 rounded-xl bg-app-surface-subtle/60 px-2.5 py-2">
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/55" />
                      <span className="text-[12px] leading-6 text-app-text-secondary">{item}</span>
                    </div>
                  ))}
                  {normalized.ordered.slice(0, Math.max(0, (gridSize.h <= 2 ? 2 : 3) - normalized.bullets.length)).map((item, index) => (
                    <div key={`${item}-${index}`} className="flex items-start gap-2 rounded-xl bg-app-surface-subtle/60 px-2.5 py-2">
                      <span className="mt-0.5 text-[11px] font-semibold text-app-text-muted">{index + 1}.</span>
                      <span className="text-[12px] leading-6 text-app-text-secondary">{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!normalized && sections.length > 0 && (
            <div className="space-y-2.5">
              {sections.slice(0, 2).map((section, index) => renderAdaptiveSection(section, gridSize, index))}
            </div>
          )}
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
          className="flex h-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.82),rgba(246,243,241,0.55))] hover:opacity-80 transition-opacity"
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
            <span className="mt-1 text-[11px] text-app-text-muted">{Math.round(pct)}%</span>
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
      const maxStages = gridSize.h <= 2 ? 3 : gridSize.h <= 3 ? 4 : stages.length;
      const visible = stages.slice(0, maxStages);
      return (
        <div className="h-full flex flex-col justify-center space-y-1.5">
          {visible.map((stage, i) => {
            const style = getVizStyle(i);
            const widthPct = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
            const prevValue = i > 0 ? visible[i - 1].value : stage.value;
            const dropRate = i > 0 && prevValue > 0 ? Math.round((1 - stage.value / prevValue) * 100) : undefined;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 flex items-center">
                  <div className="flex h-6 items-center justify-center rounded-md text-[11px] font-semibold text-white shadow-sm" style={{ width: `${Math.max(widthPct, 12)}%`, background: `linear-gradient(90deg, ${style.hex}, rgba(255,255,255,0.28))`, minWidth: '36px', transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }}>
                    {stage.value}
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right">
                  <span className="block truncate text-[12px] font-medium text-app-text-secondary">{stage.name}</span>
                  {stage.rate !== undefined ? (
                    <span className="text-[11px] text-app-text-muted tabular-nums">转化率 {stage.rate}%</span>
                  ) : dropRate !== undefined ? (
                    <span className="text-[11px] text-red-500 tabular-nums">↓ {dropRate}%</span>
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
          <svg viewBox="0 0 100 100" className="h-full w-full" style={{ maxHeight: '140px' }}>
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
            <polygon points={points} fill="rgba(193, 18, 31, 0.12)" stroke="hsl(var(--primary))" strokeWidth="1.5" />
            {/* 数据点 */}
            {values.map((v, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              const vr = (v / 100) * r;
              return <circle key={i} cx={cx + vr * Math.cos(angle)} cy={cy + vr * Math.sin(angle)} r="2" fill="hsl(var(--primary))" />;
            })}
            {/* 标签 */}
            {labels.map((label, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              const lx = cx + (r + 10) * Math.cos(angle);
              const ly = cy + (r + 10) * Math.sin(angle);
              return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="8" className="fill-app-text-muted">{label}</text>;
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
        const rr = Math.round(249 - intensity * 56);
        const gg = Math.round(242 - intensity * 170);
        const bb = Math.round(239 - intensity * 158);
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
                <div key={i} className="px-0.5 text-center text-[10px] font-medium text-app-text-muted" style={{ width: cellW }}>{x}</div>
              ))}
            </div>
            {/* 数据行 */}
            {yLabels.map((y, yi) => (
              <div key={yi} className="flex items-center">
                <div className="w-12 shrink-0 truncate pr-1 text-[10px] font-medium text-app-text-muted">{y}</div>
                {xLabels.map((x, xi) => {
                  const cell = rawRows.find((r) => (r.x || r.column || r.label) === x && (r.y || r.row || '') === y);
                  const v = cell ? Number(cell.value ?? 0) : 0;
                  return (
                    <div key={xi} className="m-0.5 flex items-center justify-center rounded-md text-[10px] font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]" style={{ width: cellW - 4, height: cellH - 4, backgroundColor: cellColor(v), color: (v - minV) / range > 0.46 ? '#fff' : '#334155' }} title={`${x}${y ? ` / ${y}` : ''}: ${v}`}>
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
            <span className="text-[13px] font-medium text-app-text-secondary">{label}</span>
            <span className={`text-[15px] font-bold tabular-nums ${th.text}`}>{value}{target > 0 ? <span className="ml-1 text-[12px] font-normal text-app-text-subtle">/ {target}</span> : ''}</span>
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
                <span className="mt-0.5 text-[9px] font-medium text-red-500">目标</span>
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
            return (
              <div key={i} className={`flex items-start gap-2 rounded-md border px-3 py-2.5 ${cfg.bg} ${cfg.border}`}>
                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <span className={`${density.bodyTextClass} block text-app-text-secondary`}>{alert.message}</span>
                  {alert.time && <span className={`mt-0.5 block ${density.metaTextClass} text-app-text-subtle`}>{alert.time}</span>}
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
            <div key={i} className="flex items-center gap-2.5 rounded-md border border-app-border-subtle bg-app-surface-subtle/55 p-2.5 transition-colors hover:border-app-border-hover">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</div>
              <span className="flex-1 truncate text-[13px] font-medium text-app-text-secondary">{p.name}</span>
              <div className="flex items-center gap-2.5">
                <div className="w-20 h-1.5 bg-app-surface-hover rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-700" style={{ width: `${(p.value / maxV) * 100}%` }} />
                </div>
                <span className="w-9 text-right text-[12px] font-semibold tabular-nums text-app-text-secondary">{p.value}</span>
              </div>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-app-text-muted">
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
                <span className="text-[13px] font-medium text-app-text-secondary">{stage}</span>
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
                <span className="text-[13px] leading-6 text-app-text-secondary">{item}</span>
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
                  <span key={j} className={`text-[12px] ${j === 0 ? 'font-semibold text-app-text-secondary' : 'text-app-text-muted'}`}>{cell}</span>
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
        const barItems = computeDivergingBars(labels, values);
        const hasMixedSigns = values.some((value) => value < 0) && values.some((value) => value > 0);
        return (
          <div className="space-y-2">
            {barItems.map((item, i) => {
              const style = getVizStyle(i);
              const signedTone = getSignedValueSemanticClasses(item.value);
              return (
                <div key={i} className="group flex items-center gap-2.5">
                  <span className={`w-9 shrink-0 text-right ${density.labelTextClass} text-app-text-muted`}>{item.label}</span>
                  <div className="relative h-2.5 flex-1 rounded-full bg-app-surface-subtle">
                    {hasMixedSigns ? (
                      <>
                        <div className="absolute bottom-[-2px] top-[-2px] w-px bg-app-border-hover" style={{ left: `${item.zeroPct}%` }} />
                        {item.negativePct > 0 && (
                          <div className={`absolute top-0 h-full rounded-l-full ${signedTone.bar} transition-all duration-500`} style={{ left: `${item.zeroPct - item.negativePct}%`, width: `${item.negativePct}%` }} />
                        )}
                        {item.positivePct > 0 && (
                          <div className={`absolute top-0 h-full rounded-r-full ${signedTone.bar} transition-all duration-500`} style={{ left: `${item.zeroPct}%`, width: `${item.positivePct}%` }} />
                        )}
                      </>
                    ) : (
                      <div
                        className={`h-full rounded-full ${item.value < 0 ? signedTone.bar : `bg-gradient-to-r ${style.gradientClass}`} transition-all duration-500`}
                        style={{ width: `${Math.max(item.negativePct, item.positivePct, item.value === 0 ? 2 : 0)}%` }}
                      />
                    )}
                  </div>
                  <span className={`w-10 text-right ${density.labelTextClass} font-semibold tabular-nums ${signedTone.text}`}>{item.value}</span>
                </div>
              );
            })}
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
              <div className="mt-2 flex items-center gap-1 text-[12px] text-app-text-muted">
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
                {metrics.slice(0, maxMetrics).map((m, i) => {
                  const style = getVizStyle(i);
                  return (
                    <div key={i} className={`rounded-lg border px-2.5 py-1.5 ${style.badgeClass}`}>
                      <span className="text-[12px] font-semibold">{m}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {text && <p className={`flex-1 text-[13px] leading-6 text-app-text-secondary ${clampClass}`}>{text}</p>}
            {gridSize.h > 2 && headings.length > 0 && (
              <div className="space-y-1">
                {headings.slice(0, 3).map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-primary/40" />
                    <span className="truncate text-[11px] text-app-text-muted">{h}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-app-text-muted">
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
            <p className={`text-[13px] leading-6 text-app-text-secondary ${summaryClampClass}`}>{summary}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-app-text-muted">
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
                  <p className="text-[11px] text-app-text-muted">{key}</p>
                )}
                {val.map((v, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-app-surface-subtle/60 border border-transparent hover:border-app-border-subtle transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-primary/50" />
                    <span className="text-[13px] leading-6 text-app-text-secondary">{v}</span>
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
          <div className="mb-1 text-[13px] font-medium">暂无数据</div>
          <div className="text-[11px] text-app-text-muted">组件类型：{widget.type}</div>
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

function extractPreviewMetrics(text: string): string[] {
  const source = text.replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const metrics: string[] = [];
  const metricPatterns = [
    /[¥$€]\s*\d[\d,]*(?:\.\d+)?\s*(?:万|亿|千|百万|千万|港币|人民币|美元|欧元)?/g,
    /\d[\d,]*(?:\.\d+)?\s*(?:亿港币|亿人民币|亿元|亿|万港币|万元|万|%|pct|pp|倍|人)/g,
    /[+-]\d+(?:\.\d+)?%/g,
  ];
  for (const pattern of metricPatterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const value = match[0].trim();
      if (value && !metrics.includes(value) && metrics.length < 8) {
        metrics.push(value);
      }
    }
  }
  return metrics;
}

function extractReportSections(data: Record<string, unknown>): Array<{ title: string; summary: string }> {
  const rawSections = data.sections || data.chapters || data.blocks;
  if (!Array.isArray(rawSections)) return [];
  return rawSections
    .map((section, index) => {
      if (typeof section === 'string') {
        return { title: `章节 ${index + 1}`, summary: section.trim() };
      }
      const record = toRecord(section);
      if (!record) return null;
      const title = toStringValue(record.title || record.name || record.label || record.heading || record.chapter);
      const summary = toStringValue(record.summary || record.description || record.content || record.text || record.value);
      if (!title && !summary) return null;
      return {
        title: title || `章节 ${index + 1}`,
        summary,
      };
    })
    .filter((section): section is { title: string; summary: string } => section !== null);
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
