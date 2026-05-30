import { FolderKanban, Plus } from 'lucide-react';
import WorkspaceIcon from '@/components/WorkspaceIcon';

interface WorkspaceItem {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
}

interface Props {
  onCreate: () => void;
  workspaces?: WorkspaceItem[];
  onSelectWorkspace?: (id: string) => void;
}

export default function EmptyWelcome({ onCreate, workspaces, onSelectWorkspace }: Props) {
  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(248,245,244,1)_42%,rgba(243,241,239,1))] px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-[28px] border border-app-border-subtle bg-app-surface p-8 shadow-[0_14px_40px_rgba(0,0,0,0.05)]">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.18em] text-app-text-subtle">Enterprise Cockpit</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-app-text">
              欢迎进入企业智能驾驶舱
            </h2>
            <p className="mt-3 text-sm leading-7 text-app-text-muted">
              面向企业级客户的智能驾驶舱入口，支持从业务目标快速创建驾驶舱，并持续完成分析、调整与协作。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={onCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-red-400 hover:to-orange-400"
              >
                <Plus className="h-4 w-4" />
                新建驾驶舱
              </button>
            </div>
          </div>
        </section>

        {workspaces && workspaces.length > 0 && onSelectWorkspace && (
          <section className="rounded-[28px] border border-app-border-subtle bg-app-surface p-5 shadow-[0_14px_40px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-app-text-secondary">已有驾驶舱</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws.id)}
                  className="flex items-start gap-3 rounded-2xl border border-app-border-subtle bg-app-surface-subtle/35 px-4 py-4 text-left transition-colors hover:border-app-border hover:bg-app-surface-subtle"
                >
                  <span
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${ws.color}18` }}
                  >
                    <WorkspaceIcon icon={ws.icon} color={ws.color} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-app-text-secondary">{ws.name}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-app-text-subtle">
                      {ws.description || '进入该驾驶舱继续查看与调整'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
