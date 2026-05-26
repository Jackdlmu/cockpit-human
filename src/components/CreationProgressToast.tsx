// ─── CreationProgressToast ───
// 右下角进度浮层：显示 CockpitAgent 创建过程中的实时进度

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle, Brain, ClipboardList, Cog, FileText } from 'lucide-react';

interface Props {
  visible: boolean;
  stage?: string;
  message: string;
  done?: boolean;
  success?: boolean;
  usedLLM?: boolean;
  onClose?: () => void;
}

const stageConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  thinking: { icon: <Brain className="w-3.5 h-3.5" />, label: '分析意图', color: 'text-amber-400' },
  planning: { icon: <ClipboardList className="w-3.5 h-3.5" />, label: '规划任务', color: 'text-blue-400' },
  executing: { icon: <Cog className="w-3.5 h-3.5 animate-spin" />, label: '执行创建', color: 'text-emerald-400' },
  summarizing: { icon: <FileText className="w-3.5 h-3.5" />, label: '汇总结果', color: 'text-purple-400' },
};

export default function CreationProgressToast({ visible, stage, message, done, success, usedLLM, onClose }: Props) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    setShow(visible);
  }, [visible]);

  // 弹窗由用户手动关闭，不自动关闭

  if (!show) return null;

  const config = stage ? stageConfig[stage] : null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80">
      <div className="rounded-xl bg-app-surface-elevated border border-app-border shadow-xl shadow-black/40 p-4">
        {/* 头部 */}
        <div className="flex items-center gap-2 mb-3">
          {done ? (
            success ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400" />
            )
          ) : (
            <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
          )}
          <span className="text-sm font-medium text-app-text-secondary">
            {done ? (success ? (usedLLM ? '驾驶舱创建完成' : '使用规则模板创建') : '创建失败') : '正在创建驾驶舱...'}
          </span>
          {done && (
            <button
              onClick={onClose}
              className="ml-auto text-[10px] text-app-text-subtle hover:text-app-text-muted transition-colors"
            >
              关闭
            </button>
          )}
        </div>

        {/* 阶段指示器 */}
        {!done && (
          <div className="flex items-center gap-1.5 mb-3">
            {(['thinking', 'planning', 'executing', 'summarizing'] as const).map((s, i) => {
              const isActive = stage === s;
              const isPast = ['thinking', 'planning', 'executing', 'summarizing'].indexOf(stage || '') > i;
              return (
                <div key={s} className="flex items-center gap-1">
                  <div
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      isActive ? 'bg-red-400' : isPast ? 'bg-app-text-muted' : 'bg-app-border'
                    }`}
                  />
                  <span
                    className={`text-[10px] transition-colors ${
                      isActive ? 'text-app-text-muted' : isPast ? 'text-app-text-subtle' : 'text-app-border'
                    }`}
                  >
                    {stageConfig[s].label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 当前阶段 */}
        {config && !done && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className={config.color}>{config.icon}</span>
            <span className={`text-xs ${config.color}`}>{config.label}</span>
          </div>
        )}

        {/* 消息内容 */}
        <div className={`text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto ${message.includes('❌') || message.includes('失败') ? 'text-red-400' : 'text-app-text-muted'}`}>
          {message || '准备中...'}
        </div>
      </div>
    </div>
  );
}
