// ─── ConnectionForm ───
// 添加/编辑连接表单

import { useState } from 'react';
import type { Connection, CreateConnectionInput, ConnectionType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Props {
  connection?: Connection | null;
  onSubmit: (data: CreateConnectionInput) => void;
  onCancel: () => void;
  onTest?: (data: CreateConnectionInput) => Promise<{ success: boolean; message: string }>;
}

const typeOptions: { value: ConnectionType; label: string }[] = [
  { value: 'generic-llm', label: '通用大模型' },
  { value: 'yonclaw', label: 'YonClaw' },
  { value: 'openclaw', label: 'OpenClaw' },
  { value: 'hermes', label: 'Hermes' },
];

const defaultCapabilityMap: Record<ConnectionType, string[]> = {
  'generic-llm': ['llm-chat', 'llm-stream', 'cockpit-plan'],
  yonclaw: ['agent-list', 'agent-invoke', 'agent-stream', 'cockpit-plan', 'cockpit-create', 'cockpit-execute', 'event-subscribe'],
  openclaw: ['agent-list', 'agent-invoke', 'agent-stream', 'llm-chat', 'llm-stream', 'cockpit-plan', 'cockpit-create', 'cockpit-execute', 'event-subscribe'],
  hermes: ['event-subscribe', 'event-publish'],
};

export default function ConnectionForm({ connection, onSubmit, onCancel, onTest }: Props) {
  const [name, setName] = useState(connection?.name || '');
  const [type, setType] = useState<ConnectionType>(connection?.type || 'generic-llm');
  const [endpoint, setEndpoint] = useState(connection?.config.endpoint || '');
  const [apiKey, setApiKey] = useState(connection?.config.apiKey || '');
  const [model, setModel] = useState((connection?.config as any)?.model || '');
  const [topicPrefix, setTopicPrefix] = useState((connection?.config as any)?.topicPrefix || '');
  const [organizationId, setOrganizationId] = useState((connection?.config as any)?.organizationId || '');
  const [priority, setPriority] = useState(connection?.priority ?? 100);
  const [enabled, setEnabled] = useState(connection?.enabled ?? true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const isLLM = type === 'generic-llm';
  const isHermes = type === 'hermes';
  const isYonClaw = type === 'yonclaw';
  // 根据 endpoint 协议前缀自动推断，Hermes 强制 websocket，其他类型根据 URL 推断
  const endpointProtocol = endpoint.trim().toLowerCase();
  const isWsUrl = endpointProtocol.startsWith('wss://') || endpointProtocol.startsWith('ws://');
  const protocol = isHermes ? 'websocket' : (isWsUrl ? 'websocket' : 'http');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !endpoint.trim()) return;

    const config: any = {
      endpoint: endpoint.trim(),
      protocol: isHermes ? 'websocket' : (protocol as any),
      timeout: 30000,
    };
    if (apiKey.trim()) config.apiKey = apiKey.trim();
    if (isLLM && model.trim()) config.model = model.trim();
    if (isHermes && topicPrefix.trim()) config.topicPrefix = topicPrefix.trim();
    if (isYonClaw && organizationId.trim()) config.organizationId = organizationId.trim();

    const data: CreateConnectionInput = {
      name: name.trim(),
      type,
      config,
      capabilities: defaultCapabilityMap[type],
      priority,
      enabled,
    };

    onSubmit(data);
  };

  const handleTest = async () => {
    if (!onTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const config: any = {
        endpoint: endpoint.trim(),
        protocol: isHermes ? 'websocket' : (protocol as any),
        timeout: 30000,
      };
      if (apiKey.trim()) config.apiKey = apiKey.trim();
      if (isLLM && model.trim()) config.model = model.trim();
      if (isHermes && topicPrefix.trim()) config.topicPrefix = topicPrefix.trim();
      if (isYonClaw && organizationId.trim()) config.organizationId = organizationId.trim();

      const result = await onTest({
        name: name.trim() || 'test',
        type,
        config,
        capabilities: defaultCapabilityMap[type],
      });
      setTestResult(result.message);
    } catch (err: any) {
      setTestResult(err.message || '测试失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label className="text-xs text-app-text-muted">连接名称</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：OpenAI GPT-4"
          className="mt-1 h-9 text-xs bg-app-surface border-app-border-subtle text-app-text-secondary placeholder:text-app-text-subtle"
          required
        />
      </div>

      <div>
        <Label className="text-xs text-app-text-muted">平台类型</Label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ConnectionType)}
          className="mt-1 w-full h-9 px-3 rounded-md text-xs bg-app-surface border border-app-border-subtle text-app-text-secondary outline-none focus:ring-1 focus:ring-red-500/30"
        >
          {typeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <Label className="text-xs text-app-text-muted">服务地址</Label>
        <Input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder={isLLM ? 'https://api.openai.com/v1' : 'http://localhost:8080'}
          className="mt-1 h-9 text-xs bg-app-surface border-app-border-subtle text-app-text-secondary placeholder:text-app-text-subtle"
          required
        />
      </div>

      <div>
        <Label className="text-xs text-app-text-muted">API Key（可选）</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="mt-1 h-9 text-xs bg-app-surface border-app-border-subtle text-app-text-secondary placeholder:text-app-text-subtle"
        />
      </div>

      {isLLM && (
        <div>
          <Label className="text-xs text-app-text-muted">模型名称（可选）</Label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
            className="mt-1 h-9 text-xs bg-app-surface border-app-border-subtle text-app-text-secondary placeholder:text-app-text-subtle"
          />
        </div>
      )}

      {isHermes && (
        <div>
          <Label className="text-xs text-app-text-muted">Topic 前缀（可选）</Label>
          <Input
            value={topicPrefix}
            onChange={(e) => setTopicPrefix(e.target.value)}
            placeholder="cockpit.events"
            className="mt-1 h-9 text-xs bg-app-surface border-app-border-subtle text-app-text-secondary placeholder:text-app-text-subtle"
          />
        </div>
      )}

      {isYonClaw && (
        <div>
          <Label className="text-xs text-app-text-muted">组织 ID（可选）</Label>
          <Input
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            placeholder="org-xxx"
            className="mt-1 h-9 text-xs bg-app-surface border-app-border-subtle text-app-text-secondary placeholder:text-app-text-subtle"
          />
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label className="text-xs text-app-text-muted">优先级</Label>
          <Input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="mt-1 h-9 text-xs bg-app-surface border-app-border-subtle text-app-text-secondary"
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <Label className="text-xs text-app-text-muted">启用</Label>
        </div>
      </div>

      {/* 测试结果 */}
      {testResult && (
        <div className={`text-[11px] p-2 rounded-lg ${testResult.includes('失败') || testResult.includes('error') || testResult.includes('invalid') || testResult.includes('unauthorized') || testResult.includes('认证') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
          {testResult}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        {onTest && (
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing || !endpoint.trim()}
            className="flex-1 h-9 text-xs border-app-border-subtle text-app-text-muted hover:bg-app-surface-hover hover:text-app-text-secondary"
          >
            {testing ? '测试中...' : '测试连接'}
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1 h-9 text-xs bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white border-0"
        >
          {connection ? '保存修改' : '创建连接'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="h-9 text-xs text-app-text-subtle hover:text-app-text-muted hover:bg-app-surface-hover"
        >
          取消
        </Button>
      </div>
    </form>
  );
}
