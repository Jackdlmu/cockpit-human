// ─── AgentAvatar ───
// 智能体头像：Lucide图标 + 渐变色背景 + 状态指示 + 角色标签

import type { Agent } from '@/types';
import {
  Sparkles, TrendingUp, Users, DollarSign, Truck, Target,
  Monitor, Scale, MessageSquare, Bot,
  type LucideIcon,
} from 'lucide-react';

/** 预设Agent图标映射 */
const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  'cockpit-self': Sparkles,
  'cockpit': Sparkles,
  'sales-agent': TrendingUp,
  'hr-agent': Users,
  'finance-agent': DollarSign,
  'supply-chain-agent': Truck,
  'marketing-agent': Target,
  'it-agent': Monitor,
  'legal-agent': Scale,
  'customer-service-agent': MessageSquare,
};

/** 预设Agent渐变色 */
const AGENT_GRADIENT_MAP: Record<string, string> = {
  'cockpit-self': 'from-violet-500 to-fuchsia-500',
  'cockpit': 'from-violet-500 to-fuchsia-500',
  'sales-agent': 'from-blue-500 to-cyan-500',
  'hr-agent': 'from-emerald-500 to-teal-500',
  'finance-agent': 'from-amber-500 to-orange-500',
  'supply-chain-agent': 'from-orange-500 to-red-500',
  'marketing-agent': 'from-purple-500 to-pink-500',
  'it-agent': 'from-rose-500 to-red-500',
  'legal-agent': 'from-slate-500 to-gray-500',
  'customer-service-agent': 'from-sky-500 to-blue-500',
};

/** 平台色系 */
const PLATFORM_GRADIENTS: Record<string, string> = {
  yonclaw: 'from-indigo-500 to-blue-600',
  openclaw: 'from-emerald-500 to-green-600',
  hermes: 'from-amber-500 to-yellow-600',
  'generic-llm': 'from-violet-500 to-purple-600',
  internal: 'from-rose-500 to-red-500',
};

interface AgentAvatarProps {
  agent: Agent;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showStatus?: boolean;
  showRole?: boolean;
  role?: 'primary' | 'collaborator' | 'observer';
  className?: string;
  onClick?: () => void;
}

export function AgentAvatar({
  agent,
  size = 'md',
  showStatus = true,
  showRole = false,
  role,
  className = '',
  onClick,
}: AgentAvatarProps) {
  const Icon = AGENT_ICON_MAP[agent.id] || AGENT_ICON_MAP[agent.sourceType || ''] || Bot;
  const gradient = AGENT_GRADIENT_MAP[agent.id]
    || PLATFORM_GRADIENTS[agent.sourceType || '']
    || 'from-gray-500 to-slate-500';

  const sizeMap = {
    xs: { container: 'w-5 h-5', icon: 'w-2.5 h-2.5', status: 'w-1.5 h-1.5', text: 'text-[8px]' },
    sm: { container: 'w-6 h-6', icon: 'w-3 h-3', status: 'w-1.5 h-1.5', text: 'text-[9px]' },
    md: { container: 'w-8 h-8', icon: 'w-4 h-4', status: 'w-2 h-2', text: 'text-[10px]' },
    lg: { container: 'w-10 h-10', icon: 'w-5 h-5', status: 'w-2.5 h-2.5', text: 'text-xs' },
  };

  const s = sizeMap[size];

  const statusColor =
    agent.status === 'active'
      ? 'bg-emerald-400'
      : agent.status === 'error'
        ? 'bg-red-400'
        : agent.status === 'idle'
          ? 'bg-amber-400'
          : 'bg-gray-400';

  const roleLabel =
    role === 'primary'
      ? '主'
      : role === 'collaborator'
        ? '协'
        : role === 'observer'
          ? '观察'
          : null;

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <button
        onClick={onClick}
        className={`
          ${s.container} rounded-full flex items-center justify-center
          bg-gradient-to-br ${gradient}
          text-white shadow-sm
          ${onClick ? 'cursor-pointer hover:scale-105 hover:shadow-md transition-all' : ''}
        `}
        title={`${agent.name}${agent.sourceConnectionName ? ` · ${agent.sourceConnectionName}` : ''}`}
      >
        <Icon className={s.icon} />
      </button>

      {/* 状态指示点 */}
      {showStatus && (
        <span
          className={`
            absolute -bottom-0.5 -right-0.5 ${s.status} rounded-full ${statusColor}
            border-2 border-app-bg
          `}
        />
      )}

      {/* 角色标签 */}
      {showRole && roleLabel && (
        <span className={`mt-0.5 ${s.text} text-app-text-subtle font-medium`}>
          {roleLabel}
        </span>
      )}
    </div>
  );
}

/** 平台来源标识 */
export function PlatformBadge({ sourceType }: { sourceType?: string }) {
  const gradient = PLATFORM_GRADIENTS[sourceType || ''] || 'from-gray-500 to-slate-500';
  const label =
    sourceType === 'yonclaw'
      ? 'YonClaw'
      : sourceType === 'openclaw'
        ? 'OpenClaw'
        : sourceType === 'hermes'
          ? 'Hermes'
          : sourceType === 'generic-llm'
            ? 'LLM'
            : sourceType === 'internal'
              ? '内置'
              : sourceType || '未知';

  return (
    <span
      className={`
        inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-white
        bg-gradient-to-r ${gradient}
      `}
    >
      {label}
    </span>
  );
}

/** 调度模式标识 */
export function OrchestrationBadge({
  mode,
  health,
  primaryAgentName,
}: {
  mode: 'platform-led' | 'cockpit-led' | 'llm-direct';
  health: 'healthy' | 'degraded' | 'unavailable';
  primaryAgentName?: string;
}) {
  const modeLabels: Record<string, string> = {
    'platform-led': primaryAgentName ? `${primaryAgentName}` : '',
    'cockpit-led': '',
    'llm-direct': '',
  };

  const healthColors: Record<string, string> = {
    healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    unavailable: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  const healthDots: Record<string, string> = {
    healthy: 'bg-emerald-400',
    degraded: 'bg-amber-400',
    unavailable: 'bg-red-400',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px]
        ${healthColors[health]}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${healthDots[health]}`} />
      {modeLabels[mode] || mode}
    </span>
  );
}
