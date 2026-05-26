// ─── Entity Extractors ───
// 增强实体提取：支持名称、时间、区域、部门、指标名、数字等

import type { EntityExtractor } from './types';

const extractors: Map<string, EntityExtractor> = new Map();

export function registerExtractor(extractor: EntityExtractor): void {
  extractors.set(extractor.id, extractor);
}

export function getExtractor(id: string): EntityExtractor | undefined {
  return extractors.get(id);
}

export function runExtractors(ids: string[], command: string): Record<string, string> {
  const entities: Record<string, string> = {};
  for (const id of ids) {
    const extractor = getExtractor(id);
    if (extractor) {
      const result = extractor.extract(command);
      Object.assign(entities, result);
    }
  }
  return entities;
}

// ── 内置提取器 ──

/** 驾驶舱名称提取 */
registerExtractor({
  id: 'cockpit-name',
  name: '驾驶舱名称',
  extract: (command: string) => {
    const entities: Record<string, string> = {};
    const suffixes = ['驾驶舱', '工作台', 'dashboard'];
    let suffixIdx = -1;
    for (const s of suffixes) {
      const idx = command.toLowerCase().indexOf(s.toLowerCase());
      if (idx >= 0 && (suffixIdx < 0 || idx < suffixIdx)) {
        suffixIdx = idx;
      }
    }

    if (suffixIdx >= 0) {
      const prefix = command.slice(0, suffixIdx);
      const actions = ['帮我', '请', '给我', '为', '想要', '需要'];
      const verbs = ['创建', '新建', '做', '搭建', '生成', '删除', '移除', '规划', '设计'];
      const quantifiers = ['一个', '个', '的'];

      let start = 0;
      for (const a of actions) {
        if (prefix.slice(start).startsWith(a)) start += a.length;
      }
      for (const v of verbs) {
        if (prefix.slice(start).startsWith(v)) start += v.length;
      }
      for (const q of quantifiers) {
        if (prefix.slice(start).startsWith(q)) start += q.length;
      }

      let name = prefix.slice(start).trim();
      // 过滤掉技术术语和不友好的前缀
      if (name) {
        // 去除 "ID为xxx的"、"ws-xxx的" 等技术术语
        name = name.replace(/ID为[\w-]+的?/gi, '')
                   .replace(/ws-[-\w]+的?/gi, '')
                   .replace(/在?ID为/gi, '')
                   .replace(/^[在从对向往]/, '')
                   .trim();
        // 去除末尾的"的"
        name = name.replace(/的$/, '').trim();
        if (name) entities.cockpitType = name;
      }
    }

    // 也尝试匹配引号内的名称
    const quoteMatch = command.match(/["']([^"']+?)["']/);
    if (quoteMatch && !entities.cockpitType) {
      entities.cockpitType = quoteMatch[1];
    }

    return entities;
  },
});

/** 时间范围提取 */
registerExtractor({
  id: 'time-range',
  name: '时间范围',
  extract: (command: string) => {
    const entities: Record<string, string> = {};
    const timePatterns = [
      { pattern: /本月|这个月|当月/, value: '本月' },
      { pattern: /本季度|这个季度|当季/, value: '本季度' },
      { pattern: /今年|本年度|当年/, value: '今年' },
      { pattern: /上周|上个星期/, value: '上周' },
      { pattern: /最近\d+天/, value: null as string | null }, // 动态提取
      { pattern: /过去\d+天/, value: null as string | null },
      { pattern: /\d+年\d+月/, value: null as string | null },
      { pattern: /昨天|昨日/, value: '昨天' },
      { pattern: /今天|当日/, value: '今天' },
    ];

    for (const tp of timePatterns) {
      const match = command.match(tp.pattern);
      if (match) {
        entities.timeRange = tp.value ?? match[0];
        break;
      }
    }

    return entities;
  },
});

/** 区域提取 */
registerExtractor({
  id: 'region',
  name: '区域',
  extract: (command: string) => {
    const entities: Record<string, string> = {};
    const regionPatterns = [
      /(华东|华南|华北|华中|西南|西北|东北)区?/,
      /(北京|上海|广州|深圳|杭州|成都|武汉|西安|南京|苏州|天津|重庆|青岛|大连|厦门|宁波)/,
      /(粤港澳大湾区|长三角|珠三角|京津冀|成渝)/,
    ];

    for (const pattern of regionPatterns) {
      const match = command.match(pattern);
      if (match) {
        entities.region = match[1] || match[0];
        break;
      }
    }

    return entities;
  },
});

/** 部门提取 */
registerExtractor({
  id: 'department',
  name: '部门',
  extract: (command: string) => {
    const entities: Record<string, string> = {};
    const deptPatterns = [
      /(销售|市场|营销|财务|人力|HR|技术|研发|产品|运营|客服|法务|供应链|采购|行政|管理)部?/,
    ];

    for (const pattern of deptPatterns) {
      const match = command.match(pattern);
      if (match) {
        entities.department = match[1];
        break;
      }
    }

    return entities;
  },
});

/** 指标名提取 */
registerExtractor({
  id: 'metric-name',
  name: '指标名',
  extract: (command: string) => {
    const entities: Record<string, string> = {};
    const metricPatterns = [
      /(销售额|营收|收入|利润|毛利率|净利润|ROI|转化率|留存率|活跃度|客单价|订单量|用户数|DAU|MAU)/,
      /(库存|周转率|缺货率|交付准时率|采购成本)/,
      /(审批|报销|预算|支出|费用|成本)/,
      /(入职|离职|招聘|考勤|绩效|培训)/,
      /(可用性|响应时间|故障率|告警|CPU|内存|磁盘)/,
    ];

    for (const pattern of metricPatterns) {
      const match = command.match(pattern);
      if (match) {
        entities.metricName = match[1];
        break;
      }
    }

    return entities;
  },
});

/** 数字提取 */
registerExtractor({
  id: 'number',
  name: '数字',
  extract: (command: string) => {
    const entities: Record<string, string> = {};
    const numMatch = command.match(/(\d+)/);
    if (numMatch) entities.number = numMatch[1];
    return entities;
  },
});

/** 动作/操作提取（用于识别删除等操作） */
registerExtractor({
  id: 'action',
  name: '动作',
  extract: (command: string) => {
    const entities: Record<string, string> = {};
    const lower = command.toLowerCase();

    if (/删除|移除|删掉|去掉/.test(lower)) entities.action = 'delete';
    else if (/创建|新建|生成|搭建|添加/.test(lower)) entities.action = 'create';
    else if (/更新|修改|编辑|调整/.test(lower)) entities.action = 'update';
    else if (/查询|查看|搜索/.test(lower)) entities.action = 'query';
    else if (/执行|运行|启动/.test(lower)) entities.action = 'execute';

    return entities;
  },
});
