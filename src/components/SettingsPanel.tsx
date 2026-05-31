// ─── SettingsPanel ───
// 设置面板内容（用于 Sheet 内部）

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConnections } from '@/hooks/useConnections';
import { useEventStream } from '@/hooks/useEventStream';
import { useLayoutSettings } from '@/hooks/useLayoutSettings';
import ConnectionList from './ConnectionList';
import ThemeSettings from './ThemeSettings';
import LayoutSettings from './LayoutSettings';
import { Loader2, Wifi, WifiOff, Radio, Trash2 } from 'lucide-react';

export default function SettingsPanel() {
  const {
    connections,
    adminStatus,
    loading,
    error,
    create,
    update,
    remove,
    test,
    testNew,
    connect,
    disconnect,
  } = useConnections();

  const { mode: layoutMode, setLayoutMode } = useLayoutSettings();

  const {
    events,
    connected: wsConnected,
    clearEvents,
  } = useEventStream();

  return (
    <div className="h-full flex flex-col bg-app-bg">
      {/* 头部 */}
      <div className="bi-toolbar shrink-0 px-5 py-4">
        <h2 className="text-base font-semibold text-app-text">常用配置</h2>
        <p className="mt-1 text-xs text-app-text-muted">管理连接、界面外观与工具调用能力</p>
      </div>

      {/* 内容 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-app-text-subtle animate-spin" />
            <span className="ml-2 text-sm text-app-text-muted">加载中...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-destructive text-sm">{error}</div>
        ) : (
          <Tabs defaultValue="connections" className="w-full">
            <TabsList className="h-10 w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle/70 p-1">
              <TabsTrigger
                value="connections"
                className="flex-1 rounded-md text-xs text-app-text-subtle data-[state=active]:bg-app-surface data-[state=active]:text-app-text-secondary data-[state=active]:shadow-sm"
              >
                连接管理
              </TabsTrigger>
              <TabsTrigger
                value="appearance"
                className="flex-1 rounded-md text-xs text-app-text-subtle data-[state=active]:bg-app-surface data-[state=active]:text-app-text-secondary data-[state=active]:shadow-sm"
              >
                外观
              </TabsTrigger>
              <TabsTrigger
                value="tools"
                className="flex-1 rounded-md text-xs text-app-text-subtle data-[state=active]:bg-app-surface data-[state=active]:text-app-text-secondary data-[state=active]:shadow-sm"
              >
                工具调用
              </TabsTrigger>
            </TabsList>

            <TabsContent value="connections" className="mt-4">
              <ConnectionList
                connections={connections}
                adminStatus={adminStatus}
                onCreate={create}
                onUpdate={update}
                onDelete={remove}
                onTest={test}
                onTestNew={testNew}
                onConnect={connect}
                onDisconnect={disconnect}
              />
            </TabsContent>

            <TabsContent value="appearance" className="mt-4 space-y-8">
              <LayoutSettings mode={layoutMode} onChange={setLayoutMode} />
              <ThemeSettings />
            </TabsContent>

            <TabsContent value="tools" className="mt-4">
              <div className="space-y-5">
                <div className="bi-panel p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-app-text-secondary">
                      工具调用状态
                    </div>
                    <div className="flex items-center gap-2">
                      {wsConnected ? (
                        <>
                          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-xs text-emerald-400">事件通道已连接</span>
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-3.5 h-3.5 text-app-text-subtle" />
                          <span className="text-xs text-app-text-subtle">事件通道未连接</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 rounded-md border border-app-border-subtle bg-app-surface-subtle/60 px-3 py-2.5 text-xs text-app-text-muted">
                    当前已接收 {events.length} 条事件，Meta-Agent 工具接口用于驾驶舱创建、查询、调度与连接测试。
                  </div>
                </div>

                <div className="bi-panel p-4">
                  <div className="text-sm font-medium text-app-text-secondary">
                    当前可用能力
                  </div>
                  <div className="mt-3 space-y-2">
                    {Array.from(
                      new Set(connections.flatMap((c) => c.capabilities))
                    ).map((cap) => {
                      const providers = connections.filter((c) =>
                        c.capabilities.includes(cap) && c.status === 'connected'
                      );
                      return (
                        <div
                          key={cap}
                          className="flex items-center justify-between rounded-md border border-app-border-subtle bg-app-surface-subtle/60 px-3 py-2.5"
                        >
                          <span className="text-xs text-app-text-secondary">{cap}</span>
                          <span className="text-[10px] text-app-text-subtle">
                            {providers.length > 0
                              ? `${providers.map((p) => p.name).join('、')} 提供`
                              : '无可用连接'}
                          </span>
                        </div>
                      );
                    })}
                    {connections.length === 0 && (
                      <div className="text-center py-6 text-app-text-subtle text-xs">
                        先添加连接，才能查看可用能力
                      </div>
                    )}
                  </div>
                </div>

                <div className="bi-panel p-4">
                  <p className="text-sm font-medium text-app-text-secondary">可用工具</p>
                  <div className="mt-3 grid gap-2">
                    {[
                    { name: 'cockpit_plan', desc: '规划驾驶舱' },
                    { name: 'cockpit_create', desc: '创建驾驶舱' },
                    { name: 'cockpit_execute', desc: '执行命令' },
                    { name: 'cockpit_query', desc: '查询数据' },
                    { name: 'cockpit_list', desc: '列出驾驶舱' },
                    { name: 'cockpit_schedule', desc: '调度任务' },
                    { name: 'agent_list', desc: '列出智能体' },
                    { name: 'agent_invoke', desc: '调用智能体' },
                    { name: 'connection_list', desc: '列出连接' },
                    { name: 'connection_test', desc: '测试连接' },
                    ].map((t) => (
                    <div key={t.name} className="flex items-center gap-2 text-[11px]">
                      <code className="rounded border border-app-border-subtle bg-app-surface-subtle px-1.5 py-0.5 text-app-text-muted">{t.name}</code>
                      <span className="text-app-text-subtle">{t.desc}</span>
                    </div>
                    ))}
                  </div>
                </div>

                <div className="bi-panel space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-app-text-secondary">最近事件</p>
                    <button
                      onClick={clearEvents}
                      className="flex items-center gap-1 text-[10px] text-app-text-subtle hover:text-app-text-muted transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      清空
                    </button>
                  </div>
                  <div className="max-h-[220px] space-y-1.5 overflow-y-auto">
                    {events.length === 0 ? (
                      <div className="text-center py-6 text-app-text-subtle text-xs">
                        <Radio className="w-5 h-5 mx-auto mb-2 text-app-text-subtle" />
                        等待事件...
                      </div>
                    ) : (
                      [...events].reverse().slice(0, 8).map((evt) => (
                        <div
                          key={evt.id}
                          className="rounded-md border border-app-border-subtle bg-app-surface-subtle/60 px-3 py-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-app-text-muted font-medium">{evt.type}</span>
                            <span className="text-[9px] text-app-text-subtle">
                              {new Date(evt.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-app-text-subtle">{evt.sourceType}</span>
                            <span className="text-[10px] text-app-text-subtle">·</span>
                            <span className="text-[10px] text-app-text-muted truncate">{evt.source}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
