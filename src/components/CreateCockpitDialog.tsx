import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Rocket, Sparkles } from 'lucide-react';

interface TemplateOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  initPrompt?: string;
  description?: string;
  domain?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onExecute: (command: string) => void;
  onCreateFromTemplate?: (templateId: string, name: string, initPrompt: string) => void;
  templates?: TemplateOption[];
  executing: boolean;
  initialTemplateId?: string | null;
  initialName?: string | null;
  initialCommand?: string | null;
}

function getTemplateInitCommand(template: TemplateOption) {
  return template.initPrompt?.trim() || `基于「${template.name}」模板创建驾驶舱。`;
}

function buildGeneratedName(command: string, template?: TemplateOption | null) {
  if (template?.name?.trim()) {
    return template.name.trim();
  }

  const normalized = command
    .replace(/\s+/g, ' ')
    .replace(/^(帮我|请|用于|为|针对)/, '')
    .replace(/^创建(一个)?/, '')
    .replace(/^驾驶舱/, '')
    .trim();

  const shortened = Array.from(normalized)
    .slice(0, 18)
    .join('')
    .replace(/[，。；：,.!?！？]+$/, '')
    .trim();

  if (shortened) {
    return shortened.includes('驾驶舱') ? shortened : `${shortened}驾驶舱`;
  }

  return template?.name || '新驾驶舱';
}

