import * as workspaceStore from '../data/workspaceStore';
import type { WorkspaceData, CockpitContext } from '../data/workspacesData';
import { contextBuilder } from './context-builder';

function summarizeScalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function summarizeListItems(items: unknown[], limit = 3): string {
  return items
    .slice(0, limit)
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return String(item);
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const label = summarizeScalar(record.label ?? record.title ?? record.name ?? record.status ?? record.date);
        const value = summarizeScalar(record.value ?? record.summary ?? record.detail ?? record.description);
        return [label, value].filter(Boolean).join('=');
      }
      return '';
    })
    .filter(Boolean)
    .join(' | ');
}

function summarizeTableRows(rows: unknown[], limit = 2): string {
  return rows
    .slice(0, limit)
    .map((row) => {
      if (Array.isArray(row)) {
        return row.map((cell) => summarizeScalar(cell)).filter(Boolean).join(' / ');
      }
      if (row && typeof row === 'object') {
        const record = row as Record<string, unknown>;
        return Object.entries(record)
          .slice(0, 4)
          .map(([key, value]) => `${key}=${summarizeScalar(value)}`)
          .filter((entry) => !entry.endsWith('='))
          .join(' / ');
      }
      return summarizeScalar(row);
    })
    .filter(Boolean)
    .join(' || ');
}

function summarizeWidgetData(data: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const metricValue = data.value ?? data.current ?? data.total ?? data.percentage;
  const summary = data.summary ?? data.content ?? data.label ?? data.caption ?? data.message;
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const items = Array.isArray(data.items) ? data.items : [];
  const alerts = Array.isArray(data.alerts) ? data.alerts : [];
  const stages = Array.isArray(data.stages) ? data.stages : [];
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const labels = Array.isArray(data.labels) ? data.labels : [];
  const values = Array.isArray(data.values) ? data.values : [];
  const points = Array.isArray(data.points) ? data.points : [];
  const metrics = Array.isArray(data.metrics) ? data.metrics : [];
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const sections = Array.isArray(data.sections) ? data.sections : [];

  if (summarizeScalar(metricValue)) {
    refs.push(`值=${summarizeScalar(metricValue)}`);
  }
  if (summarizeScalar(summary)) {
    refs.push(`摘要=${summarizeScalar(summary).slice(0, 80)}`);
  }
  if (rows.length > 0) {
    refs.push(`rows=${rows.length}`);
    const firstRows = summarizeTableRows(rows);
    if (firstRows) refs.push(`表格=${firstRows.slice(0, 160)}`);
  }
  if (items.length > 0) {
    refs.push(`items=${items.length}`);
    const firstItems = summarizeListItems(items);
    if (firstItems) refs.push(`列表=${firstItems.slice(0, 160)}`);
  }
  if (alerts.length > 0) {
    refs.push(`alerts=${alerts.length}`);
    const firstAlerts = summarizeListItems(alerts);
    if (firstAlerts) refs.push(`告警=${firstAlerts.slice(0, 120)}`);
  }
  if (stages.length > 0) {
    refs.push(`stages=${stages.length}`);
    const firstStages = summarizeListItems(stages);
    if (firstStages) refs.push(`阶段=${firstStages.slice(0, 120)}`);
  }
  if (steps.length > 0) {
    refs.push(`steps=${steps.length}`);
    const firstSteps = summarizeListItems(steps);
    if (firstSteps) refs.push(`步骤=${firstSteps.slice(0, 120)}`);
  }
  if (labels.length > 0) {
    refs.push(`points=${labels.length}`);
    refs.push(`labels=${labels.slice(0, 5).map((item) => summarizeScalar(item)).filter(Boolean).join(' / ')}`);
  }
  if (values.length > 0) {
    refs.push(`latest=${summarizeScalar(values[values.length - 1])}`);
  }
  if (points.length > 0) {
    refs.push(`地图=${summarizeListItems(points).slice(0, 120)}`);
  }
  if (metrics.length > 0) {
    refs.push(`metrics=${metrics.length}`);
    refs.push(`指标=${summarizeListItems(metrics).slice(0, 160)}`);
  }
  if (highlights.length > 0) {
    refs.push(`highlights=${highlights.length}`);
    refs.push(`重点=${summarizeListItems(highlights).slice(0, 160)}`);
  }
  if (sections.length > 0) {
    refs.push(`sections=${sections.length}`);
  }

  return refs.filter(Boolean);
}

function buildWidgetReferenceSummary(workspace: WorkspaceData): string {
  const widgets = (workspace.widgets || []).slice(0, 30);
  if (widgets.length === 0) {
    return '当前驾驶舱暂无组件。';
  }

  const lines = widgets.map((widget: any, index) => {
    const refs = [
      `#${index + 1}`,
      `[${widget.type || 'unknown'}]`,
      widget.title || '未命名组件',
    ];

    if (widget.data && typeof widget.data === 'object') {
      const data = widget.data as Record<string, unknown>;
      refs.push(...summarizeWidgetData(data));
    }

    return `- ${refs.join(' ')}`;
  });

  return lines.join('\n');
}

