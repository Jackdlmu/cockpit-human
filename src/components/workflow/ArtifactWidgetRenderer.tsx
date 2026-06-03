import { useMemo, useState } from 'react';
import { FileCode2, FileText, BarChart3, ScrollText, Copy, Check, Eye } from 'lucide-react';

interface Artifact {
  id: string;
  name: string;
  type: 'sql' | 'code' | 'report' | 'chart' | 'document';
  content: string;
  language?: string;
}

interface ArtifactData {
  artifacts: Artifact[];
}

const TYPE_CONFIG: Record<Artifact['type'], { icon: typeof FileCode2; label: string; language: string }> = {
  sql: { icon: FileCode2, label: 'SQL', language: 'sql' },
  code: { icon: FileCode2, label: '代码', language: 'typescript' },
  report: { icon: FileText, label: '报告', language: 'markdown' },
  chart: { icon: BarChart3, label: '图表', language: 'json' },
  document: { icon: ScrollText, label: '文档', language: 'text' },
};

export function ArtifactWidgetRenderer({ data }: { data: Record<string, unknown> }) {
  const safeData = useMemo<ArtifactData>(() => {
    const d = data || {};
    const artifacts = Array.isArray(d.artifacts)
      ? d.artifacts.map((a: any, i: number) => ({
          id: a?.id || String(i),
          name: a?.name || a?.title || `产出物 ${i + 1}`,
          type: ['sql', 'code', 'report', 'chart', 'document'].includes(a?.type) ? a.type : 'document',
          content: a?.content || a?.body || '',
          language: a?.language || '',
        }))
      : [];
    return { artifacts };
  }, [data]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const activeArtifact = safeData.artifacts[activeIndex];

  const handleCopy = () => {
    if (!activeArtifact?.content) return;
    navigator.clipboard.writeText(activeArtifact.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (safeData.artifacts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-app-text-subtle">
        <div className="text-center">
          <Eye className="mx-auto mb-2 h-5 w-5" />
          <div className="text-[13px]">产出物将在此预览</div>
          <div className="mt-1 text-[11px] text-app-text-muted">工作流执行完成后生成可交付的 SQL、代码或报告</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="text-[10px] font-semibold text-app-text-subtle/40 uppercase tracking-[0.14em]">ARTIFACT PREVIEW</div>
      {/* 标签页 */}
      {safeData.artifacts.length > 1 && (
        <div className="flex gap-1 overflow-x-auto">
          {safeData.artifacts.map((artifact, index) => {
            const cfg = TYPE_CONFIG[artifact.type];
            const Icon = cfg.icon;
            const isActive = index === activeIndex;
            return (
              <button
                key={artifact.id}
                onClick={() => setActiveIndex(index)}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-primary/20 bg-primary/8 text-primary'
                    : 'border-app-border-subtle bg-app-surface-subtle/50 text-app-text-muted hover:bg-app-surface-hover'
                }`}
              >
                <Icon className="h-3 w-3" />
                {artifact.name}
              </button>
            );
          })}
        </div>
      )}

      {/* 内容区 */}
      {activeArtifact && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-app-border-subtle bg-app-surface/60">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-app-border-subtle/60 px-3 py-2">
            <div className="flex items-center gap-2">
              {(() => {
                const cfg = TYPE_CONFIG[activeArtifact.type];
                const Icon = cfg.icon;
                return <Icon className="h-3.5 w-3.5 text-app-text-subtle" />;
              })()}
              <span className="text-[12px] font-medium text-app-text-secondary">{activeArtifact.name}</span>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-app-text-subtle transition-colors hover:bg-app-surface-hover hover:text-app-text-secondary"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          {/* 代码/文本内容 */}
          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-app-text-secondary">
              {activeArtifact.content || '（内容为空）'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
