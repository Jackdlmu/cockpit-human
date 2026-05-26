// ─── CreateCockpitDialog ───
// 新建驾驶舱对话框：输入任务描述 → 执行 → 创建驾驶舱

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onExecute: (command: string) => void;
  executing: boolean;
}

export default function CreateCockpitDialog({ open, onClose, onExecute, executing }: Props) {
  const [command, setCommand] = useState('');

  const handleExecute = () => {
    if (!command.trim() || executing) return;
    onExecute(command.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleExecute();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-app-surface-elevated border border-app-border text-app-text max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-app-text flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-red-400" />
            新建智能驾驶舱
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-app-text-muted mb-1.5 block">
              描述您希望创建的驾驶舱（座舱代理将自动规划并生成）
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例如：帮我创建一个销售分析驾驶舱，展示华东区月度业绩、客户排行和转化漏斗"
              className="w-full h-28 px-3 py-2.5 rounded-lg bg-app-surface border border-app-border-subtle text-sm text-app-text-secondary placeholder:text-app-text-muted outline-none resize-none focus:border-red-500/30 transition-colors"
              disabled={executing}
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-app-text-subtle">
            <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">🤔 意图识别</span>
            <span>→</span>
            <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">📋 任务规划</span>
            <span>→</span>
            <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">⚙️ 执行创建</span>
            <span>→</span>
            <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">📝 结果汇总</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border-subtle">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={executing}
            className="h-9 text-xs text-app-text-muted hover:text-app-text-secondary hover:bg-app-surface-hover"
          >
            取消
          </Button>
          <Button
            onClick={handleExecute}
            disabled={!command.trim() || executing}
            className="h-9 text-xs bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white border-0"
          >
            {executing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                执行中...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                执行
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
