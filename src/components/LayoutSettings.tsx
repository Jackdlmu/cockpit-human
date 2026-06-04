// ─── LayoutSettings ───
// 布局模式选择：cards / sidebar / tabs

import { LayoutGrid, PanelLeft, FolderKanban } from 'lucide-react';
import type { LayoutMode } from '@/hooks/useLayoutSettings';

const layouts: {
  value: LayoutMode;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    value: 'cards',
    label: '卡片流式',
    description: '经典卡片网格，适合浏览和管理',
    icon: LayoutGrid,
  },
  {
    value: 'sidebar',
    label: '左侧菜单',
    description: '侧边栏导航，高效切换驾驶舱',
    icon: PanelLeft,
  },
  {
    value: 'tabs',
    label: '多页签',
    description: '浏览器式页签，多驾驶舱并行',
    icon: FolderKanban,
  },
];

interface Props {
  mode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
}

export default function LayoutSettings({ mode, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-app-text mb-1">导航布局</h3>
        <p className="text-xs text-app-text-muted">
          选择智能驾驶舱的导航方式。更改将立即生效。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {layouts.map((item) => {
          const Icon = item.icon;
          const isActive = mode === item.value;
          return (
            <button
              key={item.value}
              onClick={() => onChange(item.value)}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                ${isActive
                  ? 'border-primary/50 bg-primary/5 text-app-text'
                  : 'border-app-border-subtle bg-app-surface text-app-text-muted hover:border-app-border hover:text-app-text-secondary'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
              <span className="text-[10px] text-center text-app-text-subtle leading-tight">
                {item.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg bg-app-surface-subtle border border-app-border-subtle px-3 py-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-app-text-muted">当前布局</span>
          <span className="text-app-text-secondary font-medium">
            {layouts.find((l) => l.value === mode)?.label || '卡片流式'}
          </span>
        </div>
      </div>
    </div>
  );
}