export default function CreateCockpitDialog({
  open,
  onClose,
  onExecute,
  onCreateFromTemplate,
  templates,
  executing,
  initialTemplateId,
  initialName,
  initialCommand,
}: Props) {
  const [mode, setMode] = useState<'free' | 'template'>('free');
  const [command, setCommand] = useState('');
  const [name, setName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextTemplateId = initialTemplateId || null;
    setSelectedTemplateId(nextTemplateId);
    setMode(nextTemplateId ? 'template' : 'free');
    setName(initialName || '');
    setCommand(initialCommand || '');
  }, [open, initialTemplateId, initialName, initialCommand]);

  const selectedTemplate = useMemo(
    () => templates?.find((item) => item.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const suggestedName = useMemo(
    () => buildGeneratedName(command, selectedTemplate),
    [command, selectedTemplate]
  );

  useEffect(() => {
    if (mode !== 'template' || !selectedTemplate) return;
    setName((prev) => prev.trim() ? prev : selectedTemplate.name);
    setCommand((prev) => prev.trim() ? prev : getTemplateInitCommand(selectedTemplate));
  }, [mode, selectedTemplate]);

  useEffect(() => {
    if (!open || mode !== 'template' || selectedTemplateId || !templates?.length) return;
    setSelectedTemplateId(initialTemplateId || templates[0].id);
  }, [open, mode, selectedTemplateId, templates, initialTemplateId]);

  const handleSelectTemplate = (template: TemplateOption) => {
    setSelectedTemplateId(template.id);
    setName(template.name);
    setCommand(getTemplateInitCommand(template));
  };

  const handleSubmit = () => {
    if (executing) return;
    const finalName = name.trim() || suggestedName;

    if (mode === 'template' && selectedTemplateId && onCreateFromTemplate) {
      if (!command.trim()) return;
      onCreateFromTemplate(selectedTemplateId, finalName, command.trim());
      return;
    }

    if (!command.trim()) return;
    const enrichedCommand = `创建驾驶舱「${finalName}」：${command.trim()}`;
    onExecute(enrichedCommand);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isSubmitDisabled = executing
    || !command.trim()
    || (mode === 'template' && !selectedTemplateId);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex h-[min(88vh,760px)] flex-col gap-0 overflow-hidden border border-app-border bg-app-surface-elevated p-0 text-app-text sm:!max-w-5xl">
        <DialogHeader className="border-b border-app-border-subtle bg-app-surface-elevated px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-app-text">
            <Sparkles className="h-4 w-4 text-red-500" />
            创建驾驶舱
          </DialogTitle>
          <p className="text-sm text-app-text-muted">
            选择创建方式后填写名称和任务，模板模式可在右侧快速浏览和选择模板。
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
          <div className={`grid gap-0 lg:h-full lg:min-h-0 ${mode === 'template' ? 'lg:grid-cols-[minmax(340px,0.9fr)_minmax(440px,1.1fr)]' : 'grid-cols-1'}`}>
            <div className="px-5 py-4 lg:min-h-0 lg:overflow-y-auto">
              <div className="space-y-4 pb-1">
                <div>
                  <label className="mb-2 block text-xs text-app-text-muted">创建方式</label>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-app-border-subtle bg-app-surface-subtle/30 p-1">
                    <button
                      type="button"
                      onClick={() => setMode('free')}
                      className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                        mode === 'free'
                          ? 'bg-app-surface text-app-text-secondary shadow-sm'
                          : 'text-app-text-muted hover:text-app-text-secondary'
                      }`}
                    >
                      自由创建
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('template');
                        if (!selectedTemplateId && templates?.[0]) {
                          handleSelectTemplate(templates[0]);
                        }
                      }}
                      className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                        mode === 'template'
                          ? 'bg-app-surface text-app-text-secondary shadow-sm'
                          : 'text-app-text-muted hover:text-app-text-secondary'
                      }`}
                    >
                      模板创建
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs text-app-text-muted">驾驶舱名称</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="可留空，系统会根据任务自动生成"
                    className="w-full rounded-2xl border border-app-border-subtle bg-app-surface px-3.5 py-3 text-sm text-app-text-secondary outline-none transition-colors placeholder:text-app-text-subtle focus:border-red-500/25"
                    disabled={executing}
                  />
                  <p className="mt-1.5 text-[11px] text-app-text-subtle">
                    未填写时将自动命名为「{suggestedName}」。
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs text-app-text-muted">任务要求</label>
                  <textarea
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={mode === 'template' ? '补充这个模板实例的目标、企业、区域、数据要求...' : '例如：帮我创建一个北京七日天气驾驶舱，优先获取真实天气数据，展示温度趋势、空气质量、降雨概率和出行建议'}
                    className={`${mode === 'template' ? 'min-h-[150px] lg:min-h-[390px]' : 'min-h-[260px]'} w-full resize-none rounded-3xl border border-app-border-subtle bg-app-surface px-4 py-3.5 text-sm leading-relaxed text-app-text-secondary outline-none transition-colors placeholder:text-app-text-subtle focus:border-red-500/25`}
                    disabled={executing}
                  />
                </div>
              </div>
            </div>

            {mode === 'template' && (
              <div className="border-t border-app-border-subtle bg-app-bg/45 px-5 py-4 lg:min-h-0 lg:border-l lg:border-t-0">
                {templates && templates.length > 0 ? (
                  <div className="flex flex-col rounded-[24px] border border-app-border-subtle bg-app-surface-subtle/35 p-4 lg:h-full lg:min-h-0">
                    <div className="flex shrink-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-app-text-secondary">选择模板</div>
                        <div className="mt-1 text-[12px] leading-5 text-app-text-subtle">
                          选中后会自动补齐模板名称和初始化要求，可继续按你的目标修改。
                        </div>
                      </div>
                      {selectedTemplate && (
                        <span className="rounded-full border border-app-border-subtle bg-app-surface px-2.5 py-1 text-[10px] text-app-text-subtle">
                          {selectedTemplate.domain || '模板场景'}
                        </span>
                      )}
                    </div>

                    {selectedTemplate && (
                      <div className="mt-3 shrink-0 rounded-2xl border border-red-500/15 bg-red-500/6 px-3.5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedTemplate.color }} />
                          <div className="truncate text-sm font-semibold text-app-text-secondary">{selectedTemplate.name}</div>
                        </div>
                        {selectedTemplate.description && (
                          <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-app-text-muted">
                            {selectedTemplate.description}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 grid auto-rows-min gap-3 pr-1 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto xl:grid-cols-2">
                      {templates.map((template) => {
                        const active = selectedTemplateId === template.id;
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => handleSelectTemplate(template)}
                            className={`min-h-[118px] rounded-2xl border px-3.5 py-3 text-left transition-all ${
                              active
                                ? 'border-red-500/35 bg-red-500/8 shadow-sm'
                                : 'border-app-border-subtle bg-app-surface hover:border-app-border hover:bg-app-surface-subtle'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: template.color }} />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-app-text-secondary">{template.name}</div>
                                <div className="truncate text-[11px] text-app-text-subtle">{template.domain || '模板场景'}</div>
                              </div>
                            </div>
                            {template.description && (
                              <div className="mt-2 line-clamp-3 text-[11px] leading-5 text-app-text-subtle">
                                {template.description}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[24px] border border-app-border-subtle bg-app-surface-subtle/35 p-6 text-sm text-app-text-muted">
                    暂无可用模板
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-app-border-subtle bg-app-surface-elevated px-5 py-4">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={executing}
              className="h-10 rounded-xl px-4 text-xs text-app-text-muted hover:bg-app-surface-hover hover:text-app-text-secondary"
            >
              取消
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              className="h-10 rounded-xl border-0 bg-gradient-to-r from-red-500 to-orange-500 px-4 text-xs text-white hover:from-red-400 hover:to-orange-400"
            >
              {executing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  执行中...
                </>
              ) : mode === 'template' ? (
                <>
                  <Rocket className="mr-1.5 h-3.5 w-3.5" />
                  模板创建
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  自由创建
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
