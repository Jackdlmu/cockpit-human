import type { CockpitTemplate } from './types';

export const weatherTemplate: CockpitTemplate = {
  id: 'weather',
  name: '天气分析驾驶舱',
  domain: '气象',
  keywords: [
    '天气', '气温', '温度', '降水', '降雨', '湿度', '风力', '风向',
    ' forecast', 'weather', 'temperature', 'rain', 'sunny', 'cloudy',
    '空气质量', 'PM2.5', '雾霾', '紫外线', '穿衣', '出行',
  ],
  icon: 'Monitor',
  color: '#3b82f6',
  agentIds: [],
  primaryAgentId: '',
  description: '{{name}}实时监测与预报：温度趋势、空气质量、降水概率、穿衣建议',
  widgets: [
    {
      id: 'w-metric-temp',
      type: 'metric',
      title: '当前温度',
      position: { x: 0, y: 0, w: 3, h: 2 },
      data: { value: '26°C', change: '体感28°C', trend: 'up' },
    },
    {
      id: 'w-metric-aqi',
      type: 'metric',
      title: '空气质量',
      position: { x: 3, y: 0, w: 3, h: 2 },
      data: { value: '良', change: 'AQI 72', trend: 'flat' },
    },
    {
      id: 'w-metric-humidity',
      type: 'metric',
      title: '相对湿度',
      position: { x: 6, y: 0, w: 3, h: 2 },
      data: { value: '65%', change: '舒适', trend: 'flat' },
    },
    {
      id: 'w-metric-wind',
      type: 'metric',
      title: '风力风向',
      position: { x: 9, y: 0, w: 3, h: 2 },
      data: { value: '东南风3级', change: '3.4m/s', trend: 'flat' },
    },
    {
      id: 'w-chart-forecast',
      type: 'chart',
      title: '7日温度趋势',
      position: { x: 0, y: 2, w: 6, h: 4 },
      data: {
        labels: ['今天', '明天', '后天', '周四', '周五', '周六', '周日'],
        values: [26, 28, 25, 23, 22, 24, 27],
      },
    },
    {
      id: 'w-list-details',
      type: 'list',
      title: '逐日预报',
      position: { x: 6, y: 2, w: 6, h: 4 },
      data: {
        items: [
          '今天：晴转多云，26°C/18°C，东南风3级',
          '明天：多云，28°C/20°C，南风2级',
          '后天：小雨，25°C/19°C，东北风3级',
          '周四：阴，23°C/17°C，北风2级',
          '周五：晴，22°C/15°C，西北风3级',
          '周六：多云转晴，24°C/16°C，西风2级',
          '周日：晴，27°C/18°C，南风2级',
        ],
      },
    },
    {
      id: 'w-report-advice',
      type: 'report',
      title: '生活指数',
      position: { x: 0, y: 6, w: 12, h: 4 },
      data: {
        summary: '未来7天气温在22-28°C之间波动，周三有小雨，建议携带雨具。周末天气转晴，适合户外活动。空气质量整体良好。',
        highlights: [
          { label: '穿衣指数', value: '短袖+薄外套' },
          { label: '洗车指数', value: '周三不宜' },
          { label: '运动指数', value: '周末适宜' },
          { label: '防晒指数', value: '中等' },
        ],
        detail: {
          content: `# 生活指数详细建议

## 穿衣建议
- 周一至周二：短袖 + 薄外套，早晚温差较大
- 周三：建议携带雨具，穿防水外套
- 周四至周五：长袖衬衫 + 外套
- 周末：短袖即可，注意防晒

## 出行建议
- 周三小雨，路面湿滑，驾车注意减速
- 周末晴好，适合郊游、户外运动
- 空气质量良好，无需佩戴口罩

## 健康提示
- 温差变化时注意增减衣物，预防感冒
- 雨天湿度大，关节不适者注意保暖`,
        },
      },
    },
  ],
};
