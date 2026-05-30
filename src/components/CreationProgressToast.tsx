// ─── CreationProgressToast ───
// 右下角进度浮层：统一显示驾驶舱创建过程的实时进度
// 当前无论自由创建还是模板创建，都统一展示为同一条驾驶舱创建链路

import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, CheckCircle, XCircle, Brain, ClipboardList, Cog, FileText, LayoutTemplate, Sparkles } from 'lucide-react';

interface Props {
  visible: boolean;
  stage?: string;
  message: string;
  done?: boolean;
  success?: boolean;
  usedLLM?: boolean;
  progressCurrent?: number;
  progressTotal?: number;
  progressLabel?: string;
  initializationMode?: 'llm' | 'real-data';
  onClose?: () => void;
}

const stageConfig: Record<string, { icon: ReactNode; label: string; color: string }> = {
  thinking: { icon: <Brain className="w-3.5 h-3.5" />, label: '分析意图', color: 'text-amber-400' },
  planning: { icon: <ClipboardList className="w-3.5 h-3.5" />, label: '规划任务', color: 'text-blue-400' },
  executing: { icon: <Cog className="w-3.5 h-3.5 animate-spin" />, label: '执行创建', color: 'text-emerald-400' },
  creating: { icon: <LayoutTemplate className="w-3.5 h-3.5" />, label: '创建驾驶舱', color: 'text-blue-400' },
  initializing: { icon: <Sparkles className="w-3.5 h-3.5 animate-pulse" />, label: '初始化数据', color: 'text-amber-400' },
  summarizing: { icon: <FileText className="w-3.5 h-3.5" />, label: '汇总结果', color: 'text-purple-400' },
  completed: { icon: <CheckCircle className="w-3.5 h-3.5" />, label: '已完成', color: 'text-emerald-400' },
};

export default function CreationProgressToast({
  visible,
  stage,
  message,
  done,
  success,
  progressCurrent,
  progressTotal,
  progressLabel,
  initializationMode = 'llm',
  onClose,
}: Props) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    setShow(visible);
  }, [visible]);

  if (!show) return null;

  const config = stage ? stageConfig[stage] : null;
  const stageOrder = ['thinking', 'planning', 'executing', 'initializing'] as const;
  const normalizedStage = stageOrder.includes((stage || '') as typeof stageOrder[number])
    ? stage as typeof stageOrder[number]
    : 'thinking';

  const title = done
    ? success
      ? '驾驶舱创建完成'
      : '创建失败'
    : initializationMode === 'real-data' && stage === 'initializing'
      ? '正在获取真实数据...'
    : stage === 'initializing'
      ? '正在初始化数据...'
      : '正在创建驾驶舱...';

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
          <span className="text-sm font-medium text-app-text-secondary">{title}</span>
          {done && (
            <button
              onClick={onClose}
              className="ml-auto text-[10px] text-app-text-subtle hover:text-app-text-muted transition-colors"
            >
              关闭
            </button>
          )}
        </div>

        {/* 统一阶段指示器 */}
        {!done && (
          <div className="flex items-center gap-1.5 mb-3">
            {stageOrder.map((s, i) => {
              const isActive = stage === s;
              const isPast = stageOrder.indexOf(normalizedStage) > i;
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

        {/* 进度条 — 初始化阶段 */}
        {!done && stage === 'initializing' && progressTotal && progressTotal > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-app-text-subtle">
                {progressLabel || '正在初始化组件'}
              </span>
              <span className="text-[10px] text-app-text-subtle">
                {progressCurrent ?? 0} / {progressTotal}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-app-surface-hover overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-300"
                style={{
                  width: `${Math.min(100, (((progressCurrent ?? 0) / progressTotal) * 100))}%`,
                }}
              />
            </div>
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
        <div
          className={`text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto ${
            message.includes('❌') || message.includes('失败') || message.includes('错误')
              ? 'text-red-400'
              : success && done
                ? 'text-emerald-400'
                : 'text-app-text-muted'
          }`}
        >
          {message || '准备中...'}
        </div>
      </div>
    </div>
  );
}