function mergeRuntimeWidgets(
  workspace: WorkspaceData,
  runtimeWidgetData?: Array<{ widgetId?: string; title?: string; data?: Record<string, unknown> }>
): WorkspaceData {
  if (!Array.isArray(runtimeWidgetData) || runtimeWidgetData.length === 0) {
    return workspace;
  }

  const byId = new Map(
    runtimeWidgetData
      .filter((item) => item && typeof item === 'object' && item.widgetId && item.data && typeof item.data === 'object')
      .map((item) => [String(item.widgetId), item.data as Record<string, unknown>])
  );

  const byTitle = new Map(
    runtimeWidgetData
      .filter((item) => item && typeof item === 'object' && item.title && item.data && typeof item.data === 'object')
      .map((item) => [String(item.title), item.data as Record<string, unknown>])
  );

  if (byId.size === 0 && byTitle.size === 0) {
    return workspace;
  }

  const widgets = (workspace.widgets || []).map((widget: any) => {
    const runtimeData = byId.get(String(widget.id)) || byTitle.get(String(widget.title));
    if (!runtimeData) return widget;
    return {
      ...widget,
      data: { ...(widget.data || {}), ...runtimeData },
    };
  });

  return {
    ...workspace,
    widgets,
  };
}

function buildViewContextSummary(viewContext?: Record<string, unknown>): string | null {
  if (!viewContext || typeof viewContext !== 'object') {
    return null;
  }

  const parts: string[] = [];
  const activeFilters = viewContext.activeFilters;
  if (activeFilters && typeof activeFilters === 'object' && !Array.isArray(activeFilters)) {
    const filterEntries = Object.entries(activeFilters as Record<string, unknown>)
      .map(([key, value]) => `${key}=${summarizeScalar(value)}`)
      .filter((entry) => !entry.endsWith('='));
    if (filterEntries.length > 0) {
      parts.push(`当前筛选：${filterEntries.join('；')}`);
    }
  }

  const focusedWidget = viewContext.focusedWidget;
  if (focusedWidget && typeof focusedWidget === 'object' && !Array.isArray(focusedWidget)) {
    const widget = focusedWidget as Record<string, unknown>;
    const title = summarizeScalar(widget.title);
    const type = summarizeScalar(widget.type);
    const detail = summarizeScalar(widget.detail);
    const focusLine = [title ? `当前聚焦组件：${title}` : '', type ? `类型=${type}` : '', detail ? `说明=${detail}` : '']
      .filter(Boolean)
      .join(' ');
    if (focusLine) {
      parts.push(focusLine);
    }
  }

  const drill = viewContext.drillContext;
  if (drill && typeof drill === 'object' && !Array.isArray(drill)) {
    const drillEntries = Object.entries(drill as Record<string, unknown>)
      .map(([key, value]) => `${key}=${summarizeScalar(value)}`)
      .filter((entry) => !entry.endsWith('='));
    if (drillEntries.length > 0) {
      parts.push(`当前下钻：${drillEntries.join('；')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

export async function buildWorkspacePromptContext(
  workspaceId: string,
  options?: {
    runtimeWidgetData?: Array<{ widgetId?: string; title?: string; data?: Record<string, unknown> }>;
    viewContext?: Record<string, unknown>;
  }
): Promise<{ workspace: WorkspaceData; context: CockpitContext; promptContext: string } | null> {
  const workspace = await workspaceStore.getWorkspace(workspaceId);
  if (!workspace) {
    return null;
  }

  const workspaceForPrompt = mergeRuntimeWidgets(workspace, options?.runtimeWidgetData);
  const context = options?.runtimeWidgetData
    ? contextBuilder.buildTransient(workspaceForPrompt)
    : await contextBuilder.build(workspaceForPrompt);
  const promptParts = [
    contextBuilder.buildPromptContext(workspaceForPrompt, context),
    '\n【组件精细引用】',
    buildWidgetReferenceSummary(workspaceForPrompt),
  ];

  const viewContextSummary = buildViewContextSummary(options?.viewContext);
  if (viewContextSummary) {
    promptParts.push('\n【当前页面视图】');
    promptParts.push(viewContextSummary);
  }

  const promptContext = promptParts.join('\n');

  const refreshedWorkspace = await workspaceStore.getWorkspace(workspaceId);
  return {
    workspace: mergeRuntimeWidgets(refreshedWorkspace || workspace, options?.runtimeWidgetData),
    context,
    promptContext,
  };
}
