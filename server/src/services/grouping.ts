import type { WorkspaceGrouping } from '../data/workspacesData';
import type { GroupingPolicy } from './grouping-policy';

interface GroupableWidget {
  id: string;
  title: string;
  group?: string;
}

const GROUP_KEYWORDS: Array<{ keywords: string[]; name: string }> = [
  { keywords: ['财务', '营收', '营业收入', '利润', '现金流', '资产', '负债', '毛利率', '净利润', '预算', '成本', '费用', '市值', '估值', '股票', '收入', '盈利', '亏损', 'ROI', 'ROE'], name: '财务指标' },
  { keywords: ['人力', '员工', '招聘', '绩效', '薪酬', '入职', '离职', '人才', '组织', '人均', '人力资本', 'HR', '考勤', '培训', '福利'], name: '人力资源' },
  { keywords: ['销售', '客户', '订单', '转化', '渠道', '商机', '成交', '客单价', '复购', '留存', 'CRM', '线索', '漏斗'], name: '销售分析' },
  { keywords: ['运营', '生产', '交付', '质量', 'OEE', '产能', '产线', '设备', '良品率', '准时交付', '制造', '工厂', '工单'], name: '运营管理' },
  { keywords: ['市场', '品牌', '营销', 'ROI', '获客', '曝光', '点击', '投放', '推广', '线索', '广告', '活动', 'Campaign'], name: '市场营销' },
  { keywords: ['战略', '目标', '里程碑', '风险', '合规', '治理', 'ESG', '董事会', '年报', '规划', '愿景', 'SWOT'], name: '战略总览' },
  { keywords: ['研发', '技术', '代码', '专利', '创新', '产品', '项目', '进度', '里程碑', 'DORA', 'bug', '缺陷', '测试', '发布'], name: '研发效能' },
  { keywords: ['供应链', '库存', '采购', '供应商', '物流', '仓储', '交付周期', '物料', '进销存'], name: '供应链' },
];

function inferGroupNameByTitle(title: string): string {
  const lower = title.toLowerCase();
  for (const rule of GROUP_KEYWORDS) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      return rule.name;
    }
  }
  return '综合分析';
}

function mergeSmallGroups(
  groups: Array<{ id: string; name: string; widgetIds: string[] }>,
  minSize = 2
): Array<{ id: string; name: string; widgetIds: string[] }> {
  const result: Array<{ id: string; name: string; widgetIds: string[] }> = [];
  let pending: Array<{ id: string; name: string; widgetIds: string[] }> | null = null;

  for (const g of groups) {
    if (g.widgetIds.length >= minSize) {
      if (pending) {
        // 合并之前的小分组到当前组
        result.push({
          ...g,
          name: g.widgetIds.length >= pending.widgetIds.length ? g.name : `${g.name} / ${pending.name}`,
          widgetIds: [...pending.widgetIds, ...g.widgetIds],
        });
        pending = null;
      } else {
        result.push(g);
      }
    } else {
      if (pending) {
        // 连续两个小分组，合并它们
        pending = {
          ...pending,
          name: `${pending.name} / ${g.name}`,
          widgetIds: [...pending.widgetIds, ...g.widgetIds],
        };
      } else {
        pending = g;
      }
    }
  }

  if (pending) {
    // 最后一个pending，尝试合并到前一个结果
    if (result.length > 0) {
      const last = result[result.length - 1];
      result[result.length - 1] = {
        ...last,
        name: `${last.name} / ${pending.name}`,
        widgetIds: [...last.widgetIds, ...pending.widgetIds],
      };
    } else {
      result.push(pending);
    }
  }

  return result;
}

function mergeToMaxGroups(
  groups: Array<{ id: string; name: string; widgetIds: string[] }>,
  maxGroups: number
): Array<{ id: string; name: string; widgetIds: string[] }> {
  if (groups.length <= maxGroups) return groups;

  // 按widget数量从小到大排序，优先合并小组件
  const sorted = [...groups].sort((a, b) => a.widgetIds.length - b.widgetIds.length);
  let merged = sorted;

  while (merged.length > maxGroups) {
    // 合并最小的两个
    const first = merged[0];
    const second = merged[1];
    const combined = {
      id: `${first.id}-${second.id}`,
      name: `${first.name} / ${second.name}`,
      widgetIds: [...first.widgetIds, ...second.widgetIds],
    };
    merged = [combined, ...merged.slice(2)].sort((a, b) => a.widgetIds.length - b.widgetIds.length);
  }

  // 保持原始顺序
  const orderMap = new Map(groups.map((g, i) => [g.id, i]));
  return merged.sort((a, b) => {
    const aFirst = groups.find((g) => a.widgetIds.includes(g.widgetIds[0]));
    const bFirst = groups.find((g) => b.widgetIds.includes(g.widgetIds[0]));
    return (orderMap.get(aFirst?.id || '') ?? 0) - (orderMap.get(bFirst?.id || '') ?? 0);
  });
}

