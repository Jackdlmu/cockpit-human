import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CockpitTemplate, Widget, WidgetCatalogItem, WidgetType, WidgetLinkConfig, GroupingPolicy } from '@/types';
import WorkspaceIcon from '@/components/WorkspaceIcon';
import {
  Bot,
  Copy,
  Database,
  Edit3,
  Eye,
  FileJson,
  KeyRound,
  LayoutGrid,
  Loader2,
  Plus,
  Rocket,
  Tag,
  Trash2,
  Type,
  Wrench,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  createCockpitFromTemplate,
  createTemplate,
  createWidgetCatalogItem,
  deleteTemplate,
  deleteWidgetCatalogItem,
  getGroupingPolicy,
  getTemplates,
  getWidgetCatalog,
  updateGroupingPolicy,
  updateTemplate,
  updateWidgetCatalogItem,
} from '@/api/client';
import { toast } from 'sonner';
import { TemplatePreviewCanvas, WidgetPreviewCard } from '@/components/WidgetPreviewCanvas';

const WIDGET_TYPES: WidgetType[] = [
  'metric', 'chart', 'table', 'kanban', 'timeline', 'list', 'report',
  'universal', 'adaptive', 'progress', 'status', 'html', 'gauge',
  'funnel', 'radar', 'heatmap', 'bullet', 'alert', 'map', 'business',
];

const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  metric: '指标卡',
  chart: '趋势图表',
  table: '数据表格',
  kanban: '状态看板',
  timeline: '时间线',
  list: '列表',
  report: '报告摘要',
  universal: '通用容器',
  adaptive: '智能自适应容器',
  progress: '进度条',
  status: '状态面板',
  html: 'HTML',
  gauge: '仪表盘',
  funnel: '漏斗图',
  radar: '雷达图',
  heatmap: '热力图',
  bullet: '子弹图',
  alert: '告警列表',
  map: '地图',
  business: '业务组件',
};

const ICON_OPTIONS = [
  'BarChart3', 'PieChart', 'LineChart', 'Table2', 'Kanban', 'Clock', 'List',
  'FileText', 'TrendingUp', 'Users', 'DollarSign', 'CheckCircle', 'AlertTriangle',
  'Target', 'Monitor', 'Sparkles', 'Bot', 'Compass', 'Activity',
  'Gauge', 'Radar', 'Grid3X3', 'Map', 'Filter', 'Code2', 'Bell', 'CalendarDays', 'Lightbulb',
];

const TEMPLATE_EXTENSION_EXAMPLE = `{
  "id": "custom-finance-review",
  "name": "经营复盘模板",
  "description": "面向财务经营复盘的驾驶舱模板",
  "icon": "BarChart3",
  "color": "#dc2626",
  "agentMode": "llm-only",
  "widgets": [
    {
      "id": "revenue-summary",
      "type": "metric",
      "title": "收入达成",
      "position": { "x": 0, "y": 0, "w": 4, "h": 2 },
      "data": {
        "value": "82%",
        "change": "+4.8%",
        "trend": "up",
        "target": "90%",
        "compareLabel": "同比",
        "description": "展示收入目标达成情况和同比变化。"
      },
      "dataIntent": {
        "domain": "finance",
        "metricKey": "revenue_attainment",
        "sourcePreference": "real-time",
        "required": true
      }
    },
    {
      "id": "profit-gap",
      "type": "chart",
      "title": "利润偏差分析",
      "position": { "x": 4, "y": 0, "w": 4, "h": 3 },
      "data": {
        "labels": ["Q1", "Q2", "Q3", "Q4"],
        "values": [-320, 180, -90, 260],
        "unit": "万元",
        "styleConfig": {
          "variant": "bar",
          "baseline": "zero",
          "mode": "diverging",
          "guidance": "含正负偏差时使用零轴双向条形，不要使用 donut。"
        }
      }
    },
    {
      "id": "cashflow-report",
      "type": "html",
      "title": "现金流分析报告",
      "position": { "x": 0, "y": 2, "w": 8, "h": 5 },
      "data": {
        "reportFile": "full-report.html"
      }
    }
  ]
}`;

const WIDGET_EXTENSION_EXAMPLE = `{
  "id": "custom-donut-health",
  "name": "经营健康环形图",
  "type": "chart",
  "category": "图表",
  "icon": "PieChart",
  "color": "#2563eb",
  "description": "用于展示少量分类占比，并在中心显示总量或健康分。",
  "agentDescription": "当数据是 2-5 个分类占比、贡献结构或健康分构成时优先选择。超过 6 个分类请改用条形图或表格。",
  "useCases": ["收入结构", "成本构成", "健康度评分"],
  "tags": ["donut", "ratio", "composition"],
  "schemaHint": {
    "recommendedDataShape": {
      "labels": ["订阅收入", "实施服务", "其他"],
      "values": [62, 28, 10],
      "centerLabel": "总收入",
      "centerValue": "91.82亿"
    },
    "layoutAdvice": "建议 w=5-6, h=4；分类超过 5 个时不要使用环形图。",
    "styleConfig": {
      "variant": "donut",
      "baseline": "zero",
      "donut": { "innerRatio": 0.58, "legendRatio": 0.42 },
      "guidance": "全为非负且表达占比时使用 donut；如 values 出现负数或差额，请改用 bar + mode=diverging。",
      "palette": ["#2563eb", "#06b6d4", "#f59e0b"]
    }
  },
  "template": {
    "type": "chart",
    "title": "经营健康结构",
    "position": { "x": 0, "y": 0, "w": 6, "h": 4 },
    "data": {
      "labels": ["订阅", "服务", "生态"],
      "values": [62, 28, 10]
    }
  }
}`;

type TabKey = 'templates' | 'widgets';
type DeleteTarget =
  | { kind: 'template'; id: string; name: string; builtin: boolean }
  | { kind: 'widget'; id: string; name: string; builtin: boolean }
  | null;

type TemplateFormData = Omit<CockpitTemplate, 'isBuiltin'>;

