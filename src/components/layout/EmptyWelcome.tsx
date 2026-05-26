// ─── EmptyWelcome ───
// Tabs 模式下无打开页签时的空状态

import { FolderKanban, Plus } from 'lucide-react';

interface Props {
  onCreate: () => void;
}

export default function EmptyWelcome({ onCreate }: Props) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-app-text-subtle gap-4">
      <div className="w-16 h-16 rounded-2xl bg-app-surface-subtle border border-app-border-subtle flex items-center justify-center">
        <FolderKanban className="w-8 h-8 text-app-text-muted" />
      </div>
      <div className="text-center space-y-1">
        <h3 className="text-sm font-medium text-app-text">还没有打开驾驶舱</h3>
        <p className="text-xs text-app-text-subtle">点击上方 + 号新建，或从列表中选择驾驶舱</p>
      </div>
      <button
        onClick={onCreate}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-400 hover:to-orange-400 transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
        新建驾驶舱
      </button>
    </div>
  );
}