/**
 * 根据 widgets 和全局策略推断分组配置
 * - widgets.length <= 4：返回 undefined（不分组）
 * - strategy='auto'：按 group 字段聚类，无 group 则按 title 关键词推断
 * - strategy='manual'：严格遵循 manualGroups，只使用预定义标签分组
 * @param policy 全局分组策略
 */
export function autoGroupWidgets(
  widgets: GroupableWidget[],
  policy?: GroupingPolicy
): WorkspaceGrouping | undefined {
  if (!widgets || widgets.length <= 4) {
    return undefined;
  }

  const isManual = policy?.strategy === 'manual';
  const manualGroups = isManual ? (policy.manualGroups || []) : [];

  const groupMap = new Map<string, string[]>();

  if (isManual) {
    // 手动模式：严格按 manualGroups 分组
    for (const g of manualGroups) {
      groupMap.set(g, []);
    }
    // 综合分析兜底组
    groupMap.set('综合分析', []);

    for (const w of widgets) {
      const gid = w.group?.trim() || '';
      if (gid && groupMap.has(gid)) {
        groupMap.get(gid)!.push(w.id);
      } else {
        // 未匹配到预定义标签的，尝试 title 关键词匹配 manualGroups
        let matched = false;
        const lowerTitle = w.title.toLowerCase();
        for (const mg of manualGroups) {
          if (lowerTitle.includes(mg.toLowerCase())) {
            groupMap.get(mg)!.push(w.id);
            matched = true;
            break;
          }
        }
        if (!matched) {
          groupMap.get('综合分析')!.push(w.id);
        }
      }
    }

    // 构建分组列表，保持原始 widget 顺序
    const orderMap = new Map(widgets.map((ww, i) => [ww.id, i]));
    const groups: Array<{ id: string; name: string; widgetIds: string[] }> = [];
    for (const g of manualGroups) {
      const widgetIds = groupMap.get(g) || [];
      if (widgetIds.length === 0) continue;
      widgetIds.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
      groups.push({ id: g, name: g, widgetIds });
    }
    // 综合分析组（如果有内容）
    const fallbackIds = groupMap.get('综合分析') || [];
    if (fallbackIds.length > 0) {
      fallbackIds.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
      groups.push({ id: '综合分析', name: '综合分析', widgetIds: fallbackIds });
    }

    if (groups.length < 2) return undefined;
    return {
      enabled: true,
      mode: policy?.mode || 'tabs-flow',
      groups,
    };
  }

  // 自动模式（原有逻辑）
  for (const w of widgets) {
    const gid = w.group?.trim() || '';
    if (!gid) continue;
    if (!groupMap.has(gid)) groupMap.set(gid, []);
    groupMap.get(gid)!.push(w.id);
  }

  const ungrouped = widgets.filter((w) => !w.group?.trim());
  for (const w of ungrouped) {
    const inferredName = inferGroupNameByTitle(w.title);
    if (!groupMap.has(inferredName)) groupMap.set(inferredName, []);
    groupMap.get(inferredName)!.push(w.id);
  }

  const seen = new Set<string>();
  const groups: Array<{ id: string; name: string; widgetIds: string[] }> = [];

  for (const w of widgets) {
    const gid = w.group?.trim() || inferGroupNameByTitle(w.title);
    if (seen.has(gid)) continue;
    seen.add(gid);
    const widgetIds = groupMap.get(gid) || [];
    if (widgetIds.length === 0) continue;
    const orderMap = new Map(widgets.map((ww, i) => [ww.id, i]));
    widgetIds.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
    groups.push({ id: gid, name: gid, widgetIds });
  }

  const merged = mergeSmallGroups(groups, 2);
  const finalGroups = merged.length > 6 ? mergeToMaxGroups(merged, 6) : merged;

  if (finalGroups.length < 2) {
    return undefined;
  }

  return {
    enabled: true,
    mode: policy?.mode || 'tabs-flow',
    groups: finalGroups,
  };
}

/**
 * 从模板 grouping 配置中，根据 widgets 重新构建分组映射
 * 用于 personalizeTemplate 后重新映射 widgetIds
 */
export function remapTemplateGrouping(
  templateGrouping: WorkspaceGrouping | undefined,
  widgetIdMap: Map<string, string>
): WorkspaceGrouping | undefined {
  if (!templateGrouping || !templateGrouping.enabled || !templateGrouping.groups) {
    return undefined;
  }

  return {
    enabled: templateGrouping.enabled,
    mode: templateGrouping.mode,
    groups: templateGrouping.groups
      .map((g) => ({
        ...g,
        widgetIds: g.widgetIds
          .map((oldId) => widgetIdMap.get(oldId))
          .filter((id): id is string => !!id),
      }))
      .filter((g) => g.widgetIds.length > 0),
  };
}
