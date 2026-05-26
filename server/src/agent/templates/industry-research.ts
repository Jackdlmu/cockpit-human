import type { CockpitTemplate } from './types';

/**
 * 行业研究分析模板
 * 适用于行业趋势分析、投资研究、市场调研、技术演进跟踪等场景
 */
export const industryResearchTemplate: CockpitTemplate = {
  id: 'industry-research',
  name: '行业研究驾驶舱',
  domain: '行业研究',
  keywords: [
    '行业', '研究', '分析', '趋势', '投资', '融资', '市场', '竞争', '政策',
    '大模型', 'AI', '人工智能', '赛道', '赛道分析', '产业', '研报', '洞察',
    'industry', 'research', 'analysis', 'trend', 'investment', 'market',
    'competitive', 'policy', 'llm', 'generative', 'frontier',
  ],
  icon: 'Target',
  color: '#6366f1',
  agentIds: [],
  primaryAgentId: '',
  description: '{{name}}全景分析：市场规模、投融资动态、技术演进、竞争格局与政策环境',
  widgets: [
    {
      id: 'w-metric-market-size',
      type: 'metric',
      title: '市场规模',
      position: { x: 0, y: 0, w: 3, h: 2 },
      data: { value: '1,860亿', change: '+38.5%', trend: 'up' },
    },
    {
      id: 'w-metric-investment',
      type: 'metric',
      title: '年度融资额',
      position: { x: 3, y: 0, w: 3, h: 2 },
      data: { value: '420亿', change: '+65%', trend: 'up' },
    },
    {
      id: 'w-metric-companies',
      type: 'metric',
      title: '活跃企业数',
      position: { x: 6, y: 0, w: 3, h: 2 },
      data: { value: '320+', change: '+28%', trend: 'up' },
    },
    {
      id: 'w-metric-patents',
      type: 'metric',
      title: '专利申请量',
      position: { x: 9, y: 0, w: 3, h: 2 },
      data: { value: '12,800', change: '+42%', trend: 'up' },
    },
    {
      id: 'w-chart-investment-trend',
      type: 'chart',
      title: '投融资趋势',
      position: { x: 0, y: 2, w: 6, h: 4 },
      data: {
        labels: ['2021', '2022', '2023', '2024', '2025E'],
        values: [120, 280, 520, 980, 1860],
      },
    },
    {
      id: 'w-timeline-tech',
      type: 'timeline',
      title: '技术演进路线',
      position: { x: 6, y: 2, w: 6, h: 4 },
      data: {
        steps: [
          '2017 Transformer 架构诞生',
          '2020 GPT-3 发布（1750亿参数）',
          '2022 ChatGPT 引爆全球',
          '2023 多模态大模型爆发',
          '2024 Agent 与推理能力突破',
          '2025 端侧大模型与产业落地',
        ],
      },
    },
    {
      id: 'w-table-competition',
      type: 'table',
      title: '竞争格局',
      position: { x: 0, y: 6, w: 6, h: 4 },
      data: {
        rows: [
          ['OpenAI', 'GPT-4o / o1', '美国', '1000亿+'],
          ['Anthropic', 'Claude 3.5', '美国', '400亿'],
          ['Google', 'Gemini 2.0', '美国', '母公司支持'],
          ['Meta', 'Llama 3', '美国', '开源生态'],
          ['字节跳动', '豆包 / 云雀', '中国', '100亿+'],
          ['阿里巴巴', '通义千问', '中国', '80亿+'],
          ['百度', '文心一言', '中国', '50亿+'],
        ],
      },
    },
    {
      id: 'w-list-policy',
      type: 'list',
      title: '政策法规动态',
      position: { x: 6, y: 6, w: 6, h: 4 },
      data: {
        items: [
          '欧盟《人工智能法案》正式生效，按风险分级监管',
          '中国《生成式人工智能服务管理暂行办法》持续完善',
          '美国商务部限制高端AI芯片对华出口',
          '国内多省市出台大模型产业扶持政策',
          '数据安全法与个人信息保护法合规要求趋严',
        ],
      },
    },
    {
      id: 'w-report-deep',
      type: 'report',
      title: '行业深度报告',
      position: { x: 0, y: 10, w: 12, h: 4 },
      data: {
        summary: '大模型行业2024年市场规模达1,860亿元，同比增长38.5%。全球融资总额超过420亿美元，头部企业加速多模态与Agent能力布局。技术层面，推理效率提升与端侧部署成为新焦点。监管环境日趋完善，合规能力成为企业核心竞争力。',
        highlights: [
          { label: '市场规模', value: '1,860亿元' },
          { label: '年增长率', value: '+38.5%' },
          { label: '头部企业', value: 'OpenAI、Anthropic、字节' },
          { label: '关键趋势', value: 'Agent、端侧、多模态' },
        ],
        source: '行业研究分析',
        detail: {
          content: `# 大模型行业深度分析报告

## 一、市场规模与增长

2024年中国大模型市场规模达到 **1,860亿元**，同比增长38.5%。全球市场同步高速增长，预计2025年全球市场规模将突破 **2,500亿美元**。

增长驱动力：
- 企业数字化转型加速，AI原生应用爆发
- 算力成本持续下降，模型训练门槛降低
- 开源生态繁荣（Llama、Qwen、DeepSeek等）

## 二、投融资动态

2024年全球大模型领域融资总额超过 **420亿美元**，较2023年增长65%。

重点融资事件：
- OpenAI：完成66亿美元融资，估值1,570亿美元
- Anthropic：获得40亿美元追加投资
- 中国头部企业：字节、阿里、百度合计投入超200亿元

## 三、技术演进趋势

1. **多模态融合**：文本、图像、音频、视频统一建模
2. **Agent化**：从对话助手向自主任务执行演进
3. **端侧部署**：轻量化模型在手机、IoT设备落地
4. **推理优化**：MoE架构、投机解码、量化压缩

## 四、竞争格局

全球形成"一超多强"格局：
- 美国：OpenAI（闭源领先）、Meta（开源生态）
- 中国：字节（应用驱动）、阿里（云服务）、百度（先发优势）

## 五、政策与监管

- 欧盟AI法案：全球首部综合性AI监管法律
- 中国：生成式AI管理办法+数据安全法双重约束
- 美国：出口管制+行政令，限制高端芯片与模型技术外流

## 六、展望

2025年关键看点：
- Agent 应用大规模商业化
- 端侧大模型成为手机标配
- 具身智能与机器人结合突破
- 行业垂直模型深度落地`,
        },
      },
    },
  ],
};
