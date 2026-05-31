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
    <div className="bi-page h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="bi-panel p-8">
          <div className="max-w-3xl">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-app-text-muted">Enterprise Cockpit</div>
            <h2 className="mt-3 text-[34px] font-semibold tracking-[-0.03em] text-app-text">
              欢迎进入企业智能驾驶舱
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-app-text-muted">
              围绕业务目标快速生成驾驶舱，打造您专属化的智慧分析与决策平台
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={onCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                新建驾驶舱
              </button>
            </div>
          </div>
        </section>

        {workspaces && workspaces.length > 0 && onSelectWorkspace && (
          <section className="bi-panel p-5">
            <div className="mb-4 flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-primary" />
              <h3 className="text-[17px] font-semibold text-app-text-secondary">已有驾驶舱</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws.id)}
                  className="flex items-start gap-3 rounded-lg border border-app-border-subtle bg-app-surface px-4 py-4 text-left shadow-sm transition-all hover:border-app-border-hover hover:shadow-md"
                >
                  <span
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-app-border-subtle bg-app-surface-subtle"
                    style={{ backgroundColor: `${ws.color}18` }}
                  >
                    <WorkspaceIcon icon={ws.icon} color={ws.color} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-app-text-secondary">{ws.name}</span>
                    <span className="mt-1.5 block text-[12px] leading-5 text-app-text-muted">
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
