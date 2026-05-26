// ─── CreateCockpitDialog ───
// 新建驾驶舱对话框：支持自然语言创建 或 从模板快速创建

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Layers, Rocket } from 'lucide-react';

interface TemplateOption {
  id: string;
  name: string;
  icon: string;
  color: string;
  initPrompt?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onExecute: (command: string) => void;
  onCreateFromTemplate?: (templateId: string, name: string, initPrompt: string) => void;
  templates?: TemplateOption[];
  executing: boolean;
}

export default function CreateCockpitDialog({ open, onClose, onExecute, onCreateFromTemplate, templates, executing }: Props) {
  const [command, setCommand] = useState('');
  const [name, setName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // 当弹窗打开时重置状态
  useEffect(() => {
    if (open) {
      setCommand('');
      setName('');
      setSelectedTemplateId(null);
    }
  }, [open]);

  // 选择模板时自动填充 prompt 和名称
  useEffect(() => {
    if (selectedTemplateId && templates) {
      const t = templates.find((x) => x.id === selectedTemplateId);
      if (t) {
        setName(t.name);
        setCommand(t.initPrompt || `基于「${t.name}」模板创建驾驶舱，请初始化相关数据。`);
      }
    }
  }, [selectedTemplateId, templates]);

  const handleSubmit = () => {
    if (executing) return;
    if (selectedTemplateId && onCreateFromTemplate) {
      if (!name.trim()) return;
      onCreateFromTemplate(selectedTemplateId, name.trim(), command.trim());
    } else {
      if (!command.trim()) return;
      // 如果用户填写了名称，将名称嵌入指令以便后端提取
      const enrichedCommand = name.trim()
        ? `创建驾驶舱「${name.trim()}」：${command.trim()}`
        : command.trim();
      onExecute(enrichedCommand);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isSubmitDisabled = executing || (selectedTemplateId ? !name.trim() : !command.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-app-surface-elevated border border-app-border text-app-text max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-app-text flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-red-400" />
            新建驾驶舱
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 模板快速选择 */}
          {templates && templates.length > 0 && (
            <div>
              <label className="text-xs text-app-text-muted mb-1.5 block">
                选择模板快速创建（可选）
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setSelectedTemplateId(null); setCommand(''); setName(''); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors ${
                    !selectedTemplateId
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-app-surface border-app-border-subtle text-app-text-muted hover:border-app-border'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  自由创建
                </button>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplateId(t.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors ${
                      selectedTemplateId === t.id
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'bg-app-surface border-app-border-subtle text-app-text-muted hover:border-app-border'
                    }`}
                    title={t.initPrompt ? '包含初始化指令' : ''}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 名称输入 */}
          <div>
            <label className="text-xs text-app-text-muted mb-1.5 block">
              驾驶舱名称
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={selectedTemplateId ? '基于模板自动填充' : '例如：华东区销售分析'}
              className="w-full px-3 py-2 rounded-lg bg-app-surface border border-app-border-subtle text-sm text-app-text-secondary placeholder:text-app-text-muted outline-none focus:border-red-500/30 transition-colors"
              disabled={executing}
            />
          </div>

          {/* Prompt 文本域 */}
          <div>
            <label className="text-xs text-app-text-muted mb-1.5 block">
              {selectedTemplateId ? '初始化指令（基于模板自动填充，可修改）' : '描述您希望创建的驾驶舱'}
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedTemplateId ? '模板初始化指令...' : '例如：帮我创建一个销售分析驾驶舱，展示华东区月度业绩、客户排行和转化漏斗'}
              className="w-full h-28 px-3 py-2.5 rounded-lg bg-app-surface border border-app-border-subtle text-sm text-app-text-secondary placeholder:text-app-text-muted outline-none resize-none focus:border-red-500/30 transition-colors"
              disabled={executing}
            />
          </div>

          {!selectedTemplateId && (
            <div className="flex items-center gap-2 text-[11px] text-app-text-subtle">
              <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">🤔 意图识别</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">📋 任务规划</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">⚙️ 执行创建</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">📝 结果汇总</span>
            </div>
          )}

          {selectedTemplateId && (
            <div className="flex items-center gap-2 text-[11px] text-app-text-subtle">
              <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">📋 模板预设</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">⚙️ 一键创建</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-app-surface-hover">🚀 自动初始化</span>
            </div>
          )}
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
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="h-9 text-xs bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white border-0"
          >
            {executing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                执行中...
              </>
            ) : selectedTemplateId ? (
              <>
                <Rocket className="w-3.5 h-3.5 mr-1.5" />
                从模板创建
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
