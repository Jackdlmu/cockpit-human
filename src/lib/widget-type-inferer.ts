// ─── Widget Type Inferer (Frontend) ───
// 根据 widget data 内容自动推断最佳 widget 类型
// 与 server/src/services/widget-type-inferer.ts 逻辑保持一致

export function inferWidgetType(data: Record<string, unknown>): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'universal';
  const d = data;

  const adaptiveSections = d.sections || d.blocks || d.cards;
  if (Array.isArray(adaptiveSections) && adaptiveSections.length > 0) {
    return 'adaptive';
  }
  if (d.headline && typeof d.headline === 'object') {
    return 'adaptive';
  }

  // 1. HTML 报告（最高优先级）
  const hasHtmlField = typeof d.html === 'string' && (d.html as string).length > 20;
  const hasDetailHtmlField = typeof d.detailHtml === 'string' && (d.detailHtml as string).length > 20;
  const hasFullHtmlField = typeof d.fullHtml === 'string' && (d.fullHtml as string).length > 20;
  const hasHtmlContentField = typeof d.htmlContent === 'string' && (d.htmlContent as string).length > 20;
  const hasReportHtmlField = typeof d.reportHtml === 'string' && (d.reportHtml as string).length > 20;
  const hasHtmlContent = typeof d.content === 'string' && /<[a-z][\s\S]*?>/i.test(d.content as string) && (d.content as string).length > 100;
  const hasHtmlBody = typeof d.body === 'string' && /<[a-z][\s\S]*?>/i.test(d.body as string);
  if (hasHtmlField || hasDetailHtmlField || hasFullHtmlField || hasHtmlContentField || hasReportHtmlField || hasHtmlContent || hasHtmlBody) return 'html';

  // 2. 子弹图/仪表盘/进度：这些也有 value，必须先于指标卡判断
  if (typeof d.target === 'number' && typeof d.value === 'number') {
    return 'bullet';
  }
  if ((typeof d.min === 'number' || typeof d.max === 'number') && typeof d.value === 'number') {
    return 'gauge';
  }
  if ((typeof d.value === 'number' || typeof d.max === 'number') && d.label !== undefined) {
    return 'progress';
  }

  // 3. 漏斗图（stages 数组含 name+value）
  const funnelStages = d.stages || d.steps || d.phases;
  if (Array.isArray(funnelStages) && funnelStages.length > 0) {
    const first = funnelStages[0];
    if (typeof first === 'object' && first !== null &&
      (('value' in first) || ('rate' in first))) {
      return 'funnel';
    }
  }

  // 4. 热力图（cells/rows 含 x+y+value）
  const cellsSource = d.cells || d.rows;
  if (Array.isArray(cellsSource) && cellsSource.length > 0) {
    const first = cellsSource[0];
    if (typeof first === 'object' && first !== null &&
      (('x' in first && 'y' in first) || ('column' in first && 'row' in first))) {
      return 'heatmap';
    }
  }

  // 5. 图表
  const hasLabels = Array.isArray(d.labels) || Array.isArray(d.categories) || Array.isArray(d.dimensions) || Array.isArray(d.names) || Array.isArray(d.xaxis) || Array.isArray(d.xAxis);
  const hasValues = Array.isArray(d.values) || Array.isArray(d.data) || Array.isArray(d.series) || Array.isArray(d.datasets) || Array.isArray(d.yValues) || Array.isArray(d.yaxis) || Array.isArray(d.yAxis) || Array.isArray(d.numbers);
  if (hasLabels || hasValues) {
    const valuesArr = (d.values || d.data || d.series || d.datasets || d.yValues || d.yaxis || d.yAxis || d.numbers) as unknown[];
    if (Array.isArray(valuesArr) && valuesArr.length > 0) return 'chart';
  }

  // 5. 表格
  const rowsSource = d.rows || d.data || d.records || d.entries;
  if (Array.isArray(rowsSource)) {
    const rows = rowsSource as unknown[];
    if (rows.length > 0) {
      const first = rows[0];
      if (Array.isArray(first) || (typeof first === 'object' && first !== null)) return 'table';
    }
  }

  // 6. 看板
  const stagesSource = d.stages || d.statuses || d.columns || d.phases;
  if (Array.isArray(stagesSource) && stagesSource.length > 0) return 'kanban';

  // 7. 时间线
  const stepsSource = d.steps || d.milestones || d.events || d.nodes;
  if (Array.isArray(stepsSource) && stepsSource.length > 0) return 'timeline';

  // 8. 状态面板
  const itemsSource = d.items || d.statuses || d.list;
  if (Array.isArray(itemsSource) && itemsSource.length > 0) {
    const first = itemsSource[0];
    if (typeof first === 'object' && first !== null &&
      (('status' in first) || ('state' in first) || ('type' in first))) {
      return 'status';
    }
  }

  // 8.5 告警列表（alerts 字段优先）
  const alertsSource = d.alerts || d.events;
  if (Array.isArray(alertsSource) && alertsSource.length > 0) {
    const first = alertsSource[0];
    if (typeof first === 'object' && first !== null &&
      (('level' in first) || ('severity' in first) || ('message' in first))) {
      return 'alert';
    }
  }

  // 9. 列表
  if (Array.isArray(itemsSource) && itemsSource.length > 0) {
    return 'list';
  }

  // 14. 地图（points/locations 含 lat/lng 或 name+value）
  const pointsSource = d.points || d.locations || d.regions;
  if (Array.isArray(pointsSource) && pointsSource.length > 0) {
    return 'map';
  }

  // 15. 报告
  if (typeof d.summary === 'string' && (d.summary as string).length > 0) return 'report';
  if (Array.isArray(d.highlights) && d.highlights.length > 0) return 'report';
  if (Array.isArray(d.keyPoints) && d.keyPoints.length > 0) return 'report';

  // 16. 指标卡
  if (typeof d.value === 'string' || typeof d.value === 'number') {
    if (!(typeof d.value === 'string' && (d.value as string).length > 50)) {
      return 'metric';
    }
  }

  // 17. 纯文本/Markdown
  const longContent = typeof d.content === 'string' && (d.content as string).length > 20;
  const longText = typeof d.text === 'string' && (d.text as string).length > 20;
  const longMarkdown = typeof d.markdown === 'string' && (d.markdown as string).length > 20;
  if (longContent || longText || longMarkdown) return 'universal';

  return 'universal';
}

