import { useState, useRef, useEffect, useCallback } from 'react';
import type { Widget, Agent } from '@/types';
import { useWorkspaceDetail } from '@/hooks/useApiData';
import { useWidgetData } from '@/hooks/useWidgetData';
import { WidgetDetailDrawer } from './WidgetDetailDrawer';
import { workspaceCommandStream, cockpitAgentChatStream } from '@/api/client';
import {
  Layers, BarChart3, UserPlus, CheckCircle, Monitor, Target,
  ArrowLeft, Play, Square, RefreshCw, Send, Sparkles,
  ChevronDown, ChevronUp, Trash2,
  ArrowRight, TrendingUp, TrendingDown, ArrowLeftIcon, Loader2, Check,
  FileText, AlertCircle, ExternalLink,
  DollarSign, Code2, Users, Truck,
} from 'lucide-react';

interface WorkspaceDetailProps {
  workspaceId: string;
  agents: Agent[];
  onBack: () => void;
  onSelectWorkspace?: (id: string) => void;
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

export function WorkspaceDetail({ workspaceId, agents, onBack, onSelectWorkspace }: WorkspaceDetailProps) {
  const { workspace, loading } = useWorkspaceDetail(workspaceId);
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
      setSelectedAgentId(workspace.primaryAgentId);
    }
  }, [workspace?.primaryAgentId]);

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
        // CockpitAgent 不可用，fallback 到传统模式
        if (err.message?.includes('503') || err.message?.includes('not initialized')) {
          let fallbackFull = '';
          const targetAgentId = selectedAgentId || workspace.primaryAgentId;
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
        } else {
          setIsLoading(false);
          setStreaming('');
          setMessages((prev) => [
            ...prev,
            { role: 'agent', content: `❌ 出错：${err.message}`, timestamp: Date.now() },
          ]);
        }
      }
    );
  }, [input, isLoading, workspace, workspaceId, chatExpanded]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setChatExpanded(false);
    localStorage.removeItem(CHAT_STORAGE_KEY(workspaceId));
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-app-bg">
        <Loader2 className="w-8 h-8 text-red-400 animate-spin" />
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
  const primaryAgent = agents.find((a) => a.id === workspace.primaryAgentId);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-app-bg overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-app-border-subtle flex items-center px-6 shrink-0">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted transition-colors mr-3">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center mr-3" style={{ backgroundColor: `${workspace.color}15` }}>
          <Icon className="w-4 h-4" style={{ color: workspace.color }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-app-text">{workspace.name}</h1>
            <span className="text-[10px] text-app-text-subtle">· 智能驾驶舱</span>
            {workspace.status === 'running' && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400">运行中</span>
              </div>
            )}
            {workspace.status === 'error' && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-[10px] text-red-400">异常</span>
              </div>
            )}
            {/* Agent Mode Tag */}
            {workspace.agentMode && workspace.agentMode !== 'single' && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${
                workspace.agentMode === 'llm-only'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}>
                <span>{agentModeLabel(workspace.agentMode)}</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-app-text-muted">{workspace.description}</p>
        </div>

        {/* Associated Agents */}
        <div className="flex items-center gap-2 mr-4">
          <span className="text-[10px] text-app-text-subtle mr-1">协作智能体</span>
          <div className="flex -space-x-1.5">
            {associatedAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setActiveAgentId(activeAgentId === agent.id ? null : agent.id)}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm transition-all ${
                  activeAgentId === agent.id ? 'border-red-400 z-10' : 'border-app-surface-elevated'
                }`}
                style={{ backgroundColor: agent.status === 'error' ? '#ef444420' : agent.status === 'idle' ? '#f59e0b20' : '#10b98120' }}
                title={`${agent.name}${agent.sourceConnectionName ? ` · ${agent.sourceConnectionName}` : ''}`}
              >
                {agent.avatar}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted transition-colors"><RefreshCw className="w-4 h-4" /></button>
          {workspace.status === 'running' ? (
            <button className="p-2 rounded-lg hover:bg-red-500/10 text-app-text-subtle hover:text-red-400 transition-colors"><Square className="w-4 h-4" /></button>
          ) : (
            <button className="p-2 rounded-lg hover:bg-emerald-500/10 text-app-text-subtle hover:text-emerald-400 transition-colors"><Play className="w-4 h-4" /></button>
          )}
        </div>
      </div>

      {/* Active Agent Detail Banner */}
      {activeAgentId && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-app-surface border border-app-border-subtle shadow-[0_1px_3px_rgba(0,0,0,0.18)] animate-in slide-in-from-top-2">
          {(() => {
            const agent = agents.find((a) => a.id === activeAgentId);
            if (!agent) return null;
            return (
              <div className="flex items-center gap-4">
                <span className="text-2xl">{agent.avatar}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-app-text-secondary">{agent.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${agent.status === 'active' ? 'text-emerald-400 bg-emerald-500/10' : agent.status === 'error' ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                      {agent.status === 'active' ? '运行中' : agent.status === 'error' ? '异常' : '空闲'}
                    </span>
                  </div>
                  <p className="text-xs text-app-text-muted mt-0.5">{agent.description}</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-app-text-subtle">
                  {agent.sourceConnectionName && (
                    <span className="px-1.5 py-0.5 rounded bg-app-surface-subtle text-app-text-muted">
                      {agent.sourceConnectionName}
                    </span>
                  )}
                  <span>{agent.usageCount.toLocaleString()} 次调用</span>
                  <span>|</span>
                  <span>{agent.skills.length} 项技能</span>
                  <span>|</span>
                  <span>最近 {agent.lastUsed}</span>
                </div>
                <button onClick={() => setActiveAgentId(null)} className="p-1 rounded hover:bg-app-surface-hover text-app-text-subtle hover:text-app-text-muted">
                  <ArrowLeftIcon className="w-4 h-4" />
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Dashboard Grid — 稳定占据主体空间 */}
      <div className="flex-1 overflow-y-auto sidebar-scroll p-6">
        <div className="grid grid-cols-12 gap-4 auto-rows-min">
          {workspace.widgets.map((widget) => (
            <WidgetRenderer
              key={widget.id}
              workspaceId={workspace.id}
              widget={widget}
              useDemoDataFallback={workspace.useDemoDataFallback}
              onClick={() => {
                if (widget.link) {
                  const link = widget.link;
                  if (link.type === 'workspace' && link.targetId && onSelectWorkspace) {
                    onSelectWorkspace(link.targetId);
                  } else if (link.type === 'url' && link.url) {
                    window.open(link.url, '_blank');
                  } else if (link.type === 'widget' && link.targetId) {
                    // TODO: 跨 workspace 打开 widget detail，当前仅支持同 workspace
                    setDetailWidget(widget);
                  } else {
                    setDetailWidget(widget);
                  }
                } else {
                  setDetailWidget(widget);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Widget Detail Drawer */}
      <WidgetDetailDrawer
        widget={detailWidget}
        workspaceId={workspaceId}
        onClose={() => setDetailWidget(null)}
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
                  className="p-1 rounded hover:bg-app-surface-hover text-app-text-subtle hover:text-red-400 transition-colors"
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
                  {msg.role === 'agent' && primaryAgent && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center shrink-0 mt-0.5 text-sm">
                      {primaryAgent.avatar}
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
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center shrink-0 mt-0.5 text-sm">
                    {primaryAgent?.avatar}
                  </div>
                  <div className="max-w-[80%] px-4 py-2.5 rounded-xl text-sm leading-relaxed bg-app-surface text-app-text-muted border border-app-border-subtle">
                    {streaming}
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-red-400/60 animate-pulse align-middle" />
                  </div>
                </div>
              )}
              {isLoading && !streaming && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
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
              className="p-1 rounded hover:bg-app-surface-hover text-app-text-subtle hover:text-red-400 transition-colors"
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
              <button
                onClick={() => setAgentPickerOpen(!agentPickerOpen)}
                className="flex items-center gap-1 p-1 rounded-lg hover:bg-app-surface-hover transition-colors"
                title="切换会话智能体"
              >
                {(() => {
                  const agent = agents.find((a) => a.id === (selectedAgentId || workspace.primaryAgentId));
                  return agent ? (
                    <span className="text-lg">{agent.avatar}</span>
                  ) : (
                    <Sparkles className="w-4 h-4 text-app-text-subtle" />
                  );
                })()}
                <ChevronDown className={`w-3 h-3 text-app-text-subtle transition-transform ${agentPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {agentPickerOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl bg-app-surface-elevated border border-app-border shadow-xl shadow-black/40 py-2 z-50">
                  <div className="px-3 py-1.5 text-[10px] text-app-text-subtle uppercase tracking-wider">主智能体</div>
                  {(() => {
                    const agent = agents.find((a) => a.id === workspace.primaryAgentId);
                    if (!agent) return null;
                    const isSelected = (selectedAgentId || workspace.primaryAgentId) === agent.id;
                    return (
                      <button
                        onClick={() => { setSelectedAgentId(agent.id); setAgentPickerOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${isSelected ? 'bg-app-surface-hover' : 'hover:bg-app-surface-hover/60'}`}
                      >
                        <span className="text-base">{agent.avatar}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-app-text-secondary">{agent.name}</div>
                          <div className="text-[10px] text-app-text-muted truncate">{agent.description}</div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                      </button>
                    );
                  })()}

                  <div className="mx-3 my-1.5 border-t border-app-border-subtle" />
                  <div className="px-3 py-1.5 text-[10px] text-app-text-subtle uppercase tracking-wider">协作智能体</div>
                  {associatedAgents
                    .filter((a) => a.id !== workspace.primaryAgentId)
                    .map((agent) => {
                      const isSelected = selectedAgentId === agent.id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => { setSelectedAgentId(agent.id); setAgentPickerOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${isSelected ? 'bg-app-surface-hover' : 'hover:bg-app-surface-hover/60'}`}
                        >
                          <span className="text-base">{agent.avatar}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-app-text-secondary">{agent.name}</div>
                            <div className="text-[10px] text-app-text-muted truncate">{agent.description}</div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                        </button>
                      );
                    })}
                </div>
              )}
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
                return agent ? `与 ${agent.name} 会话，基于「${workspace.name}」上下文...` : '输入指令...';
              })()}
              className="flex-1 bg-transparent text-app-text-secondary text-sm outline-none placeholder:text-app-text-muted"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-400 hover:to-orange-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-app-text-subtle">
              {primaryAgent ? `${primaryAgent.name} · 基于当前驾驶舱上下文` : '自然语言指令'}
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
function WidgetRenderer({ workspaceId, widget, useDemoDataFallback, onClick }: { workspaceId: string; widget: Widget; useDemoDataFallback?: boolean; onClick?: () => void }) {
  const { position } = widget;
  const gridStyle = {
    gridColumn: `span ${position.w}`,
    gridRow: `span ${position.h}`,
  };

  const hasDetail = !!widget.detail || !!(widget.data as any)?.detail || !!(widget.data as any)?.fullContent || widget.type === 'report';
  const hasLink = !!widget.link;
  const isClickable = hasDetail || hasLink;

  return (
    <div
      style={gridStyle}
      className={`rounded-xl bg-app-surface border border-app-border-subtle shadow-[0_1px_3px_rgba(0,0,0,0.18)] hover:border-app-border hover:shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition-all overflow-hidden flex flex-col ${isClickable ? 'cursor-pointer' : ''}`}
      onClick={isClickable ? onClick : undefined}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-app-border-subtle">
        <h4 className="text-xs font-semibold text-app-text-muted">{widget.title}</h4>
        <div className="flex items-center gap-1.5">
          {hasLink && <ExternalLink className="w-3 h-3 text-app-text-subtle" />}
          {hasDetail && <ArrowRight className="w-3 h-3 text-app-text-subtle" />}
        </div>
      </div>
      <div className="flex-1 p-4"><WidgetContent workspaceId={workspaceId} widget={widget} useDemoDataFallback={useDemoDataFallback} /></div>
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
  if (typeof val === 'object') return Object.keys(val).length === 0;
  return false;
}

function EmptyWidgetState({ title, source, error }: { title: string; source?: string; error?: string | null }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-app-text-subtle gap-1">
      <div className="text-xs">{error ? '数据获取失败' : '暂无数据'}</div>
      {source === 'static' && <div className="text-[10px] text-app-text-subtle">演示数据</div>}
      {error && <div className="text-[10px] text-app-text-subtle opacity-60">{error}</div>}
      <div className="text-[10px] text-app-text-subtle opacity-60">{title}</div>
    </div>
  );
}

