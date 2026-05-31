// ─── Widget Type Inferer ───
// 根据 widget data 内容自动推断最佳 widget 类型
// 前后端共用逻辑（纯函数，无环境依赖）

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

  // 1. HTML 报告（最高优先级 — 避免被误判为 metric/universal）
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
  if (Array.isArray(funnelStages) && (funnelStages as any[]).length > 0) {
    const first = (funnelStages as any[])[0];
    if (typeof first === 'object' && first !== null &&
      (first.value !== undefined || first.rate !== undefined)) {
      return 'funnel';
    }
  }

  // 4. 热力图（cells/rows 含 x+y+value）
  const cellsSource = d.cells || d.rows;
  if (Array.isArray(cellsSource) && (cellsSource as any[]).length > 0) {
    const first = (cellsSource as any[])[0];
    if (typeof first === 'object' && first !== null &&
      ((first.x !== undefined && first.y !== undefined) || (first.column !== undefined && first.row !== undefined))) {
      return 'heatmap';
    }
  }

  // 5. 图表 — labels + values/datasets
  const hasLabels = Array.isArray(d.labels) || Array.isArray(d.categories) || Array.isArray(d.dimensions) || Array.isArray(d.names) || Array.isArray(d.xaxis) || Array.isArray(d.xAxis);
  const hasValues = Array.isArray(d.values) || Array.isArray(d.data) || Array.isArray(d.series) || Array.isArray(d.datasets) || Array.isArray(d.yValues) || Array.isArray(d.yaxis) || Array.isArray(d.yAxis) || Array.isArray(d.numbers);
  if (hasLabels || hasValues) {
    const valuesArr = (d.values || d.data || d.series || d.datasets || d.yValues || d.yaxis || d.yAxis || d.numbers) as any[];
    if (Array.isArray(valuesArr) && valuesArr.length > 0) return 'chart';
  }

  // 5. 表格
  const rowsSource = d.rows || d.data || d.records || d.entries;
  if (Array.isArray(rowsSource)) {
    const rows = rowsSource as any[];
    if (rows.length > 0) {
      const first = rows[0];
      if (Array.isArray(first) || (typeof first === 'object' && first !== null)) return 'table';
    }
  }

  // 6. 看板
  const stagesSource = d.stages || d.statuses || d.columns || d.phases;
  if (Array.isArray(stagesSource) && (stagesSource as any[]).length > 0) return 'kanban';

  // 7. 时间线
  const stepsSource = d.steps || d.milestones || d.events || d.nodes;
  if (Array.isArray(stepsSource) && (stepsSource as any[]).length > 0) return 'timeline';

  // 8. 状态面板 — items 数组且每个元素有 status/state
  const itemsSource = d.items || d.statuses || d.list;
  if (Array.isArray(itemsSource) && (itemsSource as any[]).length > 0) {
    const first = (itemsSource as any[])[0];
    if (typeof first === 'object' && first !== null &&
      (first.status !== undefined || first.state !== undefined || first.type !== undefined)) {
      return 'status';
    }
  }

  // 8.5 告警列表（alerts 字段优先）
  const alertsSource = d.alerts || d.events;
  if (Array.isArray(alertsSource) && (alertsSource as any[]).length > 0) {
    const first = (alertsSource as any[])[0];
    if (typeof first === 'object' && first !== null &&
      (first.level !== undefined || first.severity !== undefined || first.message !== undefined)) {
      return 'alert';
    }
  }

  // 9. 列表 — items 数组且每个元素是字符串或简单对象
  if (Array.isArray(itemsSource) && (itemsSource as any[]).length > 0) {
    if ((itemsSource as any[]).every((item: any) => typeof item === 'string' || typeof item === 'object')) {
      return 'list';
    }
  }

  // 14. 地图（points/locations 含 lat/lng 或 name+value）
  const pointsSource = d.points || d.locations || d.regions;
  if (Array.isArray(pointsSource) && (pointsSource as any[]).length > 0) {
    return 'map';
  }

  // 15. 报告
  if (typeof d.summary === 'string' && (d.summary as string).length > 0) return 'report';
  if (Array.isArray(d.highlights) && (d.highlights as any[]).length > 0) return 'report';
  if (Array.isArray(d.keyPoints) && (d.keyPoints as any[]).length > 0) return 'report';

  // 16. 指标卡 — 有 value 字段
  if (typeof d.value === 'string' || typeof d.value === 'number') {
    // 如果 value 是长文本（>50字符），不是指标卡
    if (!(typeof d.value === 'string' && (d.value as string).length > 50)) {
      return 'metric';
    }
  }

  // 17. 纯文本/Markdown（较长内容）
  const longContent = typeof d.content === 'string' && (d.content as string).length > 20;
  const longText = typeof d.text === 'string' && (d.text as string).length > 20;
  const longMarkdown = typeof d.markdown === 'string' && (d.markdown as string).length > 20;
  if (longContent || longText || longMarkdown) return 'universal';

  return 'universal';
}

/**
 * 判断 widget type 与数据是否明显不匹配
 * 返回 true 时建议用 inferWidgetType 修正
 */
export function isTypeMismatched(type: string, data: Record<string, unknown>): boolean {
  if (!data || typeof data !== 'object') return false;
  const inferred = inferWidgetType(data);
  if (type === inferred) return false;

  if (type === 'metric' && inferred !== 'metric' && inferred !== 'universal') return true;
  if (type === 'universal' && inferred !== 'universal') return true;

  // 明显的严重不匹配
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
