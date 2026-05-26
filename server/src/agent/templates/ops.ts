import type { CockpitTemplate } from './types';

export const opsTemplate: CockpitTemplate = {
  id: 'ops',
  name: '系统监控大屏',
  domain: '运维',
  keywords: [
    '监控', '系统', '运维', '服务器', '告警', '故障', '性能', '日志',
    'CPU', '内存', '磁盘', '网络', '延迟', '可用性', '容器', 'K8s',
    'monitor', 'ops', 'alert', 'server', 'performance', 'infrastructure',
  ],
  icon: 'Monitor',
  color: '#ef4444',
  agentIds: ['it-agent', 'customer-service-agent'],
  primaryAgentId: 'it-agent',
  description: '实时监控系统运行状态，IT运维助手+客服小助手联合保障',
  widgets: [
    {
      id: 'w-metric-uptime',
      type: 'metric',
      title: '系统可用性',
      position: { x: 0, y: 0, w: 3, h: 2 },
      data: { value: '99.98%', change: '+0.02%', trend: 'up' },
      dataSource: {
        type: 'skill',
        skillId: 'ops.getSystemUptime',
        agentId: 'it-agent',
        transform: '({ uptime, change }) => ({ value: `${(uptime*100).toFixed(2)}%`, change: `${change>0?"+":""}${(change*100).toFixed(2)}%`, trend: change>0?"up":"down" })',
        fallbackToStatic: true,
      },
    },
    {
      id: 'w-metric-alerts',
      type: 'metric',
      title: '活跃告警',
      position: { x: 3, y: 0, w: 3, h: 2 },
      data: { value: '3条', change: '-2', trend: 'up' },
      dataSource: {
        type: 'skill',
        skillId: 'ops.getActiveAlerts',
        agentId: 'it-agent',
        transform: '({ count, change }) => ({ value: String(count), change: `${change>0?"+":""}${change}`, trend: change>0?"up":"down" })',
        fallbackToStatic: true,
      },
    },
    {
      id: 'w-list-alerts',
      type: 'list',
      title: '告警列表',
      position: { x: 0, y: 2, w: 6, h: 4 },
      data: { items: ['CPU使用率超过85% - api-gateway-01', '内存不足告警 - redis-cluster-02', '磁盘空间不足 - log-storage-03'] },
      dataSource: {
        type: 'event',
        eventFilter: { source: 'it-agent', type: 'alert.new' },
        fallbackToStatic: true,
      },
    },
    {
      id: 'w-chart-usage',
      type: 'chart',
      title: 'CPU/内存趋势',
      position: { x: 6, y: 0, w: 6, h: 6 },
      data: { labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'], values: [32, 28, 45, 68, 72, 55] },
      dataSource: {
        type: 'skill',
        skillId: 'ops.getResourceUsageTrend',
        agentId: 'it-agent',
        input: { metric: 'cpu', points: 6 },
        transform: '({ labels, values }) => ({ labels, values })',
        fallbackToStatic: true,
      },
    },
  ],
};
