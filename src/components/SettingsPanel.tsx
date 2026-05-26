// ─── SettingsPanel ───
// 设置面板内容（用于 Sheet 内部）

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConnections } from '@/hooks/useConnections';
import { useEventStream } from '@/hooks/useEventStream';
import ConnectionList from './ConnectionList';
import ThemeSettings from './ThemeSettings';
import { Loader2, Wifi, WifiOff, Radio, Trash2 } from 'lucide-react';

export default function SettingsPanel() {
  const {
    connections,
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

  const {
    events,
    connected: wsConnected,
    clearEvents,
  } = useEventStream();

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="shrink-0 pb-4 border-b border-app-border">
        <h2 className="text-base font-semibold text-app-text">协议适配层设置</h2>
        <p className="text-xs text-app-text-muted mt-1">配置外部平台连接，实现智能驾驶舱的双向通信</p>
      </div>

      {/* 内容 */}
      <div className="flex-1 min-h-0 overflow-y-auto py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-app-text-subtle animate-spin" />
            <span className="ml-2 text-sm text-app-text-muted">加载中...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-destructive text-sm">{error}</div>
        ) : (
          <Tabs defaultValue="connections" className="w-full">
            <TabsList className="w-full bg-app-surface border border-app-border-subtle h-9">
              <TabsTrigger
                value="connections"
                className="flex-1 text-xs data-[state=active]:bg-app-surface-hover data-[state=active]:text-app-text-secondary text-app-text-subtle"
              >
                连接管理
              </TabsTrigger>
              <TabsTrigger
                value="capabilities"
                className="flex-1 text-xs data-[state=active]:bg-app-surface-hover data-[state=active]:text-app-text-secondary text-app-text-subtle"
              >
                能力配置
              </TabsTrigger>
              <TabsTrigger
                value="appearance"
                className="flex-1 text-xs data-[state=active]:bg-app-surface-hover data-[state=active]:text-app-text-secondary text-app-text-subtle"
              >
                外观
              </TabsTrigger>
              <TabsTrigger
                value="events"
                className="flex-1 text-xs data-[state=active]:bg-app-surface-hover data-[state=active]:text-app-text-secondary text-app-text-subtle"
              >
                事件流
              </TabsTrigger>
              <TabsTrigger
                value="about"
                className="flex-1 text-xs data-[state=active]:bg-app-surface-hover data-[state=active]:text-app-text-secondary text-app-text-subtle"
              >
                关于
              </TabsTrigger>
            </TabsList>

            <TabsContent value="connections" className="mt-4">
              <ConnectionList
                connections={connections}
                onCreate={create}
                onUpdate={update}
                onDelete={remove}
                onTest={test}
                onTestNew={testNew}
                onConnect={connect}
                onDisconnect={disconnect}
              />
            </TabsContent>

            <TabsContent value="appearance" className="mt-4">
              <ThemeSettings />
            </TabsContent>

            <TabsContent value="capabilities" className="mt-4">
              <div className="space-y-4">
                <div className="text-sm text-app-text-muted">
                  当前可用能力
                </div>
                <div className="space-y-2">
                  {Array.from(
                    new Set(connections.flatMap((c) => c.capabilities))
                  ).map((cap) => {
                    const providers = connections.filter((c) =>
                      c.capabilities.includes(cap) && c.status === 'connected'
                    );
                    return (
                      <div
                        key={cap}
                        className="flex items-center justify-between rounded-lg bg-app-surface-subtle border border-app-border-subtle px-3 py-2.5"
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
            </TabsContent>

            <TabsContent value="events" className="mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {wsConnected ? (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs text-emerald-400">实时连接中</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3.5 h-3.5 text-app-text-subtle" />
                        <span className="text-xs text-app-text-subtle">未连接</span>
                      </>
                    )}
                    <span className="text-[10px] text-app-text-subtle">
                      {events.length} 条事件
                    </span>
                  </div>
                  <button
                    onClick={clearEvents}
                    className="flex items-center gap-1 text-[10px] text-app-text-subtle hover:text-app-text-muted transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    清空
                  </button>
                </div>

                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {events.length === 0 ? (
                    <div className="text-center py-8 text-app-text-subtle text-xs">
                      <Radio className="w-5 h-5 mx-auto mb-2 text-app-text-subtle" />
                      等待事件...
                    </div>
                  ) : (
                    [...events].reverse().map((evt) => (
                      <div
                        key={evt.id}
                        className="rounded-lg bg-app-surface-subtle border border-app-border-subtle px-3 py-2"
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
                        {Object.keys(evt.payload).length > 0 && (
                          <div className="mt-1 text-[10px] text-app-text-subtle truncate">
                            {JSON.stringify(evt.payload).slice(0, 120)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="about" className="mt-4">
              <div className="space-y-4 text-xs text-app-text-muted leading-relaxed">
                <div>
                  <p className="text-app-text-secondary font-medium mb-1">Meta-Agent 能力</p>
                  <p>
                    驾驶舱对外暴露为智能体，可被 OpenClaw / YonClaw 等平台发现、调用和编排。
                    提供 10 个标准工具，支持 Tool Calling 协议。
                  </p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-app-text-muted">可用工具：</p>
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
                      <code className="text-app-text-muted bg-app-surface-subtle px-1.5 py-0.5 rounded">{t.name}</code>
                      <span className="text-app-text-subtle">{t.desc}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-app-border-subtle space-y-2">
                  <p className="text-app-text-muted">API 端点：</p>
                  <code className="block text-[10px] text-app-text-subtle bg-app-surface-subtle px-2 py-1.5 rounded">GET /api/meta-agent</code>
                  <code className="block text-[10px] text-app-text-subtle bg-app-surface-subtle px-2 py-1.5 rounded">GET /api/meta-agent/tools</code>
                  <code className="block text-[10px] text-app-text-subtle bg-app-surface-subtle px-2 py-1.5 rounded">POST /api/meta-agent/invoke</code>
                </div>
                <div className="pt-2 border-t border-app-border-subtle">
                  <p className="text-app-text-muted mb-1">支持的平台：</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-2">
                    <li><span className="text-app-text-secondary">YonClaw</span> — 用友智能体平台</li>
                    <li><span className="text-app-text-secondary">OpenClaw</span> — 开源智能体框架</li>
                    <li><span className="text-app-text-secondary">Hermes</span> — 消息事件总线</li>
                    <li><span className="text-app-text-secondary">通用大模型</span> — OpenAI 兼容 API</li>
                  </ul>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