export function isTypeMismatched(type: string, data: Record<string, unknown>): boolean {
  if (!data || typeof data !== 'object') return false;
  const inferred = inferWidgetType(data);
  if (type === inferred) return false;

  if (type === 'metric' && inferred !== 'metric' && inferred !== 'universal') return true;
  if (type === 'universal' && inferred !== 'universal') return true;

  if (type === 'metric' && !data.value && (data.html || data.content || data.summary)) return true;
  if (type === 'chart' && !Array.isArray(data.values) && !Array.isArray(data.data) && !Array.isArray(data.datasets)) return true;
  if (type === 'table' && !Array.isArray(data.rows) && !Array.isArray(data.data)) return true;
  if (type === 'html' && !data.html && !data.body && !(typeof data.content === 'string' && /<[a-z]/i.test(data.content as string))) return true;
  if (type === 'report' && !data.summary && !Array.isArray(data.highlights)) return true;
  if (type === 'adaptive' && !Array.isArray(data.sections) && !Array.isArray(data.blocks) && !Array.isArray(data.cards) && !(data.headline && typeof data.headline === 'object')) return true;
  if (type === 'gauge' && (typeof data.min !== 'number' && typeof data.max !== 'number')) return true;
  if (type === 'funnel' && !Array.isArray(data.stages) && !Array.isArray(data.steps)) return true;
  if (type === 'radar' && !Array.isArray(data.labels)) return true;
  if (type === 'heatmap' && !Array.isArray(data.rows) && !Array.isArray(data.cells)) return true;
  if (type === 'bullet' && typeof data.target !== 'number') return true;
  if (type === 'alert' && !Array.isArray(data.alerts) && !Array.isArray(data.events)) return true;
  if (type === 'map' && !Array.isArray(data.points) && !Array.isArray(data.locations)) return true;

  return false;
}
