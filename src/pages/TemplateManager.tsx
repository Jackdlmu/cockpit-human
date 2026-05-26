// ─── TemplateManager ───
// 驾驶舱模板管理页面（管理员专用）— 表单化编辑版

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Plus, Trash2, KeyRound, Loader2, X, ChevronDown, ChevronUp,
  Edit3, FileJson, LayoutGrid, Bot, Tag, Type,
} from 'lucide-react';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '@/api/client';
import { toast } from 'sonner';

const WIDGET_TYPES = ['metric', 'chart', 'table', 'kanban', 'timeline', 'list', 'report'];
const ICON_OPTIONS = ['BarChart3', 'PieChart', 'LineChart', 'Table2', 'Kanban', 'Clock', 'List', 'FileText', 'TrendingUp', 'Users', 'DollarSign', 'CheckCircle', 'AlertTriangle', 'Target', 'Layers', 'Monitor', 'Sparkles'];

interface TemplateManagerProps {
  onBack: () => void;
}

export function TemplateManager({ onBack }: TemplateManagerProps) {
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || '');
  const [inputKey, setInputKey] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTemplates();
      setTemplates(data.templates);
    } catch (err: any) {
      toast.error('加载失败', { description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleLogin = () => {
    localStorage.setItem('adminKey', inputKey);
    setAdminKey(inputKey);
    toast.success('管理员密钥已保存');
    refresh();
  };

  const handleCreate = async (data: any) => {
    try {
      const res = await createTemplate(data);
      setTemplates((prev) => [...prev, res.template]);
      setIsCreating(false);
      toast.success('模板已创建');
    } catch (err: any) {
      toast.error('创建失败', { description: err.message });
    }
  };

  const handleUpdate = async (id: string, data: any) => {
    try {
      const res = await updateTemplate(id, data);
      setTemplates((prev) => prev.map((t) => (t.id === id ? res.template : t)));
      setEditing(null);
      toast.success('模板已更新');
    } catch (err: any) {
      toast.error('更新失败', { description: err.message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该模板？')) return;
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success('模板已删除');
    } catch (err: any) {
      toast.error('删除失败', { description: err.message });
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      const res = await updateTemplate(id, { name: newName });
      setTemplates((prev) => prev.map((t) => (t.id === id ? res.template : t)));
      toast.success('名称已修改');
    } catch (err: any) {
      toast.error('修改失败', { description: err.message });
    }
  };

  if (!adminKey) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-app-bg">
        <div className="w-full max-w-sm p-6 rounded-xl bg-app-surface border border-app-border-subtle">
          <h2 className="text-lg font-semibold text-app-text mb-1">模板管理</h2>
          <p className="text-xs text-app-text-subtle mb-4">请输入管理员密钥</p>
          <div className="flex gap-2">
            <input
              type="password"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="Admin Key"
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text placeholder:text-app-text-subtle focus:outline-none focus:border-red-400/50"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button onClick={handleLogin} className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors">
              进入
            </button>
          </div>
          <button onClick={onBack} className="mt-4 text-xs text-app-text-subtle hover:text-app-text-muted flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> 返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-app-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-app-border-subtle">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-app-surface-subtle text-app-text-muted transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-base font-semibold text-app-text">驾驶舱模板管理</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAdminKey(''); localStorage.removeItem('adminKey'); }}
            className="p-2 rounded-lg hover:bg-app-surface-subtle text-app-text-subtle transition-colors"
            title="退出管理"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> 新建模板
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-app-text-muted animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-app-text-subtle">
            <p className="text-sm">暂无自定义模板</p>
            <p className="text-xs mt-1">点击「新建模板」创建第一个模板</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={() => setEditing(t)}
                onDelete={() => handleDelete(t.id)}
                onRename={(name) => handleRename(t.id, name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {(isCreating || editing) && (
        <TemplateEditor
          template={editing}
          onSave={(data) => (editing ? handleUpdate(editing.id, data) : handleCreate(data))}
          onClose={() => { setIsCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

/* ── TemplateCard ── */
function TemplateCard({
  template,
  onEdit,
  onDelete,
  onRename,
}: {
  template: any;
  onEdit: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(template.name);

  const commitRename = () => {
    if (nameInput.trim() && nameInput !== template.name) {
      onRename(nameInput.trim());
    }
    setIsEditingName(false);
  };

  return (
    <div className="rounded-xl bg-app-surface border border-app-border-subtle p-4 hover:border-app-border transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                className="flex-1 px-2 py-1 text-sm rounded bg-app-surface-subtle border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
                autoFocus
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h3
                className="text-sm font-medium text-app-text cursor-pointer hover:text-red-400 transition-colors"
                onClick={() => setIsEditingName(true)}
                title="点击修改名称"
              >
                {template.name}
              </h3>
              <Edit3 className="w-3 h-3 text-app-text-subtle opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => setIsEditingName(true)} />
            </div>
          )}
          <p className="text-xs text-app-text-subtle mt-0.5">ID: {template.id} · 领域: {template.domain}</p>
        </div>
        <div className="flex gap-1 ml-2">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-app-surface-subtle text-app-text-subtle hover:text-app-text-muted transition-colors" title="编辑">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-app-text-subtle hover:text-red-400 transition-colors" title="删除">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded bg-app-surface-subtle text-app-text-muted">{template.widgets?.length || 0} 个组件</span>
        <span className="px-2 py-0.5 rounded bg-app-surface-subtle text-app-text-muted">{template.keywords?.length || 0} 个关键词</span>
        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: template.color }} title={template.color} />
        <span className="text-app-text-subtle text-[10px]">{template.icon}</span>
      </div>
    </div>
  );
}

/* ── TemplateEditor ── */
function TemplateEditor({ template, onSave, onClose }: { template: any | null; onSave: (d: any) => void; onClose: () => void }) {
  const isEdit = !!template;
  const [data, setData] = useState(() => initFormData(template));
  const [showJson, setShowJson] = useState(false);
  const [jsonError, setJsonError] = useState('');

  const updateField = (path: string, value: any) => {
    setData((prev: any) => {
      const next = { ...prev };
      const keys = path.split('.');
      let target: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        target[keys[i]] = { ...target[keys[i]] };
        target = target[keys[i]];
      }
      target[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleSave = () => {
    if (!data.id.trim() || !data.name.trim()) {
      toast.error('ID 和名称不能为空');
      return;
    }
    if (!Array.isArray(data.widgets) || data.widgets.length === 0) {
      toast.error('至少需要一个组件');
      return;
    }
    onSave(data);
  };

  const addWidget = () => {
    const ts = Date.now();
    const newWidget = {
      id: `w-${ts}`,
      type: 'metric',
      title: '新组件',
      position: { x: 0, y: 0, w: 3, h: 2 },
      data: { value: '—', change: '+0%', trend: 'up' },
    };
    setData((prev: any) => ({ ...prev, widgets: [...prev.widgets, newWidget] }));
  };

  const removeWidget = (idx: number) => {
    setData((prev: any) => ({ ...prev, widgets: prev.widgets.filter((_: any, i: number) => i !== idx) }));
  };

  const updateWidget = (idx: number, patch: any) => {
    setData((prev: any) => {
      const widgets = [...prev.widgets];
      widgets[idx] = { ...widgets[idx], ...patch };
      return { ...prev, widgets };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-overlay/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-app-surface border border-app-border-subtle shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-app-border-subtle">
          <h3 className="text-sm font-semibold text-app-text">{isEdit ? '编辑模板' : '新建模板'}</h3>
          <button onClick={onClose} className="text-app-text-subtle hover:text-app-text-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ── 基础信息 ── */}
          <section>
            <h4 className="text-xs font-medium text-app-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" /> 基础信息
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="模板 ID">
                <input
                  value={data.id}
                  onChange={(e) => updateField('id', e.target.value)}
                  disabled={isEdit}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text disabled:opacity-50 focus:outline-none focus:border-red-400/50"
                  placeholder="如: sales-hr"
                />
              </Field>
              <Field label="显示名称">
                <input
                  value={data.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
                  placeholder="如: 销售人事联合驾驶舱"
                />
              </Field>
              <Field label="领域">
                <input
                  value={data.domain}
                  onChange={(e) => updateField('domain', e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
                  placeholder="如: 销售"
                />
              </Field>
              <Field label="图标">
                <select
                  value={data.icon}
                  onChange={(e) => updateField('icon', e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
                >
                  {ICON_OPTIONS.map((icon) => (
                    <option key={icon} value={icon}>{icon}</option>
                  ))}
                </select>
              </Field>
              <Field label="主题色">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={data.color}
                    onChange={(e) => updateField('color', e.target.value)}
                    className="w-10 h-9 rounded-lg border border-app-border-subtle cursor-pointer"
                  />
                  <input
                    value={data.color}
                    onChange={(e) => updateField('color', e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
                  />
                </div>
              </Field>
              <Field label="描述">
                <input
                  value={data.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
                  placeholder="支持 {{name}} 占位符"
                />
              </Field>
            </div>
          </section>

          {/* ── 关键词 ── */}
          <section>
            <h4 className="text-xs font-medium text-app-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> 触发关键词
            </h4>
            <KeywordsInput
              keywords={data.keywords}
              onChange={(keywords) => updateField('keywords', keywords)}
            />
          </section>

          {/* ── 智能体 ── */}
          <section>
            <h4 className="text-xs font-medium text-app-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" /> 关联智能体
            </h4>
            <AgentInput
              agentIds={data.agentIds}
              primaryAgentId={data.primaryAgentId}
              onAgentIdsChange={(agentIds) => updateField('agentIds', agentIds)}
              onPrimaryChange={(id) => updateField('primaryAgentId', id)}
            />
          </section>

          {/* ── Widget 列表 ── */}
          <section>
            <h4 className="text-xs font-medium text-app-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5" /> 组件配置
            </h4>
            <div className="space-y-2">
              {data.widgets.map((w: any, idx: number) => (
                <WidgetEditorItem
                  key={w.id || idx}
                  widget={w}
                  index={idx}
                  onChange={(patch) => updateWidget(idx, patch)}
                  onRemove={() => removeWidget(idx)}
                />
              ))}
              <button
                onClick={addWidget}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-app-border-subtle text-app-text-subtle hover:text-app-text-muted hover:border-app-border hover:bg-app-surface-subtle transition-colors text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> 添加组件
              </button>
            </div>
          </section>

          {/* ── JSON 高级模式 ── */}
          <section>
            <button
              onClick={() => setShowJson(!showJson)}
              className="flex items-center gap-1.5 text-xs text-app-text-subtle hover:text-app-text-muted transition-colors"
            >
              <FileJson className="w-3.5 h-3.5" />
              {showJson ? '收起 JSON' : '高级：查看/编辑 JSON'}
              {showJson ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showJson && (
              <div className="mt-2">
                <textarea
                  value={JSON.stringify(data, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setData(parsed);
                      setJsonError('');
                    } catch (err: any) {
                      setJsonError(err.message);
                    }
                  }}
                  className="w-full h-48 p-3 text-[11px] font-mono rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text resize-none focus:outline-none focus:border-red-400/50"
                  spellCheck={false}
                />
                {jsonError && <p className="mt-1 text-[10px] text-red-400">{jsonError}</p>}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-app-border-subtle">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-app-text-muted hover:bg-app-surface-subtle transition-colors">取消</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600 transition-colors">保存</button>
        </div>
      </div>
    </div>
  );
}

/* ── 子组件 ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-app-text-subtle mb-1">{label}</label>
      {children}
    </div>
  );
}

function KeywordsInput({ keywords, onChange }: { keywords: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      onChange([...keywords, trimmed]);
      setInput('');
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {keywords.map((k, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-app-surface-subtle text-xs text-app-text-muted border border-app-border-subtle">
            {k}
            <button onClick={() => onChange(keywords.filter((_, idx) => idx !== i))} className="hover:text-red-400"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="输入关键词后回车"
          className="flex-1 px-3 py-2 text-sm rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text placeholder:text-app-text-subtle focus:outline-none focus:border-red-400/50"
        />
        <button onClick={add} className="px-3 py-2 rounded-lg text-sm bg-app-surface-subtle border border-app-border-subtle text-app-text-muted hover:bg-app-surface-hover transition-colors">添加</button>
      </div>
    </div>
  );
}

function AgentInput({ agentIds, primaryAgentId, onAgentIdsChange, onPrimaryChange }: {
  agentIds: string[]; primaryAgentId: string; onAgentIdsChange: (ids: string[]) => void; onPrimaryChange: (id: string) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !agentIds.includes(trimmed)) {
      onAgentIdsChange([...agentIds, trimmed]);
      if (!primaryAgentId) onPrimaryChange(trimmed);
      setInput('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {agentIds.map((id: string) => (
          <button
            key={id}
            onClick={() => onPrimaryChange(id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition-colors ${
              id === primaryAgentId
                ? 'bg-red-500/10 text-red-400 border-red-500/30'
                : 'bg-app-surface-subtle text-app-text-muted border-app-border-subtle hover:border-app-border'
            }`}
            title={id === primaryAgentId ? '主智能体（点击切换）' : '点击设为主智能体'}
          >
            {id === primaryAgentId && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
            {id}
            <span
              onClick={(e) => { e.stopPropagation(); onAgentIdsChange(agentIds.filter((a: string) => a !== id)); if (primaryAgentId === id) onPrimaryChange(agentIds.find((a: string) => a !== id) || ''); }}
              className="ml-0.5 hover:text-red-400"
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="如: sales-agent"
          className="flex-1 px-3 py-2 text-sm rounded-lg bg-app-surface-subtle border border-app-border-subtle text-app-text placeholder:text-app-text-subtle focus:outline-none focus:border-red-400/50"
        />
        <button onClick={add} className="px-3 py-2 rounded-lg text-sm bg-app-surface-subtle border border-app-border-subtle text-app-text-muted hover:bg-app-surface-hover transition-colors">添加</button>
      </div>
      <p className="text-[10px] text-app-text-subtle">带红点的为主智能体，点击智能体标签可切换</p>
    </div>
  );
}

function WidgetEditorItem({ widget, index, onChange, onRemove }: { widget: any; index: number; onChange: (p: any) => void; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-app-border-subtle bg-app-surface-subtle/50">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-app-surface-subtle transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-app-text-subtle w-5">#{index + 1}</span>
          <span className="text-xs font-medium text-app-text">{widget.title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-surface text-app-text-subtle border border-app-border-subtle">{widget.type}</span>
        </div>
        <div className="flex items-center gap-1">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-app-text-subtle" /> : <ChevronDown className="w-3.5 h-3.5 text-app-text-subtle" />}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 rounded hover:bg-red-500/10 text-app-text-subtle hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-app-border-subtle/50">
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div>
              <label className="block text-[10px] text-app-text-subtle mb-1">组件 ID</label>
              <input
                value={widget.id}
                onChange={(e) => onChange({ id: e.target.value })}
                className="w-full px-2 py-1.5 text-xs rounded bg-app-surface border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
              />
            </div>
            <div>
              <label className="block text-[10px] text-app-text-subtle mb-1">标题</label>
              <input
                value={widget.title}
                onChange={(e) => onChange({ title: e.target.value })}
                className="w-full px-2 py-1.5 text-xs rounded bg-app-surface border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
              />
            </div>
            <div>
              <label className="block text-[10px] text-app-text-subtle mb-1">类型</label>
              <select
                value={widget.type}
                onChange={(e) => onChange({ type: e.target.value })}
                className="w-full px-2 py-1.5 text-xs rounded bg-app-surface border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
              >
                {WIDGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-app-text-subtle mb-1">位置 (x,y,w,h)</label>
              <div className="flex gap-1">
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <input
                    key={k}
                    type="number"
                    value={widget.position?.[k] ?? 0}
                    onChange={(e) => onChange({ position: { ...widget.position, [k]: Number(e.target.value) } })}
                    className="w-12 px-1.5 py-1.5 text-xs text-center rounded bg-app-surface border border-app-border-subtle text-app-text focus:outline-none focus:border-red-400/50"
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-app-text-subtle mb-1">数据 (JSON)</label>
            <textarea
              value={JSON.stringify(widget.data || {}, null, 2)}
              onChange={(e) => {
                try { onChange({ data: JSON.parse(e.target.value) }); } catch { /* ignore */ }
              }}
              className="w-full h-20 p-2 text-[10px] font-mono rounded bg-app-surface border border-app-border-subtle text-app-text resize-none focus:outline-none focus:border-red-400/50"
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 初始化 ── */
function initFormData(template: any | null) {
  if (template) return JSON.parse(JSON.stringify(template));
  return {
    id: `custom-${Date.now().toString(36)}`,
    name: '',
    domain: '通用',
    keywords: [],
    icon: 'BarChart3',
    color: '#6366f1',
    agentIds: [],
    primaryAgentId: '',
    description: '由座舱代理自动创建的{{name}}',
    widgets: [
      {
        id: `w-${Date.now()}`,
        type: 'metric',
        title: '核心指标',
        position: { x: 0, y: 0, w: 3, h: 2 },
        data: { value: '—', change: '+0%', trend: 'up' },
      },
    ],
  };
}