function WidgetContent({ workspaceId, widget, useDemoDataFallback }: { workspaceId: string; widget: Widget; useDemoDataFallback?: boolean }) {
  const { data: liveData, loading, error } = useWidgetData(workspaceId, widget, useDemoDataFallback);

  // 使用动态数据（如果存在），否则回退到 widget.data
  const displayData = liveData || widget.data || {};
  const dataSource = (displayData as any)?.__source as string | undefined;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-app-border-subtle border-t-app-text-muted rounded-full animate-spin" />
      </div>
    );
  }

  switch (widget.type) {
    case 'metric': {
      const d = (displayData || {}) as Record<string, string>;
      if (isEmptyValue(d.value)) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const isPositive = d.trend === 'up';
      return (
        <div>
          <div className="text-2xl font-bold text-app-text tracking-tight">{d.value}</div>
          {!isEmptyValue(d.change) && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{d.change}</span>
            </div>
          )}
        </div>
      );
    }
    case 'chart': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容 LLM 可能用的别名：labels / categories / names / xAxis
      const labels = ((d.labels || d.categories || d.names || d.xAxis || d.xaxis || d.dimensions || []) as string[]);
      const values = ((d.values || d.data || d.series || d.yValues || d.yaxis || d.numbers || []) as number[]);
      if (labels.length === 0 || values.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const max = Math.max(...values, 1);
      return (
        <div className="space-y-2">
          {labels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-app-text-muted w-8 text-right shrink-0">{label}</span>
              <div className="flex-1 h-5 bg-app-surface-subtle rounded overflow-hidden">
                <div className="h-full rounded bg-gradient-to-r from-indigo-500/60 to-indigo-400/40" style={{ width: `${(values[i] / max) * 100}%` }} />
              </div>
              <span className="text-[10px] text-app-text-muted w-10 text-right">{values[i]}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'table': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容 LLM 可能用的别名：rows / data / records / entries
      const rows = ((d.rows || d.data || d.records || d.entries || []) as string[][]);
      if (rows.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      return (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-app-surface-subtle hover:bg-app-surface-hover transition-colors">
              {row.map((cell, j) => (
                <span key={j} className={`text-xs ${j === 0 ? 'font-medium text-app-text-muted' : 'text-app-text-muted'}`}>{cell}</span>
              ))}
            </div>
          ))}
        </div>
      );
    }
    case 'kanban': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容 LLM 可能用的别名：stages / statuses / columns / phases
      const stages = ((d.stages || d.statuses || d.columns || d.phases || []) as string[]);
      if (stages.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      return (
        <div className="space-y-2">
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-app-surface-subtle border border-app-border-subtle">
              <div className="w-6 h-6 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center text-[10px] font-bold">{i + 1}</div>
              <span className="text-xs text-app-text-muted">{stage}</span>
              {i < stages.length - 1 && <ArrowRight className="w-3 h-3 text-app-text-subtle ml-auto" />}
            </div>
          ))}
        </div>
      );
    }
    case 'timeline': {
      const d = (displayData || {}) as Record<string, unknown>;
      // 兼容 LLM 可能用的别名：steps / milestones / events / nodes
      const steps = ((d.steps || d.milestones || d.events || d.nodes || []) as string[]);
      if (steps.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      return (
        <div className="space-y-0">
          {steps.map((step, i) => {
            const completed = step.includes('✓');
            const active = step.includes('→');
            return (
              <div key={i} className="flex gap-2">
                <div className="flex flex-col items-center">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] ${completed ? 'bg-emerald-500 text-white' : active ? 'bg-red-500 text-white' : 'bg-app-surface-hover text-app-text-subtle'}`}>
                    {completed ? '✓' : i + 1}
                  </div>
                  {i < steps.length - 1 && <div className={`w-0.5 flex-1 my-0.5 ${completed ? 'bg-emerald-500/20' : 'bg-app-surface-subtle'}`} />}
                </div>
                <div className="pb-4">
                  <span className={`text-xs ${completed ? 'text-app-text-muted' : active ? 'text-app-text-secondary font-medium' : 'text-app-text-muted'}`}>{step.replace('✓', '').replace('→', '').trim()}</span>
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
      const items = ((d.items || d.tasks || d.entries || d.todos || d.list || []) as string[]);
      if (items.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      return (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-app-surface-subtle">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${item.includes('严重') ? 'bg-red-400' : 'bg-amber-400'}`} />
              <span className="text-xs text-app-text-muted">{item}</span>
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
      return (
        <div className="space-y-3">
          {summary && (
            <p className="text-xs text-app-text-secondary leading-relaxed line-clamp-4">{summary}</p>
          )}
          {highlights && highlights.length > 0 && (
            <div className="space-y-1.5">
              {highlights.slice(0, 3).map((h, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-red-400/70" />
                  <span className="text-[10px] text-app-text-muted">{h.label || h.name || h.title || h.key || ''}{h.label || h.name || h.title || h.key ? '：' : ''}{h.value || h.val || h.num || '—'}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[10px] text-app-text-subtle">
            <FileText className="w-3 h-3" />
            <span>点击阅读全文</span>
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
      const color = (d.color || 'indigo') as string;
      const colorClass: Record<string, string> = {
        indigo: 'bg-indigo-500',
        emerald: 'bg-emerald-500',
        amber: 'bg-amber-500',
        red: 'bg-red-500',
        blue: 'bg-blue-500',
        purple: 'bg-purple-500',
      };
      const barColor = colorClass[color] || colorClass.indigo;
      return (
        <div className="h-full flex flex-col justify-center gap-3">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-app-text tracking-tight">{label}</span>
            <span className="text-[10px] text-app-text-subtle">{Math.round(pct)}%</span>
          </div>
          <div className="h-2 w-full bg-app-surface-subtle rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          {Boolean(d.caption || d.description) && (
            <span className="text-[10px] text-app-text-subtle">{String(d.caption || d.description || '')}</span>
          )}
        </div>
      );
    }
    case 'status': {
      const d = (displayData || {}) as Record<string, unknown>;
      const items = (d.items || d.statuses || d.list || []) as Array<{
        label?: string; name?: string; title?: string;
        status?: string; state?: string; type?: string;
        value?: string; val?: string; desc?: string;
      }>;
      if (items.length === 0) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      const statusDot: Record<string, string> = {
        green: 'bg-emerald-500',
        ok: 'bg-emerald-500',
        normal: 'bg-emerald-500',
        yellow: 'bg-amber-500',
        warning: 'bg-amber-500',
        orange: 'bg-amber-500',
        red: 'bg-red-500',
        danger: 'bg-red-500',
        error: 'bg-red-500',
        critical: 'bg-red-500',
        gray: 'bg-app-text-subtle',
        grey: 'bg-app-text-subtle',
        unknown: 'bg-app-text-subtle',
        offline: 'bg-app-text-subtle',
      };
      return (
        <div className="space-y-2">
          {items.map((item, i) => {
            const st = (item.status || item.state || item.type || 'unknown') as string;
            const dot = statusDot[st.toLowerCase()] || statusDot.unknown;
            return (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-app-surface-subtle">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className="text-xs text-app-text-muted">{item.label || item.name || item.title || ''}</span>
                </div>
                <span className="text-[10px] font-medium text-app-text-secondary">{item.value || item.val || item.desc || '—'}</span>
              </div>
            );
          })}
        </div>
      );
    }
    case 'universal': {
      const d = (displayData || {}) as Record<string, unknown>;
      const content = (d.content || d.text || d.markdown || d.body || '') as string;
      if (isEmptyValue(content)) {
        return <EmptyWidgetState title={widget.title} source={dataSource} error={error} />;
      }
      // 简单 markdown 渲染：支持标题、列表、粗体
      const lines = content.split('\n');
      return (
        <div className="space-y-2 overflow-auto h-full text-xs text-app-text-secondary leading-relaxed">
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
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-amber-400" />
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
            // 粗体 **text**
            const bolded = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            return <p key={i} className="text-xs text-app-text-secondary" dangerouslySetInnerHTML={{ __html: bolded }} />;
          })}
        </div>
      );
    }
    default: {
      // 智能兜底：根据 data 结构推断最佳渲染方式
      const d = (displayData || {}) as Record<string, unknown>;

      // 1. 有 stages → 按 kanban 渲染
      const stages = (d.stages as string[]) || [];
      if (stages.length > 0) {
        return (
          <div className="space-y-2">
            {stages.map((stage, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-app-surface-subtle border border-app-border-subtle">
                <div className="w-6 h-6 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center text-[10px] font-bold">{i + 1}</div>
                <span className="text-xs text-app-text-muted">{stage}</span>
                {i < stages.length - 1 && <ArrowRight className="w-3 h-3 text-app-text-subtle ml-auto" />}
              </div>
            ))}
          </div>
        );
      }

      // 2. 有 items → 按 list 渲染
      const items = (d.items as string[]) || [];
      if (items.length > 0) {
        return (
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-app-surface-subtle">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-amber-400" />
                <span className="text-xs text-app-text-muted">{item}</span>
              </div>
            ))}
          </div>
        );
      }

      // 3. 有 rows → 按 table 渲染
      const rows = (d.rows as string[][]) || [];
      if (rows.length > 0) {
        return (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-app-surface-subtle hover:bg-app-surface-hover transition-colors">
                {row.map((cell, j) => (
                  <span key={j} className={`text-xs ${j === 0 ? 'font-medium text-app-text-muted' : 'text-app-text-muted'}`}>{cell}</span>
                ))}
              </div>
            ))}
          </div>
        );
      }

      // 4. 有 labels + values → 按 chart 渲染
      const labels = (d.labels as string[]) || [];
      const values = (d.values as number[]) || [];
      if (labels.length > 0 && values.length > 0) {
        const max = Math.max(...values, 1);
        return (
          <div className="space-y-2">
            {labels.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-app-text-muted w-8 text-right shrink-0">{label}</span>
                <div className="flex-1 h-5 bg-app-surface-subtle rounded overflow-hidden">
                  <div className="h-full rounded bg-gradient-to-r from-indigo-500/60 to-indigo-400/40" style={{ width: `${(values[i] / max) * 100}%` }} />
                </div>
                <span className="text-[10px] text-app-text-muted w-10 text-right">{values[i]}</span>
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

      // 6. 有 summary/content → 按 report 渲染
      const summary = (d.summary || d.content || d.description || '') as string;
      if (summary) {
        return (
          <div className="space-y-2">
            <p className="text-xs text-app-text-secondary leading-relaxed line-clamp-4">{summary}</p>
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
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-app-surface-subtle">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-amber-400" />
                    <span className="text-xs text-app-text-muted">{v}</span>
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
