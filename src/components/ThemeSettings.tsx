// ─── ThemeSettings ───
// 主题偏好设置：浅色 / 深色 / 跟随系统

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Droplets, Leaf, Sparkles } from 'lucide-react';

const themes = [
  {
    value: 'light' as const,
    label: '浅色',
    description: '明亮的浅色主题',
    icon: Sun,
  },
  {
    value: 'dark' as const,
    label: '深色',
    description: '经典的深色主题',
    icon: Moon,
  },
  {
    value: 'blue' as const,
    label: '蓝色',
    description: '清新的科技蓝主题',
    icon: Droplets,
  },
  {
    value: 'green' as const,
    label: '绿色',
    description: '自然的生态绿主题',
    icon: Leaf,
  },
  {
    value: 'purple' as const,
    label: '紫色',
    description: '前沿的紫韵科技主题',
    icon: Sparkles,
  },
  {
    value: 'system' as const,
    label: '跟随系统',
    description: '自动匹配系统设置',
    icon: Monitor,
  },
];

export default function ThemeSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // 避免 hydration 不匹配：只在客户端挂载后渲染
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-app-text-muted">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-app-text mb-1">外观主题</h3>
        <p className="text-xs text-app-text-muted">
          选择您偏好的界面主题风格。更改将立即生效。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {themes.map((t) => {
          const Icon = t.icon;
          const isActive = theme === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                ${isActive
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-app-border-subtle bg-app-surface text-app-text-muted hover:border-app-border hover:text-app-text-secondary'
                }
              `}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg bg-app-surface-subtle border border-app-border-subtle px-3 py-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-app-text-muted">当前生效主题</span>
          <span className="text-app-text-secondary font-medium">
            {resolvedTheme === 'dark' ? '深色' : resolvedTheme === 'blue' ? '蓝色' : resolvedTheme === 'green' ? '绿色' : resolvedTheme === 'purple' ? '紫色' : '浅色'}
          </span>
        </div>
      </div>
    </div>
  );
}