function cloneForForm<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function TemplateManager() {
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || '');
  const [inputKey, setInputKey] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('templates');

  const [templates, setTemplates] = useState<CockpitTemplate[]>([]);
  const [widgets, setWidgets] = useState<WidgetCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateEditorMode, setTemplateEditorMode] = useState<'create' | 'edit' | 'duplicate'>('create');
  const [editingTemplate, setEditingTemplate] = useState<TemplateFormData | null>(null);

  const [widgetEditorOpen, setWidgetEditorOpen] = useState(false);
  const [widgetEditorMode, setWidgetEditorMode] = useState<'create' | 'edit' | 'duplicate'>('create');
  const [editingWidget, setEditingWidget] = useState<WidgetCatalogItem | null>(null);
  const [widgetPreviewTarget, setWidgetPreviewTarget] = useState<WidgetCatalogItem | null>(null);
  const [templatePreviewTarget, setTemplatePreviewTarget] = useState<CockpitTemplate | null>(null);

  const [createTarget, setCreateTarget] = useState<CockpitTemplate | null>(null);
  const [createName, setCreateName] = useState('');
  const [creatingCockpit, setCreatingCockpit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  // 全局分组策略
  const [groupingPolicy, setGroupingPolicy] = useState<GroupingPolicy>({ enabled: true, strategy: 'auto', mode: 'tabs-flow' });
  const [groupingPolicyLoading, setGroupingPolicyLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [templateData, widgetData, policyData] = await Promise.all([
        getTemplates(),
        getWidgetCatalog(),
        getGroupingPolicy().catch(() => ({ policy: { enabled: true, strategy: 'auto' as const, mode: 'tabs-flow' as const } })),
      ]);
      setTemplates(templateData.templates);
      setWidgets(widgetData.widgets);
      setGroupingPolicy(policyData.policy);
    } catch (err: any) {
      toast.error('加载失败', { description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUpdateGroupingPolicy = useCallback(async (update: Partial<GroupingPolicy>) => {
    setGroupingPolicyLoading(true);
    try {
      const res = await updateGroupingPolicy(update);
      setGroupingPolicy(res.policy);
      toast.success('分组策略已更新');
    } catch (err: any) {
      toast.error('更新失败', { description: err.message });
    } finally {
      setGroupingPolicyLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleLogin = () => {
    localStorage.setItem('adminKey', inputKey);
    setAdminKey(inputKey);
    toast.success('管理员密钥已保存');
    refresh();
  };

  const resetTemplateEditor = () => {
    setTemplateEditorOpen(false);
    setEditingTemplate(null);
    setTemplateEditorMode('create');
  };

  const resetWidgetEditor = () => {
    setWidgetEditorOpen(false);
    setEditingWidget(null);
    setWidgetEditorMode('create');
  };

  const openCreateTemplate = () => {
    setTemplateEditorMode('create');
    setEditingTemplate(null);
    setTemplateEditorOpen(true);
  };

  const openEditTemplate = (template: CockpitTemplate) => {
    setTemplateEditorMode('edit');
    setEditingTemplate(sanitizeTemplateForForm(template));
    setTemplateEditorOpen(true);
  };

  const openDuplicateTemplate = (template: CockpitTemplate) => {
    const copy = sanitizeTemplateForForm(template);
    copy.id = `custom-${Date.now().toString(36)}`;
    setTemplateEditorMode('duplicate');
    setEditingTemplate(copy);
    setTemplateEditorOpen(true);
  };

  const openCreateWidget = () => {
    setWidgetEditorMode('create');
    setEditingWidget(null);
    setWidgetEditorOpen(true);
  };

  const openEditWidget = (widget: WidgetCatalogItem) => {
    setWidgetEditorMode('edit');
    setEditingWidget(widget);
    setWidgetEditorOpen(true);
  };

  const openDuplicateWidget = (widget: WidgetCatalogItem) => {
    const copy = sanitizeWidgetCatalogItemForForm(widget);
    copy.id = `custom-widget-${Date.now().toString(36)}`;
    setWidgetEditorMode('duplicate');
    setEditingWidget(copy);
    setWidgetEditorOpen(true);
  };

  const handleSaveTemplate = async (data: TemplateFormData) => {
    try {
      if (templateEditorMode === 'edit' && editingTemplate?.id) {
        const res = await updateTemplate(editingTemplate.id, data);
        setTemplates((prev) => prev.map((item) => (item.id === editingTemplate.id ? res.template : item)));
        toast.success('模板已更新');
      } else {
        const res = await createTemplate(data);
        setTemplates((prev) => [...prev, res.template]);
        toast.success(templateEditorMode === 'duplicate' ? '模板副本已创建' : '模板已创建');
      }
      resetTemplateEditor();
    } catch (err: any) {
      toast.error('模板保存失败', { description: err.message });
    }
  };

  const handleSaveWidget = async (data: WidgetCatalogItem) => {
    try {
      if (widgetEditorMode === 'edit' && editingWidget?.id) {
        const res = await updateWidgetCatalogItem(editingWidget.id, data);
        setWidgets((prev) => prev.map((item) => (item.id === editingWidget.id ? res.widget : item)));
        toast.success('组件已更新');
      } else {
        const res = await createWidgetCatalogItem(data);
        setWidgets((prev) => [...prev, res.widget]);
        toast.success(widgetEditorMode === 'duplicate' ? '组件副本已创建' : '组件已创建');
      }
      resetWidgetEditor();
    } catch (err: any) {
      toast.error('组件保存失败', { description: err.message });
    }
  };

  const handleRenameTemplate = async (id: string, newName: string) => {
    try {
      const res = await updateTemplate(id, { name: newName });
      setTemplates((prev) => prev.map((item) => (item.id === id ? res.template : item)));
      toast.success('名称已修改');
    } catch (err: any) {
      toast.error('修改失败', { description: err.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'template') {
        await deleteTemplate(deleteTarget.id);
        setTemplates((prev) => prev.filter((item) => item.id !== deleteTarget.id));
        toast.success('模板已删除');
      } else {
        if (deleteTarget.builtin) {
          toast.error('预制组件不可直接删除', { description: '如需调整，请复制为自定义组件后维护。' });
          setDeleteTarget(null);
          return;
        }
        await deleteWidgetCatalogItem(deleteTarget.id);
        setWidgets((prev) => prev.filter((item) => item.id !== deleteTarget.id));

        toast.success('组件已删除');
      }
    } catch (err: any) {
      toast.error('删除失败', { description: err.message });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleCreateCockpit = async () => {
    if (!createTarget) return;
    setCreatingCockpit(true);
    try {
      const res = await createCockpitFromTemplate(createTarget.id, createName.trim() || undefined);
      toast.success(
        res.initializing ? '驾驶舱创建成功，正在初始化数据...' : '驾驶舱创建成功',
        { description: `ID: ${res.workspace.id}` }
      );
      setCreateTarget(null);
      setCreateName('');
    } catch (err: any) {
      toast.error('创建失败', { description: err.message });
    } finally {
      setCreatingCockpit(false);
    }
  };

  const templateStats = useMemo(() => ({
    total: templates.length,
    builtin: templates.filter((item) => item.isBuiltin).length,
    custom: templates.filter((item) => !item.isBuiltin).length,
  }), [templates]);

  const widgetStats = useMemo(() => ({
    total: widgets.length,
    builtin: widgets.filter((item) => item.isBuiltin).length,
    custom: widgets.filter((item) => !item.isBuiltin).length,
  }), [widgets]);

  if (!adminKey) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-app-bg">
        <div className="w-full max-w-sm rounded-xl border border-app-border-subtle bg-app-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,0.18)]">
          <h2 className="mb-1 text-lg font-semibold text-app-text">模板与组件管理</h2>
          <p className="mb-4 text-xs text-app-text-subtle">请输入管理员密钥</p>
          <div className="flex gap-2">
            <input
              type="password"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="Admin Key"
              className="flex-1 rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text placeholder:text-app-text-subtle focus:border-red-400/50 focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button
              onClick={handleLogin}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              进入
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bi-page flex h-screen w-screen flex-col overflow-hidden">
      <div className="bi-toolbar flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-semibold text-app-text">模板与组件管理</h1>
            <p className="text-xs text-app-text-subtle">模板维护、组件定义、智能体说明与扩展开发入口</p>
          </div>
          <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">Admin</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setAdminKey('');
              localStorage.removeItem('adminKey');
            }}
            className="rounded-lg p-2 text-app-text-subtle transition-colors hover:bg-app-surface-subtle"
            title="退出管理"
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <button
            onClick={activeTab === 'templates' ? openCreateTemplate : openCreateWidget}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
          >
            <Plus className="h-3.5 w-3.5" />
            {activeTab === 'templates' ? '新建模板' : '新建组件'}
          </button>
        </div>
      </div>

      <div className="border-b border-app-border-subtle px-6 py-3">
        <div className="inline-flex rounded-lg border border-app-border-subtle bg-app-surface-subtle/70 p-1">
          <button
            onClick={() => setActiveTab('templates')}
            className={`rounded-md px-4 py-2 text-sm transition-colors ${
              activeTab === 'templates'
                ? 'bg-app-surface text-app-text shadow-sm'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            模板管理
          </button>
          <button
            onClick={() => setActiveTab('widgets')}
            className={`rounded-md px-4 py-2 text-sm transition-colors ${
              activeTab === 'widgets'
                ? 'bg-app-surface text-app-text shadow-sm'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            组件管理
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-app-text-muted" />
          </div>
        ) : activeTab === 'templates' ? (
          <TemplatesSection
            templates={templates}
            stats={templateStats}
            groupingPolicy={groupingPolicy}
            groupingPolicyLoading={groupingPolicyLoading}
            onUpdateGroupingPolicy={handleUpdateGroupingPolicy}
            onEdit={openEditTemplate}
            onPreview={setTemplatePreviewTarget}
            onDuplicate={openDuplicateTemplate}
            onDelete={(item) => setDeleteTarget({ kind: 'template', id: item.id, name: item.name, builtin: !!item.isBuiltin })}
            onRename={handleRenameTemplate}
            onCreateCockpit={(item) => {
              setCreateTarget(item);
              setCreateName(item.name);
            }}
          />
        ) : (
          <WidgetsSection
            widgets={widgets}
            stats={widgetStats}
            onPreview={setWidgetPreviewTarget}
            onEdit={openEditWidget}
            onDuplicate={openDuplicateWidget}
            onDelete={(item) => setDeleteTarget({ kind: 'widget', id: item.id, name: item.name, builtin: !!item.isBuiltin })}
          />
        )}
      </div>

      {templateEditorOpen && (
        <TemplateEditor
          mode={templateEditorMode}
          template={editingTemplate}
          widgetCatalog={widgets}
          groupingPolicy={groupingPolicy}
          onSave={handleSaveTemplate}
          onClose={resetTemplateEditor}
        />
      )}

      {widgetEditorOpen && (
        <WidgetCatalogEditor
          mode={widgetEditorMode}
          item={editingWidget}
          manualGroups={groupingPolicy.manualGroups}
          onSave={handleSaveWidget}
          onClose={resetWidgetEditor}
        />
      )}

      {widgetPreviewTarget && (
        <WidgetPreviewModal
          item={widgetPreviewTarget}
          onClose={() => setWidgetPreviewTarget(null)}
          onEdit={() => {
            const target = widgetPreviewTarget;
            setWidgetPreviewTarget(null);
            if (!target) return;
            if (target.isBuiltin) {
              openDuplicateWidget(target);
            } else {
              openEditWidget(target);
            }
          }}
          onShowDetail={() => {
            setWidgetPreviewTarget(null);
          }}
        />
      )}

      {templatePreviewTarget && (
        <TemplatePreviewModal
          template={templatePreviewTarget}
          onClose={() => setTemplatePreviewTarget(null)}
          onEdit={() => {
            setTemplatePreviewTarget(null);
            openEditTemplate(templatePreviewTarget);
          }}
          onCreateCockpit={() => {
            setCreateTarget(templatePreviewTarget);
            setCreateName(templatePreviewTarget.name);
            setTemplatePreviewTarget(null);
          }}
        />
      )}

      {createTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-overlay/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-app-border-subtle bg-app-surface p-5 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold text-app-text">从模板创建驾驶舱</h3>
            <p className="mb-4 text-xs text-app-text-subtle">基于「{createTarget.name}」创建一个新的驾驶舱</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] text-app-text-subtle">驾驶舱名称</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCockpit()}
                  className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                  placeholder={createTarget.name}
                  autoFocus
                />
              </div>
              {createTarget.initPrompt && (
                <div className="rounded-lg border border-app-border-subtle bg-app-surface-subtle p-2.5 text-[11px] text-app-text-subtle">
                  <span className="text-app-text-muted">初始化：</span>创建后将自动执行预设初始化任务
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setCreateTarget(null);
                  setCreateName('');
                }}
                className="rounded-lg px-3 py-1.5 text-xs text-app-text-muted transition-colors hover:bg-app-surface-subtle"
              >
                取消
              </button>
              <button
                onClick={handleCreateCockpit}
                disabled={creatingCockpit}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {creatingCockpit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                创建驾驶舱
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="border-app-border-subtle bg-app-surface text-app-text">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-app-text">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              确认删除{deleteTarget?.kind === 'widget' ? '组件' : '模板'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-app-text-subtle">
              {deleteTarget?.builtin ? (
                <>
                  即将删除系统{deleteTarget.kind === 'widget' ? '组件' : '模板'}「
                  <span className="font-medium text-app-text">{deleteTarget.name}</span>」。
                  <br />
                  {deleteTarget.kind === 'widget'
                    ? '该组件将从组件目录中移除，已写入模板的组件快照不受影响。'
                    : '该模板将从模板库中移除，但已创建的驾驶舱不受影响。'}
                </>
              ) : (
                <>
                  确定删除「<span className="font-medium text-app-text">{deleteTarget?.name}</span>」吗？
                  <br />
                  此操作不可恢复。
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-app-border-subtle bg-app-surface-subtle text-app-text hover:bg-app-surface-hover">
              取消
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 text-white hover:bg-red-600">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplatesSection({
  templates,
  stats,
  groupingPolicy,
  groupingPolicyLoading,
  onUpdateGroupingPolicy,
  onEdit,
  onPreview,
  onDuplicate,
  onDelete,
  onRename,
  onCreateCockpit,
}: {
  templates: CockpitTemplate[];
  stats: { total: number; builtin: number; custom: number };
  groupingPolicy: GroupingPolicy;
  groupingPolicyLoading: boolean;
  onUpdateGroupingPolicy: (update: Partial<GroupingPolicy>) => void;
  onEdit: (template: CockpitTemplate) => void;
  onPreview: (template: CockpitTemplate) => void;
  onDuplicate: (template: CockpitTemplate) => void;
  onDelete: (template: CockpitTemplate) => void;
  onRename: (id: string, name: string) => void;
  onCreateCockpit: (template: CockpitTemplate) => void;
}) {
  if (templates.length === 0) {
    return (
      <EmptyState
        title="暂无模板"
        description="系统模板和自定义模板都会出现在这里。"
        icon={<LayoutGrid className="h-7 w-7 text-app-text-subtle" />}
      />
    );
  }

  return (
    <div className="space-y-5">
      <TemplateExtensionGuide />
      <GroupingPolicyPanel
        policy={groupingPolicy}
        loading={groupingPolicyLoading}
        onUpdate={onUpdateGroupingPolicy}
        templates={templates}
      />
      <SummaryCards
        cards={[
          { label: '模板总数', value: String(stats.total), detail: '系统模板 + 自定义模板' },
          { label: '系统模板', value: String(stats.builtin), detail: '出厂预制能力' },
          { label: '自定义模板', value: String(stats.custom), detail: '管理员维护与扩展' },
        ]}
      />
      <div className="grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onEdit={() => onEdit(template)}
            onPreview={() => onPreview(template)}
            onDelete={() => onDelete(template)}
            onRename={(name) => onRename(template.id, name)}
            onCopy={() => onDuplicate(template)}
            onCreateCockpit={() => onCreateCockpit(template)}
          />
        ))}
      </div>
    </div>
  );
}

function WidgetsSection({
  widgets,
  stats,
  onPreview,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  widgets: WidgetCatalogItem[];
  stats: { total: number; builtin: number; custom: number };
  onPreview: (widget: WidgetCatalogItem) => void;
  onEdit: (widget: WidgetCatalogItem) => void;
  onDuplicate: (widget: WidgetCatalogItem) => void;
  onDelete: (widget: WidgetCatalogItem) => void;
}) {
  const categories = useMemo(() => {
    const unique = Array.from(new Set(widgets.map((item) => item.category || '通用')));
    return ['全部', '业务组件', ...unique.filter((item) => item !== '业务组件')];
  }, [widgets]);
  const [activeCategory, setActiveCategory] = useState('全部');
  const visibleWidgets = useMemo(() => {
    if (activeCategory === '全部') return widgets;
    return widgets.filter((item) => item.category === activeCategory);
  }, [activeCategory, widgets]);

  if (widgets.length === 0) {
    return (
      <EmptyState
        title="暂无组件"
        description="这里会列出当前可供模板复用的全部组件定义。"
        icon={<Wrench className="h-7 w-7 text-app-text-subtle" />}
      />
    );
  }

  return (
    <div className="space-y-5">
      <WidgetExtensionGuide />
      <SummaryCards
        cards={[
          { label: '组件总数', value: String(stats.total), detail: '预制组件 + 自定义组件' },
          { label: '预制组件', value: String(stats.builtin), detail: '推荐给智能体优先选用' },
          { label: '自定义组件', value: String(stats.custom), detail: '便于开发者扩展实现' },
        ]}
      />
      <div className="flex max-w-7xl flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              activeCategory === category
                ? 'border-primary/25 bg-primary/8 text-primary'
                : 'border-app-border-subtle bg-app-surface text-app-text-muted hover:text-app-text-secondary'
            }`}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {visibleWidgets.map((widget) => (
          <WidgetCatalogCard
            key={widget.id}
            item={widget}
            onPreview={() => onPreview(widget)}
            onEdit={() => (widget.isBuiltin ? onDuplicate(widget) : onEdit(widget))}
            onDuplicate={() => onDuplicate(widget)}
            onDelete={() => onDelete(widget)}
          />
        ))}
      </div>
    </div>
  );
}

function GuidePanel({
  title,
  description,
  bullets,
  example,
}: {
  title: string;
  description: string;
  bullets: string[];
  example: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bi-panel max-w-7xl px-5 py-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-app-text">{title}</div>
          <div className="mt-1 text-xs leading-5 text-app-text-muted">{description}</div>
        </div>
        {open ? <ChevronUp className="mt-0.5 h-4 w-4 text-app-text-subtle" /> : <ChevronDown className="mt-0.5 h-4 w-4 text-app-text-subtle" />}
      </button>
      {open && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-app-border-subtle bg-app-surface-subtle/45 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-app-text-subtle">使用说明</div>
            <ul className="mt-3 space-y-2">
              {bullets.map((item) => (
                <li key={item} className="flex gap-2 text-xs leading-5 text-app-text-muted">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 rounded-lg border border-app-border-subtle bg-app-surface-subtle/45 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-app-text-subtle">JSON 示例</div>
            <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl bg-[#111827] p-4 text-[11px] leading-5 text-slate-100">
              <code>{example}</code>
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}

function TemplateExtensionGuide() {
  return (
    <GuidePanel
      title="模板扩展配置与轻开发说明"
      description="管理员可以通过复制系统模板、调整 widgets 数组、配置 dataIntent/dataSource 和默认布局，来控制 YonClaw 或本地智能体生成驾驶舱时的初始结构。"
      bullets={[
        '优先复制系统模板再扩展，避免直接改动预制模板；模板 JSON 可通过高级 JSON 面板整体维护。',
        'widgets.position 使用 12 列网格，x/y/w/h 分别表示列位置、行位置、宽度和高度；报告和复杂图表建议 w>=6、h>=4。',
        'dataIntent 用于告诉智能体业务语义和取数优先级；dataSource 用于绑定明确接口或查询。',
        '指标卡建议提供 value/change/trend/unit/target/compareLabel/description，详情会按 KPI 语义展示，避免把这些字段写进报告正文。',
        '含正负值、差额、盈亏、预算偏差的数据使用 bar + baseline=zero + mode=diverging；只有全为非负且 2-5 个分类占比时才使用 donut。',
        'HTML 报告必须传 data.html、data.detail.content，或 reportFile/reportUrl/htmlUrl；不要只传 detailUrl=true。',
        '动态生成模板时，尽量让核心指标在首屏左上，趋势/占比图在中部，报告类内容放宽区域或下方详情。',
      ]}
      example={TEMPLATE_EXTENSION_EXAMPLE}
    />
  );
}

function WidgetExtensionGuide() {
  return (
    <GuidePanel
      title="组件扩展配置、样式与数据适配说明"
      description="组件目录用于告诉管理员和智能体：什么数据应选择什么组件、推荐尺寸是多少，以及自定义样式如何影响渲染。"
      bullets={[
        'schemaHint.recommendedDataShape 描述输入数据格式，智能体会据此选择和填充组件。',
        'schemaHint.layoutAdvice 描述默认尺寸和排版建议，会影响动态生成时的 w/h 选择。',
        'schemaHint.styleConfig 可作为轻量样式扩展入口，例如环形图内径、图例比例、色板、密度和强调字段。',
        'bar 图如包含负数、差额、盈亏或偏差，必须保留 0 基线并使用双向条形；不要用单向长度条表达正负数据。',
        'metric 组件详情会隐藏内部配置字段，展示中文业务语义；管理员应补充 unit、target、compareLabel 和 description 以增强可读性。',
        '环形图适合 2-5 个分类占比；超过 5 个分类建议条形图或表格，避免图例挤压。',
        '自定义组件建议先复制预制组件，改名称、schemaHint 和 template.data，再用预览验证遮挡、比例和空数据状态。',
      ]}
      example={WIDGET_EXTENSION_EXAMPLE}
    />
  );
}

// ── 分组推断关键词（客户端预览用） ──

const PREVIEW_GROUP_KEYWORDS: Array<{ keywords: string[]; name: string }> = [
  { keywords: ['财务','营收','营业收入','利润','现金流','资产','负债','毛利率','净利润','预算','成本','费用','市值','估值','股票','收入','盈利','亏损','ROI','ROE'], name: '财务指标' },
  { keywords: ['人力','员工','招聘','绩效','薪酬','入职','离职','人才','组织','人均','人力资本','HR','考勤','培训','福利'], name: '人力资源' },
  { keywords: ['销售','客户','订单','转化','渠道','商机','成交','客单价','复购','留存','CRM','线索','漏斗'], name: '销售分析' },
  { keywords: ['运营','生产','交付','质量','OEE','产能','产线','设备','良品率','准时交付','制造','工厂','工单'], name: '运营管理' },
  { keywords: ['市场','品牌','营销','ROI','获客','曝光','点击','投放','推广','线索','广告','活动','Campaign'], name: '市场营销' },
  { keywords: ['战略','目标','里程碑','风险','合规','治理','ESG','董事会','年报','规划','愿景','SWOT'], name: '战略总览' },
  { keywords: ['研发','技术','代码','专利','创新','产品','项目','进度','DORA','bug','缺陷','测试','发布'], name: '研发效能' },
  { keywords: ['供应链','库存','采购','供应商','物流','仓储','交付周期','物料','进销存'], name: '供应链' },
];

function inferPreviewGroup(title: string): string {
  const lower = title.toLowerCase();
  for (const rule of PREVIEW_GROUP_KEYWORDS) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.name;
  }
  return '综合分析';
}

// ── 全局分组策略管理面板 ──

function GroupingPolicyPanel({
  policy,
  loading,
  onUpdate,
  templates,
}: {
  policy: GroupingPolicy;
  loading: boolean;
  onUpdate: (update: Partial<GroupingPolicy>) => void;
  templates: CockpitTemplate[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const manualGroups = policy.manualGroups || [];

  // 基于所有模板 widgets 的自动推断预览
  const autoPreview = useMemo(() => {
    const allWidgets = templates.flatMap((t) => t.widgets || []);
    if (allWidgets.length <= 4) return [];
    const map = new Map<string, string[]>();
    for (const w of allWidgets) {
      const name = w.group?.trim() || inferPreviewGroup(w.title || '');
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(w.title || w.id);
    }
    const big: Array<{ name: string; items: string[] }> = [];
    let small: Array<{ name: string; items: string[] }> = [];
    for (const [name, items] of map) {
      if (items.length >= 2) big.push({ name, items });
      else small.push({ name, items });
    }
    if (small.length > 0) {
      const combined = small.flatMap((s) => s.items);
      if (big.length > 0) {
        big[big.length - 1].items.push(...combined);
      } else {
        big.push({ name: '综合分析', items: combined });
      }
    }
    return big.slice(0, 6);
  }, [templates]);

  // 手动模式预览：基于 manualGroups
  const manualPreview = useMemo(() => {
    if (manualGroups.length === 0) return [];
    const allWidgets = templates.flatMap((t) => t.widgets || []);
    const map = new Map<string, string[]>();
    for (const g of manualGroups) map.set(g, []);
    map.set('综合分析', []);
    for (const w of allWidgets) {
      const gid = w.group?.trim() || '';
      if (gid && map.has(gid)) {
        map.get(gid)!.push(w.title || w.id);
      } else {
        let matched = false;
        const lowerTitle = (w.title || '').toLowerCase();
        for (const mg of manualGroups) {
          if (lowerTitle.includes(mg.toLowerCase())) {
            map.get(mg)!.push(w.title || w.id);
            matched = true;
            break;
          }
        }
        if (!matched) map.get('综合分析')!.push(w.title || w.id);
      }
    }
    const result: Array<{ name: string; items: string[] }> = [];
    for (const g of manualGroups) {
      const items = map.get(g) || [];
      if (items.length > 0) result.push({ name: g, items });
    }
    const fallback = map.get('综合分析') || [];
    if (fallback.length > 0) result.push({ name: '综合分析', items: fallback });
    return result;
  }, [templates, manualGroups]);

  const addManualGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    if (manualGroups.includes(name)) return;
    onUpdate({ manualGroups: [...manualGroups, name] });
    setNewGroupName('');
  };

  const removeManualGroup = (name: string) => {
    onUpdate({ manualGroups: manualGroups.filter((g) => g !== name) });
  };

  return (
    <div className="rounded-xl border border-app-border-subtle bg-app-surface-subtle/30">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-app-text-subtle" />
          <span className="text-sm font-medium text-app-text">全局分组管理</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              policy.enabled
                ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                : 'border border-app-border-subtle bg-app-surface text-app-text-subtle'
            }`}
          >
            {policy.enabled ? '已启用' : '已禁用'}
          </span>
          {policy.enabled && (
            <>
              <span className="rounded-full border border-primary/15 bg-primary/8 px-2 py-0.5 text-[10px] text-primary">
                {policy.strategy === 'auto' ? '自动' : '手动'}
              </span>
              <span className="rounded-full border border-primary/15 bg-primary/8 px-2 py-0.5 text-[10px] text-primary">
                {policy.mode === 'tabs' ? '标签页' : policy.mode === 'flow' ? '流式' : '标签+滚动'}
              </span>
            </>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-app-text-subtle" /> : <ChevronDown className="h-4 w-4 text-app-text-subtle" />}
      </button>

      {expanded && (
        <div className="border-t border-app-border-subtle/50 px-4 pb-4 pt-3 space-y-4">
          {/* 启用开关 */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-app-text">
              <input
                type="checkbox"
                checked={policy.enabled}
                disabled={loading}
                onChange={(e) => onUpdate({ enabled: e.target.checked })}
                className="h-4 w-4"
              />
              启用组件分组
              <span className="text-[10px] text-app-text-subtle">（组件数 &gt; 4 时生效）</span>
            </label>

            {policy.enabled && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-app-text-subtle">分组样式：</span>
                {(['tabs', 'flow', 'tabs-flow'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={loading}
                    onClick={() => onUpdate({ mode })}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      policy.mode === mode
                        ? 'border-primary/25 bg-primary/8 text-primary'
                        : 'border-app-border-subtle bg-app-surface text-app-text-muted hover:text-app-text-secondary'
                    }`}
                  >
                    {mode === 'tabs' && '标签页'}
                    {mode === 'flow' && '流式分区'}
                    {mode === 'tabs-flow' && '标签+滚动'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 自动 / 手动 策略切换 */}
          {policy.enabled && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-app-text-subtle">分组策略：</span>
              {(['auto', 'manual'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={loading}
                  onClick={() => onUpdate({ strategy: s })}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    policy.strategy === s
                      ? 'border-primary/25 bg-primary/8 text-primary'
                      : 'border-app-border-subtle bg-app-surface text-app-text-muted hover:text-app-text-secondary'
                  }`}
                >
                  {s === 'auto' ? '🤖 自动推断' : '✋ 手动标签'}
                </button>
              ))}
              <span className="text-[10px] text-app-text-subtle">
                {policy.strategy === 'auto'
                  ? '根据组件标题关键词自动推断分组'
                  : '严格遵循预定义标签，不再自动推断新分组'}
              </span>
            </div>
          )}

          {/* 手动模式：标签编辑器 */}
          {policy.enabled && policy.strategy === 'manual' && (
            <div className="rounded-lg border border-app-border-subtle bg-app-surface/50 p-3 space-y-3">
              <div className="text-xs font-medium text-app-text">预定义分组标签</div>
              <div className="text-[11px] text-app-text-subtle">
                只有在这里定义的标签才会被用于分组。组件的 group 字段必须匹配以下标签之一。
              </div>
              <div className="flex flex-wrap gap-1.5">
                {manualGroups.map((g) => (
                  <span
                    key={g}
                    className="inline-flex h-6 items-center gap-1 rounded-lg border border-primary/15 bg-primary/8 px-2 text-[11px] text-primary"
                  >
                    {g}
                    <button
                      type="button"
                      onClick={() => removeManualGroup(g)}
                      className="text-primary/60 hover:text-primary"
                      title="删除"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {manualGroups.length === 0 && (
                  <span className="text-[11px] text-app-text-subtle">暂无预定义标签，请添加至少一个</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualGroup()}
                  placeholder="输入新标签名称"
                  className="flex-1 rounded border border-app-border-subtle bg-app-surface px-2 py-1 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addManualGroup}
                  disabled={!newGroupName.trim()}
                  className="rounded border border-app-border-subtle px-3 py-1 text-xs text-app-text-subtle transition-colors hover:bg-app-surface-subtle hover:text-app-text disabled:opacity-50"
                >
                  添加
                </button>
              </div>
            </div>
          )}

          {/* 预览区域 */}
          {policy.enabled && (
            <div>
              <div className="mb-2 text-[11px] font-medium text-app-text-subtle">
                {policy.strategy === 'auto' ? '自动推断预览' : '手动标签匹配预览'}
              </div>
              <div className="space-y-1.5">
                {(policy.strategy === 'auto' ? autoPreview : manualPreview).map((g) => (
                  <div key={g.name} className="flex items-center gap-2">
                    <span className="inline-flex h-5 items-center rounded bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                      {g.name}
                    </span>
                    <span className="text-[11px] text-app-text-subtle">{g.items.length} 个组件</span>
                    <span className="truncate text-[10px] text-app-text-muted">
                      {g.items.slice(0, 3).join('、')}{g.items.length > 3 ? ` 等` : ''}
                    </span>
                  </div>
                ))}
                {(policy.strategy === 'auto' ? autoPreview : manualPreview).length === 0 && (
                  <span className="text-[11px] text-app-text-subtle">
                    {policy.strategy === 'auto' ? '组件数不足或无法推断有效分组' : '无匹配组件'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCards({ cards }: { cards: Array<{ label: string; value: string; detail: string }> }) {
  return (
    <div className="grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="bi-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-app-text-subtle">{card.label}</div>
          <div className="mt-2 text-2xl font-semibold text-app-text">{card.value}</div>
          <div className="mt-1 text-xs text-app-text-muted">{card.detail}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-app-border-subtle bg-app-surface-subtle/20 px-6 py-16 text-center">
      {icon}
      <div className="mt-3 text-sm font-medium text-app-text">{title}</div>
      <div className="mt-1 text-xs text-app-text-subtle">{description}</div>
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onPreview,
  onDelete,
  onRename,
  onCopy,
  onCreateCockpit,
}: {
  template: CockpitTemplate;
  onEdit: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onCopy: () => void;
  onCreateCockpit: () => void;
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
    <div className="rounded-lg border border-app-border-subtle bg-app-surface p-4 shadow-sm transition-colors hover:border-app-border-hover hover:shadow-md">
      <div className="mb-3">
        <div className="min-w-0">
          {isEditingName ? (
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
              className="w-full rounded bg-app-surface-subtle px-2 py-1 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
              autoFocus
            />
          ) : (
            <div className="group flex min-w-0 items-start gap-2">
              <h3
                className="min-w-0 flex-1 truncate cursor-pointer text-[18px] font-semibold leading-[1.35] text-app-text transition-colors hover:text-red-400"
                onClick={() => setIsEditingName(true)}
              >
                {template.name}
              </h3>
              <Edit3 className="mt-1 h-3 w-3 shrink-0 cursor-pointer text-app-text-subtle opacity-0 transition-opacity group-hover:opacity-100" onClick={() => setIsEditingName(true)} />
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-app-text-subtle">
            {template.isBuiltin && (
              <span className="shrink-0 whitespace-nowrap rounded border border-app-border-subtle bg-app-surface-subtle px-1.5 py-0.5 text-[10px] text-app-text-muted">系统</span>
            )}
            <span className="whitespace-nowrap">ID: {template.id}</span>
            <span className="hidden text-app-text-subtle/60 sm:inline">·</span>
            <span className="whitespace-nowrap">领域: {template.domain}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-1 border-t border-app-border-subtle/70 pt-3">
          <IconButton title="创建驾驶舱" onClick={onCreateCockpit} accent="emerald"><Rocket className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="预览模板" onClick={onPreview}><Eye className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="复制为自定义模板" onClick={onCopy}><Copy className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="编辑" onClick={onEdit}><Edit3 className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="删除" onClick={onDelete} accent="red"><Trash2 className="h-3.5 w-3.5" /></IconButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-app-surface-subtle px-2 py-0.5 text-app-text-muted">{template.widgets?.length || 0} 个组件</span>
        <span className="rounded bg-app-surface-subtle px-2 py-0.5 text-app-text-muted">{template.keywords?.length || 0} 个关键词</span>
        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: template.color }} title={template.color} />
        <span className="text-[10px] text-app-text-subtle">{template.icon}</span>
        {template.initPrompt && (
          <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">自动初始化</span>
        )}
        {/* grouping is now globally controlled, not per-template */}
      </div>
    </div>
  );
}

function WidgetCatalogCard({
  item,
  onPreview,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  item: WidgetCatalogItem;
  onPreview: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-app-border-subtle bg-app-surface p-4 shadow-sm transition-colors hover:border-app-border-hover hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-app-border-subtle bg-app-surface-subtle" style={{ backgroundColor: `${item.color}18` }}>
            <WorkspaceIcon icon={item.icon} color={item.color} className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-medium text-app-text">{item.name}</h3>
              {item.isBuiltin && (
                <span className="rounded border border-app-border-subtle bg-app-surface-subtle px-1.5 py-0.5 text-[10px] text-app-text-muted">预制</span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-app-text-subtle">
              {WIDGET_TYPE_LABELS[item.type]} · {item.category}
            </div>
          </div>
        </div>

        <div className="flex gap-1">
          <IconButton title="预览组件" onClick={onPreview}><Eye className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="复制组件" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></IconButton>
          <IconButton title="编辑组件" onClick={onEdit}><Edit3 className="h-3.5 w-3.5" /></IconButton>
          {!item.isBuiltin && (
            <IconButton title="删除组件" onClick={onDelete} accent="red"><Trash2 className="h-3.5 w-3.5" /></IconButton>
          )}
        </div>
      </div>

      <p className="line-clamp-2 text-sm leading-6 text-app-text-muted">{item.description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="rounded-full border border-app-border-subtle bg-app-surface-subtle px-2 py-0.5 text-[10px] text-app-text-subtle">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-app-border-subtle bg-app-surface-subtle/40 px-3 py-2">
        <div className="text-[10px] uppercase tracking-[0.16em] text-app-text-subtle">面向智能体说明</div>
        <div className="mt-1 line-clamp-3 text-xs leading-5 text-app-text-muted">{item.agentDescription}</div>
      </div>

      {/* 底部预览入口已移除，与顶部预览按钮合并 */}
    </div>
  );
}

function buildWidgetPreviewTemplate(item: WidgetCatalogItem) {
  return {
    id: item.template.id || item.id,
    type: item.template.type || item.type,
    title: item.template.title || item.name,
    position: item.template.position || { x: 0, y: 0, w: 6, h: 4 },
    data: item.template.data || {},
    dataSource: item.template.dataSource,
    dataIntent: item.template.dataIntent,
    detail: item.template.detail,
    link: item.template.link,
  };
}

function WidgetPreviewModal({
  item,
  onClose,
  onEdit,
  onShowDetail,
}: {
  item: WidgetCatalogItem;
  onClose: () => void;
  onEdit: () => void;
  onShowDetail: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-overlay/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-app-border-subtle bg-app-surface shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between border-b border-app-border-subtle px-6 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-app-border-subtle bg-app-surface-subtle/60" style={{ backgroundColor: `${item.color}14` }}>
              <WorkspaceIcon icon={item.icon} color={item.color} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-app-text">{item.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-app-text-subtle">
                <span>{WIDGET_TYPE_LABELS[item.type]}</span>
                <span>·</span>
                <span>{item.category}</span>
                <span>·</span>
                <span>{item.id}</span>
                {item.isBuiltin && (
                  <>
                    <span>·</span>
                    <span className="rounded-full border border-app-border-subtle bg-app-surface-subtle px-2 py-0.5 text-[10px] text-app-text-muted">预制组件</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onShowDetail} className="rounded-lg border border-app-border-subtle px-3 py-1.5 text-xs text-app-text-muted transition-colors hover:bg-app-surface-subtle hover:text-app-text">
              查看详情
            </button>
            <button onClick={onEdit} className="rounded-lg border border-app-border-subtle px-3 py-1.5 text-xs text-app-text-muted transition-colors hover:bg-app-surface-subtle hover:text-app-text">
              {item.isBuiltin ? '基于此扩展' : '编辑组件'}
            </button>
            <button onClick={onClose} className="text-app-text-subtle transition-colors hover:text-app-text-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-600">
              预览已自动补充演示数据
            </span>
            {item.tags.slice(0, 6).map((tag) => (
              <span key={tag} className="rounded-full border border-app-border-subtle bg-app-surface-subtle px-2.5 py-1 text-[11px] text-app-text-muted">
                {tag}
              </span>
            ))}
          </div>

          <TemplatePreviewCanvas widgets={[buildWidgetPreviewTemplate(item)]} rowHeight={56} />

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-app-border-subtle bg-app-surface-subtle/35 px-4 py-3">
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-app-text-subtle">组件说明</div>
              <div className="text-sm leading-6 text-app-text-muted">{item.description || '当前组件未填写说明。'}</div>
            </div>
            <div className="rounded-2xl border border-app-border-subtle bg-app-surface-subtle/35 px-4 py-3">
              <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-app-text-subtle">面向智能体说明</div>
              <div className="text-sm leading-6 text-app-text-muted">{item.agentDescription || '当前组件未填写智能体说明。'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplatePreviewModal({
  template,
  onClose,
  onEdit,
  onCreateCockpit,
}: {
  template: CockpitTemplate;
  onClose: () => void;
  onEdit: () => void;
  onCreateCockpit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-overlay/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-app-border-subtle bg-app-surface shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between border-b border-app-border-subtle px-6 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-app-border-subtle bg-app-surface-subtle/60" style={{ backgroundColor: `${template.color}14` }}>
              <WorkspaceIcon icon={template.icon} color={template.color} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-app-text">{template.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-app-text-subtle">
                <span>{template.domain}</span>
                <span>·</span>
                <span>{template.widgets.length} 个组件</span>
                <span>·</span>
                <span>{template.keywords.length} 个关键词</span>
                {template.initPrompt && (
                  <>
                    <span>·</span>
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">带初始化任务</span>
                  </>
                )}
                {/* grouping is globally controlled, not per-template */}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="rounded-lg border border-app-border-subtle px-3 py-1.5 text-xs text-app-text-muted transition-colors hover:bg-app-surface-subtle hover:text-app-text">
              编辑模板
            </button>
            <button onClick={onCreateCockpit} className="rounded-lg bg-red-500 px-3 py-1.5 text-xs text-white transition-colors hover:bg-red-600">
              用此模板创建驾驶舱
            </button>
            <button onClick={onClose} className="text-app-text-subtle transition-colors hover:text-app-text-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            {template.keywords.map((keyword) => (
              <span key={keyword} className="rounded-full border border-app-border-subtle bg-app-surface-subtle px-2.5 py-1 text-[11px] text-app-text-muted">
                {keyword}
              </span>
            ))}
          </div>
          <TemplatePreviewCanvas widgets={template.widgets} />
          <div className="mt-4 rounded-2xl border border-app-border-subtle bg-app-surface-subtle/35 px-4 py-3 text-sm leading-6 text-app-text-muted">
            {template.description || '当前模板未填写描述。'}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children,
  accent,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  accent?: 'red' | 'emerald';
}) {
  const base = accent === 'red'
    ? 'hover:bg-red-500/10 hover:text-red-400'
    : accent === 'emerald'
      ? 'hover:bg-emerald-500/10 hover:text-emerald-400'
      : 'hover:bg-app-surface-subtle hover:text-app-text-muted';

  return (
    <button
      onClick={onClick}
      className={`rounded-lg p-1.5 text-app-text-subtle transition-colors ${base}`}
      title={title}
    >
      {children}
    </button>
  );
}

function TemplateEditor({
  mode,
  template,
  widgetCatalog,
  groupingPolicy,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit' | 'duplicate';
  template: TemplateFormData | null;
  widgetCatalog: WidgetCatalogItem[];
  groupingPolicy: GroupingPolicy;
  onSave: (data: TemplateFormData) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState(() => initTemplateFormData(template));
  const [showJson, setShowJson] = useState(false);
  const [jsonError, setJsonError] = useState('');

  const updateField = (path: string, value: unknown) => {
    setData((prev) => {
      const next = { ...prev };
      const keys = path.split('.');
      let target: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i += 1) {
        const current = target[keys[i]];
        target[keys[i]] = { ...(current as Record<string, unknown> | undefined) };
        target = target[keys[i]] as Record<string, unknown>;
      }
      target[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const updateWidget = (idx: number, patch: Partial<Widget>) => {
    setData((prev) => {
      const widgets = [...prev.widgets];
      widgets[idx] = { ...widgets[idx], ...patch };
      return { ...prev, widgets };
    });
  };

  const addWidget = () => {
    const ts = Date.now();
    setData((prev) => ({
      ...prev,
      widgets: [
        ...prev.widgets,
        {
          id: `w-${ts}`,
          type: 'metric',
          title: '新组件',
          position: { x: 0, y: 0, w: 3, h: 2 },
          data: { value: '—', change: '+0%', trend: 'flat' },
        },
      ],
    }));
  };

  const addWidgetFromCatalog = (item: WidgetCatalogItem) => {
    const ts = Date.now();
    const baseTemplate = item.template || {};
    setData((prev) => ({
      ...prev,
      widgets: [
        ...prev.widgets,
        {
          id: `${baseTemplate.id || `w-${ts}`}-${Math.random().toString(36).slice(2, 6)}`,
          type: baseTemplate.type || item.type,
          title: baseTemplate.title || item.name,
          position: baseTemplate.position || { x: 0, y: 0, w: 4, h: 3 },
          data: baseTemplate.data || {},
          dataSource: baseTemplate.dataSource,
          dataIntent: baseTemplate.dataIntent,
          detail: baseTemplate.detail,
          link: baseTemplate.link,
        },
      ],
    }));
  };

  const removeWidget = (idx: number) => {
    setData((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((_: unknown, index: number) => index !== idx),
    }));
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

  const title = mode === 'edit' ? '编辑模板' : mode === 'duplicate' ? '复制模板' : '新建模板';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-overlay/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-app-border-subtle bg-app-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-app-border-subtle px-5 py-3.5">
          <h3 className="text-sm font-semibold text-app-text">{title}</h3>
          <button onClick={onClose} className="text-app-text-subtle hover:text-app-text-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_320px]">
            <div className="space-y-5">
              <section>
                <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
                  <Type className="h-3.5 w-3.5" /> 基础信息
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="模板 ID">
                    <input
                      value={data.id}
                      onChange={(e) => updateField('id', e.target.value)}
                      disabled={mode === 'edit'}
                      className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none disabled:opacity-50"
                    />
                  </Field>
                  <Field label="显示名称">
                    <input
                      value={data.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                    />
                  </Field>
                  <Field label="领域">
                    <input
                      value={data.domain}
                      onChange={(e) => updateField('domain', e.target.value)}
                      className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                    />
                  </Field>
                  <Field label="图标">
                    <select
                      value={data.icon}
                      onChange={(e) => updateField('icon', e.target.value)}
                      className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                    >
                      {ICON_OPTIONS.map((icon) => (
                        <option key={icon} value={icon}>{icon}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="主题色">
                    <div className="flex items-center gap-2">
                      <input type="color" value={data.color} onChange={(e) => updateField('color', e.target.value)} className="h-9 w-10 rounded-lg border border-app-border-subtle" />
                      <input
                        value={data.color}
                        onChange={(e) => updateField('color', e.target.value)}
                        className="flex-1 rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                      />
                    </div>
                  </Field>
                  <Field label="描述">
                    <input
                      value={data.description}
                      onChange={(e) => updateField('description', e.target.value)}
                      className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                    />
                  </Field>
                </div>
              </section>

              <section>
                <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
                  <Bot className="h-3.5 w-3.5" /> 初始化 Prompt
                </h4>
                <textarea
                  value={data.initPrompt || ''}
                  onChange={(e) => updateField('initPrompt', e.target.value)}
                  className="h-24 w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                  spellCheck={false}
                />
                <p className="mt-1 text-[10px] text-app-text-subtle">创建驾驶舱后将自动执行，用于初始化数据和组件配置。</p>
              </section>

              <section>
                <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
                  <Database className="h-3.5 w-3.5" /> 数据回退设置
                </h4>
                <label className="flex items-center gap-2 text-sm text-app-text">
                  <input
                    type="checkbox"
                    checked={!!data.useDemoDataFallback}
                    onChange={(e) => updateField('useDemoDataFallback', e.target.checked)}
                    className="h-4 w-4"
                  />
                  数据获取失败时显示演示数据
                </label>
              </section>

              <section>
                <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
                  <Tag className="h-3.5 w-3.5" /> 触发关键词
                </h4>
                <KeywordsInput keywords={data.keywords} onChange={(keywords) => updateField('keywords', keywords)} />
              </section>

              <section>
                <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
                  <Bot className="h-3.5 w-3.5" /> 关联智能体
                </h4>
                <AgentInput
                  agentIds={data.agentIds}
                  primaryAgentId={data.primaryAgentId}
                  onAgentIdsChange={(agentIds) => updateField('agentIds', agentIds)}
                  onPrimaryChange={(id) => updateField('primaryAgentId', id)}
                />
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
                    <LayoutGrid className="h-3.5 w-3.5" /> 模板组件
                  </h4>
                  <button
                    onClick={addWidget}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-app-border-subtle px-2.5 py-1 text-[11px] text-app-text-subtle transition-colors hover:border-app-border hover:bg-app-surface-subtle hover:text-app-text"
                  >
                    <Plus className="h-3 w-3" /> 手动新增
                  </button>
                </div>
                <div className="space-y-2">
                  {data.widgets.map((widget: Widget, idx: number) => (
                    <WidgetEditorItem
                      key={widget.id || idx}
                      widget={widget}
                      index={idx}
                      allWidgets={data.widgets}
                      manualGroups={groupingPolicy.strategy === 'manual' ? groupingPolicy.manualGroups : undefined}
                      onChange={(patch) => updateWidget(idx, patch)}
                      onRemove={() => removeWidget(idx)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
                  <Eye className="h-3.5 w-3.5" /> 模板预览
                </h4>
                <TemplatePreviewCanvas
                  widgets={data.widgets}
                  rowHeight={54}
                  emptyMessage="当前模板还没有组件，添加后即可看到真实布局预览。"
                />
              </section>

              <section>
                <button
                  onClick={() => setShowJson(!showJson)}
                  className="flex items-center gap-1.5 text-xs text-app-text-subtle transition-colors hover:text-app-text-muted"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  {showJson ? '收起 JSON' : '高级：查看/编辑 JSON'}
                  {showJson ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showJson && (
                  <div className="mt-2">
                    <textarea
                      value={JSON.stringify(data, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value) as TemplateFormData;
                          setData(parsed);
                          setJsonError('');
                        } catch (err: any) {
                          setJsonError(err.message);
                        }
                      }}
                      className="h-48 w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle p-3 font-mono text-[11px] text-app-text focus:border-red-400/50 focus:outline-none"
                      spellCheck={false}
                    />
                    {jsonError && <p className="mt-1 text-[10px] text-red-400">{jsonError}</p>}
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-4 rounded-2xl border border-app-border-subtle bg-app-surface-subtle/30 p-4">
              <div>
                <div className="text-sm font-medium text-app-text">组件目录</div>
                <div className="mt-1 text-[11px] leading-5 text-app-text-subtle">
                  这些组件定义可复用于模板。选中后会把组件快照加入当前模板，后续可继续单独微调。
                </div>
              </div>
              <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                {widgetCatalog.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addWidgetFromCatalog(item)}
                    className="w-full rounded-xl border border-app-border-subtle bg-app-surface px-3 py-3 text-left transition-colors hover:border-app-border hover:bg-app-surface-hover"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-app-border-subtle" style={{ backgroundColor: `${item.color}18` }}>
                        <WorkspaceIcon icon={item.icon} color={item.color} className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-app-text">{item.name}</div>
                        <div className="mt-0.5 text-[10px] text-app-text-subtle">{WIDGET_TYPE_LABELS[item.type]} · {item.category}</div>
                        <div className="mt-1 line-clamp-2 text-[10px] leading-5 text-app-text-subtle">{item.agentDescription}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-app-border-subtle px-5 py-3.5">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-app-text-muted transition-colors hover:bg-app-surface-subtle">取消</button>
          <button onClick={handleSave} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white transition-colors hover:bg-red-600">
            {mode === 'edit' ? '保存' : mode === 'duplicate' ? '创建副本' : '创建模板'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WidgetCatalogEditor({
  mode,
  item,
  manualGroups,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit' | 'duplicate';
  item: WidgetCatalogItem | null;
  manualGroups?: string[];
  onSave: (data: WidgetCatalogItem) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState(() => initWidgetCatalogFormData(item));
  const [showJson, setShowJson] = useState(false);
  const [jsonError, setJsonError] = useState('');

  const title = mode === 'edit' ? '编辑组件' : mode === 'duplicate' ? '复制组件' : '新建组件';

  const handleSave = () => {
    if (!data.id.trim() || !data.name.trim()) {
      toast.error('组件 ID 和名称不能为空');
      return;
    }
    if (!data.agentDescription.trim()) {
      toast.error('请补充面向智能体的说明');
      return;
    }
    onSave({
      ...data,
      isBuiltin: false,
      useCases: data.useCases.filter(Boolean),
      tags: data.tags.filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-overlay/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-app-border-subtle bg-app-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-app-border-subtle px-5 py-3.5">
          <h3 className="text-sm font-semibold text-app-text">{title}</h3>
          <button onClick={onClose} className="text-app-text-subtle hover:text-app-text-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
              <Wrench className="h-3.5 w-3.5" /> 组件基础信息
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="组件 ID">
                <input
                  value={data.id}
                  onChange={(e) => setData((prev) => ({ ...prev, id: e.target.value }))}
                  disabled={mode === 'edit'}
                  className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none disabled:opacity-50"
                />
              </Field>
              <Field label="显示名称">
                <input
                  value={data.name}
                  onChange={(e) => setData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                />
              </Field>
              <Field label="组件类型">
                <select
                  value={data.type}
                  onChange={(e) => setData((prev) => ({ ...prev, type: e.target.value as WidgetType }))}
                  className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                >
                  {WIDGET_TYPES.map((type) => (
                    <option key={type} value={type}>{WIDGET_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </Field>
              <Field label="分类">
                <input
                  value={data.category}
                  onChange={(e) => setData((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                />
              </Field>
              <Field label="图标">
                <select
                  value={data.icon}
                  onChange={(e) => setData((prev) => ({ ...prev, icon: e.target.value }))}
                  className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                >
                  {ICON_OPTIONS.map((icon) => (
                    <option key={icon} value={icon}>{icon}</option>
                  ))}
                </select>
              </Field>
              <Field label="主题色">
                <div className="flex items-center gap-2">
                  <input type="color" value={data.color} onChange={(e) => setData((prev) => ({ ...prev, color: e.target.value }))} className="h-9 w-10 rounded-lg border border-app-border-subtle" />
                  <input
                    value={data.color}
                    onChange={(e) => setData((prev) => ({ ...prev, color: e.target.value }))}
                    className="flex-1 rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                  />
                </div>
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
              <Type className="h-3.5 w-3.5" /> 描述与智能体说明
            </h4>
            <div className="space-y-3">
              <Field label="组件说明">
                <textarea
                  value={data.description}
                  onChange={(e) => setData((prev) => ({ ...prev, description: e.target.value }))}
                  className="h-20 w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                />
              </Field>
              <Field label="面向智能体如何描述">
                <textarea
                  value={data.agentDescription}
                  onChange={(e) => setData((prev) => ({ ...prev, agentDescription: e.target.value }))}
                  className="h-28 w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
                />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
              <Tag className="h-3.5 w-3.5" /> 标签与适用场景
            </h4>
            <div className="grid gap-4 md:grid-cols-2">
              <TagListEditor label="标签" values={data.tags} onChange={(tags) => setData((prev) => ({ ...prev, tags }))} />
              <TagListEditor label="适用场景" values={data.useCases} onChange={(useCases) => setData((prev) => ({ ...prev, useCases }))} />
            </div>
          </section>

          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
              <LayoutGrid className="h-3.5 w-3.5" /> 推荐模板快照
            </h4>
            <WidgetSnapshotEditor
              widget={data.template}
              manualGroups={manualGroups}
              onChange={(template) => setData((prev) => ({ ...prev, template }))}
            />
          </section>

          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
              <Eye className="h-3.5 w-3.5" /> 组件预览
            </h4>
            <WidgetPreviewCard widget={data.template} className="min-h-[360px]" />
          </section>

          <section>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-app-text-muted">
              <Database className="h-3.5 w-3.5" /> 智能体选用建议
            </h4>
            <Field label="推荐数据结构说明">
              <textarea
                value={JSON.stringify(data.schemaHint?.recommendedDataShape || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setData((prev) => ({
                      ...prev,
                      schemaHint: { ...prev.schemaHint, recommendedDataShape: parsed },
                    }));
                  } catch {
                    // ignore
                  }
                }}
                className="h-28 w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle p-3 font-mono text-[11px] text-app-text focus:border-red-400/50 focus:outline-none"
                spellCheck={false}
              />
            </Field>
            <Field label="布局建议">
              <textarea
                value={data.schemaHint?.layoutAdvice || ''}
                onChange={(e) => setData((prev) => ({
                  ...prev,
                  schemaHint: { ...prev.schemaHint, layoutAdvice: e.target.value },
                }))}
                className="mt-3 h-20 w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
              />
            </Field>
          </section>

          <section>
            <button
              onClick={() => setShowJson(!showJson)}
              className="flex items-center gap-1.5 text-xs text-app-text-subtle transition-colors hover:text-app-text-muted"
            >
              <FileJson className="h-3.5 w-3.5" />
              {showJson ? '收起 JSON' : '高级：查看/编辑 JSON'}
              {showJson ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showJson && (
              <div className="mt-2">
                <textarea
                  value={JSON.stringify(data, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value) as WidgetCatalogItem;
                          setData(parsed);
                          setJsonError('');
                        } catch (err: any) {
                          setJsonError(err.message);
                    }
                  }}
                  className="h-56 w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle p-3 font-mono text-[11px] text-app-text focus:border-red-400/50 focus:outline-none"
                  spellCheck={false}
                />
                {jsonError && <p className="mt-1 text-[10px] text-red-400">{jsonError}</p>}
              </div>
            )}
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t border-app-border-subtle px-5 py-3.5">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-app-text-muted transition-colors hover:bg-app-surface-subtle">取消</button>
          <button onClick={handleSave} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white transition-colors hover:bg-red-600">
            {mode === 'edit' ? '保存' : mode === 'duplicate' ? '创建副本' : '创建组件'}
          </button>
        </div>
      </div>
    </div>
  );
}

// WidgetDetailModal removed - no longer needed

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-app-text-subtle">{label}</label>
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
      <div className="mb-2 flex flex-wrap gap-1.5">
        {keywords.map((keyword, i) => (
          <span key={`${keyword}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-app-border-subtle bg-app-surface-subtle px-2 py-1 text-xs text-app-text-muted">
            {keyword}
            <button onClick={() => onChange(keywords.filter((_, idx) => idx !== i))} className="hover:text-red-400"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="flex-1 rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text placeholder:text-app-text-subtle focus:border-red-400/50 focus:outline-none"
          placeholder="输入后回车"
        />
        <button onClick={add} className="rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text-muted transition-colors hover:bg-app-surface-hover">添加</button>
      </div>
    </div>
  );
}

function TagListEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setInput('');
    }
  };

  return (
    <div>
      <div className="mb-1 text-[11px] text-app-text-subtle">{label}</div>
      <div className="mb-2 flex min-h-10 flex-wrap gap-1.5 rounded-lg border border-app-border-subtle bg-app-surface-subtle px-2 py-2">
        {values.map((value, index) => (
          <span key={`${value}-${index}`} className="inline-flex items-center gap-1 rounded-md border border-app-border-subtle bg-app-surface px-2 py-1 text-xs text-app-text-muted">
            {value}
            <button onClick={() => onChange(values.filter((_, idx) => idx !== index))} className="hover:text-red-400"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="flex-1 rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text placeholder:text-app-text-subtle focus:border-red-400/50 focus:outline-none"
          placeholder="输入后回车"
        />
        <button onClick={add} className="rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text-muted transition-colors hover:bg-app-surface-hover">添加</button>
      </div>
    </div>
  );
}

function AgentInput({
  agentIds,
  primaryAgentId,
  onAgentIdsChange,
  onPrimaryChange,
}: {
  agentIds: string[];
  primaryAgentId: string;
  onAgentIdsChange: (ids: string[]) => void;
  onPrimaryChange: (id: string) => void;
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
        {agentIds.map((id) => (
          <button
            key={id}
            onClick={() => onPrimaryChange(id)}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${
              id === primaryAgentId
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : 'border-app-border-subtle bg-app-surface-subtle text-app-text-muted hover:border-app-border'
            }`}
          >
            {id === primaryAgentId && <span className="h-1.5 w-1.5 rounded-full bg-red-400" />}
            {id}
            <span
              onClick={(e) => {
                e.stopPropagation();
                onAgentIdsChange(agentIds.filter((agentId) => agentId !== id));
                if (primaryAgentId === id) onPrimaryChange(agentIds.find((agentId) => agentId !== id) || '');
              }}
              className="ml-0.5 hover:text-red-400"
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="如: finance-agent"
          className="flex-1 rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text placeholder:text-app-text-subtle focus:border-red-400/50 focus:outline-none"
        />
        <button onClick={add} className="rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text-muted transition-colors hover:bg-app-surface-hover">添加</button>
      </div>
      <p className="text-[10px] text-app-text-subtle">带红点的是主智能体，点击标签可切换。</p>
    </div>
  );
}

function WidgetEditorItem({
  widget,
  index,
  allWidgets,
  manualGroups,
  onChange,
  onRemove,
}: {
  widget: Widget;
  index: number;
  allWidgets: Widget[];
  manualGroups?: string[];
  onChange: (patch: Partial<Widget>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isManual = !!manualGroups && manualGroups.length > 0;

  // 自动模式下：从其他 widget 收集已有分组
  const existingGroups = useMemo(() => {
    const set = new Set<string>();
    for (const w of allWidgets) {
      if (w.id !== widget.id && w.group?.trim()) {
        set.add(w.group.trim());
      }
    }
    return Array.from(set).sort();
  }, [allWidgets, widget.id]);

  // 根据 title 关键词建议匹配的分组（手动模式）
  const suggestedGroup = useMemo(() => {
    if (!isManual) return '';
    const lowerTitle = (widget.title || '').toLowerCase();
    for (const g of manualGroups!) {
      if (lowerTitle.includes(g.toLowerCase())) return g;
    }
    return '';
  }, [isManual, manualGroups, widget.title]);

  const currentGroup = widget.group?.trim() || '';

  return (
    <div className="rounded-lg border border-app-border-subtle bg-app-surface-subtle/50">
      <div className="flex cursor-pointer items-center justify-between px-3 py-2 transition-colors hover:bg-app-surface-subtle" onClick={() => setExpanded((prev) => !prev)}>
        <div className="flex items-center gap-2">
          <span className="w-5 text-[10px] text-app-text-subtle">#{index + 1}</span>
          <span className="text-xs font-medium text-app-text">{widget.title}</span>
          <span className="rounded border border-app-border-subtle bg-app-surface px-1.5 py-0.5 text-[10px] text-app-text-subtle">{widget.type}</span>
          {currentGroup && (
            <span className="rounded border border-primary/15 bg-primary/8 px-1.5 py-0.5 text-[10px] text-primary">{currentGroup}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-app-text-subtle" /> : <ChevronDown className="h-3.5 w-3.5 text-app-text-subtle" />}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="rounded p-1 text-app-text-subtle transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2.5 border-t border-app-border-subtle/50 px-3 pb-3">
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Field label="组件 ID">
              <input
                value={widget.id}
                onChange={(e) => onChange({ id: e.target.value })}
                className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
              />
            </Field>
            <Field label="标题">
              <input
                value={widget.title}
                onChange={(e) => onChange({ title: e.target.value })}
                className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
              />
            </Field>
            <Field label="类型">
              <select
                value={widget.type}
                onChange={(e) => onChange({ type: e.target.value as WidgetType })}
                className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
              >
                {WIDGET_TYPES.map((type) => (
                  <option key={type} value={type}>{WIDGET_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </Field>
            <Field label={`分组${isManual ? '（手动模式）' : ''}`}>
              <select
                value={currentGroup}
                onChange={(e) => onChange({ group: e.target.value || undefined })}
                className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
              >
                <option value="">{isManual ? '🚫 不分组' : '🔄 自动匹配'}</option>
                {(isManual ? manualGroups : existingGroups).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              {isManual && suggestedGroup && suggestedGroup !== currentGroup && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  <span>标题匹配建议：「{suggestedGroup}」</span>
                  <button
                    type="button"
                    onClick={() => onChange({ group: suggestedGroup })}
                    className="text-primary hover:underline"
                  >
                    应用
                  </button>
                </div>
              )}
            </Field>
            <div>
              <label className="mb-1 block text-[10px] text-app-text-subtle">位置 (x,y,w,h)</label>
              <div className="flex gap-1">
                {(['x', 'y', 'w', 'h'] as const).map((key) => (
                  <input
                    key={key}
                    type="number"
                    value={widget.position?.[key] ?? 0}
                    onChange={(e) => onChange({ position: { ...widget.position, [key]: Number(e.target.value) } })}
                    className="w-12 rounded border border-app-border-subtle bg-app-surface px-1.5 py-1.5 text-center text-xs text-app-text focus:border-red-400/50 focus:outline-none"
                  />
                ))}
              </div>
            </div>
          </div>

          <Field label="数据 (JSON)">
            <textarea
              value={JSON.stringify(widget.data || {}, null, 2)}
              onChange={(e) => {
                try {
                  onChange({ data: JSON.parse(e.target.value) });
                } catch {
                  // ignore while editing
                }
              }}
              className="h-24 w-full rounded border border-app-border-subtle bg-app-surface p-2 font-mono text-[10px] text-app-text focus:border-red-400/50 focus:outline-none"
              spellCheck={false}
            />
          </Field>

          <LinkConfigEditor
            link={widget.link}
            onChange={(link) => onChange({ link })}
          />
        </div>
      )}
    </div>
  );
}

function WidgetSnapshotEditor({
  widget,
  manualGroups,
  onChange,
}: {
  widget: Partial<Widget>;
  manualGroups?: string[];
  onChange: (widget: Partial<Widget>) => void;
}) {
  const safeWidget = {
    id: widget.id || 'widget-template',
    type: widget.type || 'metric',
    title: widget.title || '组件标题',
    position: widget.position || { x: 0, y: 0, w: 4, h: 3 },
    data: widget.data || {},
    dataSource: widget.dataSource,
    dataIntent: widget.dataIntent,
    detail: widget.detail,
    link: widget.link,
    group: widget.group,
  };

  const isManual = !!manualGroups && manualGroups.length > 0;

  // 根据 title 关键词建议匹配的分组（手动模式）
  const suggestedGroup = useMemo(() => {
    if (!isManual) return '';
    const lowerTitle = (safeWidget.title || '').toLowerCase();
    for (const g of manualGroups!) {
      if (lowerTitle.includes(g.toLowerCase())) return g;
    }
    return '';
  }, [isManual, manualGroups, safeWidget.title]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="标题">
          <input
            value={safeWidget.title}
            onChange={(e) => onChange({ ...safeWidget, title: e.target.value })}
            className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
          />
        </Field>
        <Field label="类型">
          <select
            value={safeWidget.type}
            onChange={(e) => onChange({ ...safeWidget, type: e.target.value as WidgetType })}
            className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
          >
            {WIDGET_TYPES.map((type) => (
              <option key={type} value={type}>{WIDGET_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </Field>
        <Field label={`分组${isManual ? '（手动模式）' : ''}`}>
          {isManual ? (
            <>
              <select
                value={safeWidget.group || ''}
                onChange={(e) => onChange({ ...safeWidget, group: e.target.value || undefined })}
                className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
              >
                <option value="">🚫 不分组</option>
                {manualGroups!.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              {suggestedGroup && suggestedGroup !== safeWidget.group && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  <span>标题匹配建议：「{suggestedGroup}」</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...safeWidget, group: suggestedGroup })}
                    className="text-primary hover:underline"
                  >
                    应用
                  </button>
                </div>
              )}
            </>
          ) : (
            <input
              value={safeWidget.group || ''}
              onChange={(e) => onChange({ ...safeWidget, group: e.target.value || undefined })}
              placeholder="留空则自动匹配"
              className="w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle px-3 py-2 text-sm text-app-text focus:border-red-400/50 focus:outline-none"
            />
          )}
        </Field>
      </div>

      <Field label="默认数据 (JSON)">
        <textarea
          value={JSON.stringify(safeWidget.data || {}, null, 2)}
          onChange={(e) => {
            try {
              onChange({ ...safeWidget, data: JSON.parse(e.target.value) });
            } catch {
              // ignore
            }
          }}
          className="h-28 w-full rounded-lg border border-app-border-subtle bg-app-surface-subtle p-3 font-mono text-[11px] text-app-text focus:border-red-400/50 focus:outline-none"
          spellCheck={false}
        />
      </Field>

      <LinkConfigEditor
        link={safeWidget.link}
        onChange={(link) => onChange({ ...safeWidget, link })}
      />
    </div>
  );
}

function initTemplateFormData(template: TemplateFormData | null): TemplateFormData {
  if (template) return cloneForForm(template);
  return {
    id: `custom-${Date.now().toString(36)}`,
    name: '',
    domain: '通用',
    keywords: [],
    icon: 'BarChart3',
    color: '#ef4444',
    agentIds: [],
    primaryAgentId: '',
    description: '由驾驶舱智能体自动创建的{{name}}',
    widgets: [
      {
        id: `w-${Date.now()}`,
        type: 'metric',
        title: '核心指标',
        position: { x: 0, y: 0, w: 3, h: 2 },
        data: { value: '—', change: '+0%', trend: 'flat' },
      },
    ],
    initPrompt: '',
    useDemoDataFallback: true,
  };
}

function initWidgetCatalogFormData(item: WidgetCatalogItem | null): WidgetCatalogItem {
  if (item) return sanitizeWidgetCatalogItemForForm(item);
  return {
    id: `custom-widget-${Date.now().toString(36)}`,
    name: '',
    type: 'metric',
    category: '通用',
    icon: 'BarChart3',
    color: '#ef4444',
    description: '',
    agentDescription: '',
    useCases: [],
    tags: [],
    schemaHint: {
      recommendedDataShape: { value: 'string | number', change: 'string', trend: 'up | down | flat' },
      layoutAdvice: '',
    },
    template: {
      id: 'widget-template',
      type: 'metric',
      title: '核心指标',
      position: { x: 0, y: 0, w: 3, h: 2 },
      data: { value: '—', change: '+0%', trend: 'flat' },
    },
    isBuiltin: false,
  };
}

function sanitizeTemplateForForm(template: CockpitTemplate): TemplateFormData {
  const {
    isBuiltin: _isBuiltin,
    _custom: _custom,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = cloneForForm(template) as CockpitTemplate & Record<string, unknown>;

  return {
    ...rest,
    keywords: Array.isArray(rest.keywords) ? rest.keywords : [],
    agentIds: Array.isArray(rest.agentIds) ? rest.agentIds : [],
    widgets: Array.isArray(rest.widgets) ? rest.widgets : [],
  };
}

function sanitizeWidgetCatalogItemForForm(item: WidgetCatalogItem): WidgetCatalogItem {
  const {
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    isBuiltin: _isBuiltin,
    ...rest
  } = cloneForForm(item) as WidgetCatalogItem;

  return {
    ...rest,
    useCases: Array.isArray(rest.useCases) ? rest.useCases : [],
    tags: Array.isArray(rest.tags) ? rest.tags : [],
    template: rest.template || {},
    isBuiltin: false,
  };
}

// ── 关联/穿透配置编辑器 ──

function LinkConfigEditor({
  link,
  onChange,
}: {
  link?: WidgetLinkConfig;
  onChange: (link?: WidgetLinkConfig) => void;
}) {
  const hasLink = !!link && !!link.type;
  const type = (link?.type as WidgetLinkConfig['type']) || 'workspace';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-app-text-subtle">关联/穿透配置（可选）</label>
        {!hasLink && (
          <button
            type="button"
            onClick={() => onChange({ type: 'workspace' })}
            className="rounded border border-dashed border-app-border-subtle px-2 py-0.5 text-[10px] text-app-text-subtle transition-colors hover:border-app-border hover:text-app-text"
          >
            + 添加
          </button>
        )}
        {hasLink && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded p-0.5 text-app-text-subtle transition-colors hover:text-red-400"
            title="移除"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {hasLink && (
        <div className="rounded-lg border border-app-border-subtle bg-app-surface-subtle/30 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="类型">
              <select
                value={type}
                onChange={(e) => {
                  const nextType = e.target.value as WidgetLinkConfig['type'];
                  onChange({ type: nextType });
                }}
                className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
              >
                <option value="workspace">跳转驾驶舱</option>
                <option value="widget">穿透组件</option>
                <option value="url">外部链接</option>
              </select>
            </Field>
            <Field label="标题（可选）">
              <input
                value={(link?.title as string) || ''}
                onChange={(e) => onChange({ ...link, type: type as WidgetLinkConfig['type'], title: e.target.value })}
                placeholder="点击提示文字"
                className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
              />
            </Field>
          </div>

          {type === 'workspace' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="目标驾驶舱 ID">
                <input
                  value={(link?.targetId as string) || ''}
                  onChange={(e) => onChange({ ...link, type, targetId: e.target.value })}
                  placeholder="ws-xxx"
                  className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
                />
              </Field>
              <Field label="或目标模板名">
                <input
                  value={(link?.targetTemplate as string) || ''}
                  onChange={(e) => onChange({ ...link, type, targetTemplate: e.target.value })}
                  placeholder="模板名称"
                  className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
                />
              </Field>
            </div>
          )}

          {type === 'widget' && (
            <Field label="目标组件 ID">
              <input
                value={(link?.targetId as string) || ''}
                onChange={(e) => onChange({ ...link, type, targetId: e.target.value })}
                placeholder="widget-xxx"
                className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
              />
            </Field>
          )}

          {type === 'url' && (
            <Field label="链接地址">
              <input
                value={(link?.url as string) || ''}
                onChange={(e) => onChange({ ...link, type, url: e.target.value })}
                placeholder="https://..."
                className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
              />
            </Field>
          )}

          {/* 打开方式 */}
          <Field label="打开方式">
            <select
              value={(link?.openMode as string) || 'drawer'}
              onChange={(e) => onChange({ ...link, type, openMode: e.target.value as 'drawer' | 'blank' | 'self' })}
              className="w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-xs text-app-text focus:border-red-400/50 focus:outline-none"
            >
              <option value="drawer">浮层面板（Drawer，推荐用于详情穿透）</option>
              <option value="blank">新浏览器标签页</option>
              <option value="self">当前页跳转</option>
            </select>
          </Field>

          <div className="rounded border border-app-border-subtle/50 bg-app-surface-subtle/30 px-2 py-1.5 text-[10px] text-app-text-subtle leading-relaxed">
            {(!link?.openMode || link.openMode === 'drawer') && '点击组件后从右侧滑出浮层面板，用于在同页面内查看详情、下钻数据。'}
            {link?.openMode === 'blank' && '点击组件后在新浏览器标签页中打开目标页面。'}
            {link?.openMode === 'self' && '点击组件后在当前页面内直接跳转，驾驶舱上下文会切换。'}
          </div>
        </div>
      )}
    </div>
  );
}


