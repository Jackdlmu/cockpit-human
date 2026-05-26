export interface AgentData {
  id: string;
  name: string;
  avatar: string;
  description: string;
  status: 'active' | 'idle' | 'error' | 'building';
  category: string;
  skills: string[];
  usageCount: number;
  lastUsed: string;
  owner: string;
  businessData?: {
    kpis: Array<{ label: string; value: string; change: string; trend: 'up' | 'down' | 'neutral' }>;
    charts: Array<{ title: string; type: 'bar' | 'line' | 'funnel'; labels: string[]; values: number[] }>;
    tables: Array<{ title: string; columns: Array<{key: string; label: string; width?: string}>; rows: Record<string, string | number>[] }>;
    alerts: Array<{ level: 'info' | 'warning' | 'critical'; message: string; time: string }>;
  };
}

export const agentsData: AgentData[] = [
  {
    id: 'sales-agent',
    name: '销售助手',
    avatar: '📊',
    description: '智能分析销售数据、跟进客户、预测业绩，为销售团队提供数据驱动的决策支持',
    status: 'active',
    category: '销售',
    skills: ['数据分析', '客户管理', '业绩预测', '报表生成'],
    usageCount: 2847,
    lastUsed: '2分钟前',
    owner: '李明',
    businessData: {
      kpis: [
        { label: '本月销售额', value: '¥2,847万', change: '+23%', trend: 'up' },
        { label: '新增客户', value: '156家', change: '+18%', trend: 'up' },
        { label: '成交率', value: '68.5%', change: '-2.1%', trend: 'down' },
        { label: '平均客单价', value: '¥18.2万', change: '+5.3%', trend: 'up' },
      ],
      charts: [
        { title: '月度业绩趋势', type: 'bar', labels: ['7月','8月','9月','10月','11月'], values: [820,956,1071,1250,1420] },
        { title: '销售漏斗转化', type: 'funnel', labels: ['线索','接触','确认','方案','谈判','成交'], values: [3200,1850,1200,780,420,195] },
      ],
      tables: [
        {
          title: 'Top 10 客户排行',
          columns: [{key:'rank',label:'排名',width:'50px'},{key:'customer',label:'客户',width:'140px'},{key:'amount',label:'成交额',width:'100px'},{key:'status',label:'状态',width:'80px'}],
          rows: [
            {rank:1,customer:'华为技术',amount:'¥580万',status:'已签约'},
            {rank:2,customer:'阿里巴巴',amount:'¥420万',status:'已签约'},
            {rank:3,customer:'腾讯科技',amount:'¥365万',status:'谈判中'},
            {rank:4,customer:'比亚迪',amount:'¥310万',status:'已签约'},
            {rank:5,customer:'小米集团',amount:'¥285万',status:'已签约'},
            {rank:6,customer:'宁德时代',amount:'¥240万',status:'谈判中'},
            {rank:7,customer:'美团',amount:'¥195万',status:'意向'},
            {rank:8,customer:'京东集团',amount:'¥170万',status:'已签约'},
            {rank:9,customer:'字节跳动',amount:'¥155万',status:'谈判中'},
            {rank:10,customer:'海康威视',amount:'¥138万',status:'意向'},
          ]
        }
      ],
      alerts: [
        { level:'warning', message:'腾讯科技合同即将到期（剩余15天），建议安排续约谈判', time:'10分钟前' },
        { level:'info', message:'宁德时代Q4采购订单已确认，预计新增¥240万收入', time:'1小时前' },
        { level:'critical', message:'3个重点客户在本周无跟进记录，可能存在流失风险', time:'3小时前' },
        { level:'info', message:'华东区Q3目标完成率112%，超额完成¥347万', time:'昨天' },
      ]
    }
  },
  {
    id: 'hr-agent', name: 'HR智能助手', avatar: '👤',
    description: '处理招聘、入职、考勤、绩效等HR全流程事务，自动化人事管理',
    status: 'active', category: '人力资源', skills: ['招聘管理','入职流程','考勤统计','绩效评估'],
    usageCount: 1923, lastUsed: '15分钟前', owner: '王芳',
    businessData: {
      kpis: [
        { label: '本月入职', value: '12人', change: '+3', trend: 'up' },
        { label: '在招职位', value: '28个', change: '+5', trend: 'up' },
        { label: '离职率', value: '3.2%', change: '-0.8%', trend: 'up' },
        { label: '平均招聘周期', value: '18天', change: '-3天', trend: 'up' },
      ],
      charts: [
        { title: '月度人员变动', type: 'bar', labels: ['7月','8月','9月','10月','11月'], values: [8,12,10,15,12] },
        { title: '部门人员分布', type: 'bar', labels: ['技术','销售','市场','运营','财务','HR'], values: [85,62,38,45,22,15] },
      ],
      tables: [{ title: '待入职员工', columns: [{key:'name',label:'姓名',width:'80px'},{key:'dept',label:'部门',width:'80px'},{key:'date',label:'入职日期',width:'100px'},{key:'status',label:'进度',width:'100px'}], rows: [{name:'王小明',dept:'技术部',date:'12/01',status:'待确认'},{name:'李红',dept:'市场部',date:'12/03',status:'信息录入'},{name:'张伟',dept:'销售部',date:'12/05',status:'IT开通'}] }],
      alerts: [{ level:'warning', message:'技术部3个offer待发放，候选人等待已超过5天', time:'30分钟前' },{ level:'info', message:'本月考勤异常申请已处理完毕，共通过47笔', time:'2小时前' },{ level:'critical', message:'销售部Q3绩效评估截止倒计时3天，尚有8人未提交', time:'5小时前' }]
    }
  },
  {
    id: 'finance-agent', name: '财务管家', avatar: '💰',
    description: '智能审核报销、生成财务报表、风险预警，确保财务合规',
    status: 'active', category: '财务', skills: ['报销审核','报表生成','风险预警','预算管理'],
    usageCount: 3562, lastUsed: '刚刚', owner: '张华',
    businessData: {
      kpis: [
        { label: '本月支出', value: '¥1,240万', change: '+8%', trend: 'up' },
        { label: '待审批', value: '8笔', change: '-2', trend: 'up' },
        { label: '预算执行率', value: '76.3%', change: '+4.2%', trend: 'up' },
        { label: '异常检测', value: '2项', change: '-1', trend: 'up' },
      ],
      charts: [
        { title: '月度支出趋势', type: 'bar', labels: ['7月','8月','9月','10月','11月'], values: [980,1050,1120,1080,1240] },
        { title: '费用类别占比', type: 'bar', labels: ['差旅','采购','人力','市场','IT','其他'], values: [320,280,450,180,120,90] },
      ],
      tables: [{ title: '待审批列表', columns: [{key:'applicant',label:'申请人',width:'80px'},{key:'type',label:'类型',width:'80px'},{key:'amount',label:'金额',width:'100px'},{key:'priority',label:'优先级',width:'80px'}], rows: [{applicant:'张明',type:'差旅费',amount:'¥4,580',priority:'紧急'},{applicant:'李娜',type:'采购',amount:'¥12,000',priority:'普通'},{applicant:'王强',type:'补贴',amount:'¥2,400',priority:'普通'}] }],
      alerts: [{ level:'critical', message:'Q4预算使用率已达76%，建议控制非必要支出', time:'刚刚' },{ level:'warning', message:'发现2笔异常报销，金额合计¥18,600，建议人工复核', time:'1小时前' },{ level:'info', message:'11月财务报表已自动生成，可查看详情', time:'3小时前' }]
    }
  },
  {
    id: 'supply-chain-agent', name: '供应链管家', avatar: '📦',
    description: '监控库存、优化采购、跟踪物流，确保供应链高效运转',
    status: 'idle', category: '供应链', skills: ['库存管理','采购优化','物流跟踪','需求预测'],
    usageCount: 1284, lastUsed: '3小时前', owner: '赵强',
    businessData: {
      kpis: [
        { label: '库存周转', value: '8.5次', change: '+1.2', trend: 'up' },
        { label: '缺货率', value: '1.2%', change: '-0.5%', trend: 'up' },
        { label: '采购成本', value: '¥680万', change: '-3%', trend: 'up' },
        { label: '交付准时率', value: '94.8%', change: '+2.1%', trend: 'up' },
      ],
      charts: [{ title: '库存水位变化', type: 'line', labels: ['周一','周二','周三','周四','周五','周六','周日'], values: [72,68,75,82,78,85,80] }],
      tables: [{ title: '采购订单跟踪', columns: [{key:'order',label:'订单号',width:'100px'},{key:'supplier',label:'供应商',width:'100px'},{key:'amount',label:'金额',width:'80px'},{key:'status',label:'状态',width:'80px'}], rows: [{order:'PO-2025-1121',supplier:'华为供应',amount:'¥85万',status:'运输中'},{order:'PO-2025-1118',supplier:'联想供应',amount:'¥42万',status:'已入库'}] }],
      alerts: [{ level:'warning', message:'A类物料库存低于安全线（剩3天用量），建议紧急补货', time:'2小时前' },{ level:'info', message:'Q4供应商评估已完成，Top3供应商续约建议已生成', time:'昨天' }]
    }
  },
  {
    id: 'marketing-agent', name: '营销智脑', avatar: '🎯',
    description: '分析市场趋势、优化投放策略、追踪营销ROI',
    status: 'active', category: '市场营销', skills: ['市场分析','投放优化','ROI追踪','竞品监控'],
    usageCount: 2156, lastUsed: '1小时前', owner: '刘洋',
    businessData: {
      kpis: [
        { label: '本月ROI', value: '4.8x', change: '+0.6', trend: 'up' },
        { label: '获客成本', value: '¥185', change: '-12%', trend: 'up' },
        { label: '线索转化', value: '12.5%', change: '+1.8%', trend: 'up' },
        { label: '品牌曝光', value: '520万次', change: '+28%', trend: 'up' },
      ],
      charts: [
        { title: '渠道ROI对比', type: 'bar', labels: ['搜索','信息流','抖音','微信','B站'], values: [5.2,3.8,4.1,3.5,2.8] },
        { title: '投放转化漏斗', type: 'funnel', labels: ['曝光','点击','留资','试用','付费'], values: [50000,8500,3200,890,245] },
      ],
      tables: [{ title: '渠道表现', columns: [{key:'channel',label:'渠道',width:'100px'},{key:'spend',label:'花费',width:'80px'},{key:'roi',label:'ROI',width:'60px'},{key:'leads',label:'线索',width:'60px'}], rows: [{channel:'百度搜索',spend:'¥45万',roi:'5.2x',leads:'420'},{channel:'信息流',spend:'¥32万',roi:'3.8x',leads:'380'},{channel:'抖音',spend:'¥28万',roi:'4.1x',leads:'520'}] }],
      alerts: [{ level:'info', message:'抖音渠道本周ROI突破4.5x，建议增加预算投入', time:'30分钟前' },{ level:'warning', message:'竞品A本周加大搜索投放，我们的品牌词CTR下降15%', time:'2小时前' }]
    }
  },
  {
    id: 'it-agent', name: 'IT运维助手', avatar: '⚙️',
    description: '监控系统状态、自动化运维、故障排查与预警',
    status: 'error', category: 'IT运维', skills: ['系统监控','故障排查','自动化部署','安全审计'],
    usageCount: 3421, lastUsed: '5分钟前', owner: '陈杰',
    businessData: {
      kpis: [
        { label: '系统可用性', value: '99.2%', change: '-0.3%', trend: 'down' },
        { label: '活跃告警', value: '3个', change: '+1', trend: 'down' },
        { label: '平均恢复时间', value: '4.2min', change: '-1.5min', trend: 'up' },
        { label: '资源利用率', value: '78%', change: '+5%', trend: 'up' },
      ],
      charts: [{ title: 'CPU/内存趋势', type: 'line', labels: ['00:00','04:00','08:00','12:00','16:00','20:00'], values: [45,38,62,78,85,72] }],
      tables: [{ title: '活跃告警', columns: [{key:'level',label:'级别',width:'60px'},{key:'service',label:'服务',width:'100px'},{key:'duration',label:'持续时间',width:'80px'},{key:'status',label:'状态',width:'80px'}], rows: [{level:'严重',service:'订单服务',duration:'15分钟',status:'处理中'},{level:'警告',service:'数据库',duration:'45分钟',status:'监控中'},{level:'警告',service:'CDN节点',duration:'2小时',status:'监控中'}] }],
      alerts: [{ level:'critical', message:'【严重】订单服务响应超时 > 5s，影响用户体验', time:'15分钟前' },{ level:'warning', message:'【警告】数据库连接池使用率 85%，建议扩容', time:'45分钟前' },{ level:'warning', message:'【警告】CDN华东节点延迟增加，已自动切换', time:'2小时前' }]
    }
  },
  {
    id: 'legal-agent', name: '法务合规官', avatar: '⚖️',
    description: '合同审查、合规检查、法规更新追踪，降低企业法律风险',
    status: 'building', category: '法务', skills: ['合同审查','合规检查','法规追踪','风险评估'],
    usageCount: 876, lastUsed: '1天前', owner: '周律',
    businessData: {
      kpis: [
        { label: '待审合同', value: '12份', change: '+3', trend: 'neutral' },
        { label: '合规评分', value: '92分', change: '+2', trend: 'up' },
        { label: '风险事项', value: '5项', change: '-2', trend: 'up' },
        { label: '法规更新', value: '3条', change: '+1', trend: 'neutral' },
      ],
      charts: [{ title: '合同处理量', type: 'bar', labels: ['周一','周二','周三','周四','周五'], values: [5,8,6,12,9] }],
      tables: [{ title: '待审合同', columns: [{key:'name',label:'合同名称',width:'140px'},{key:'party',label:'相对方',width:'100px'},{key:'amount',label:'金额',width:'100px'},{key:'deadline',label:'截止',width:'80px'}], rows: [{name:'2025年度采购协议',party:'华为技术',amount:'¥500万',deadline:'11/25'},{name:'云服务框架协议',party:'阿里云',amount:'¥200万',deadline:'11/28'}] }],
      alerts: [{ level:'warning', message:'3份合同即将到期，建议安排续约评估', time:'昨天' },{ level:'info', message:'新法规《数据安全法》实施细则已更新，建议组织培训', time:'2天前' }]
    }
  },
  {
    id: 'customer-service-agent', name: '客服小助手', avatar: '💬',
    description: '7x24智能客服，处理咨询、投诉、售后服务',
    status: 'active', category: '客户服务', skills: ['智能问答','工单处理','情绪分析','满意度追踪'],
    usageCount: 8934, lastUsed: '刚刚', owner: '孙丽',
    businessData: {
      kpis: [
        { label: '今日会话', value: '1,247次', change: '+15%', trend: 'up' },
        { label: '解决率', value: '89.2%', change: '+2.1%', trend: 'up' },
        { label: '平均响应', value: '3.2s', change: '-0.8s', trend: 'up' },
        { label: '满意度', value: '4.6/5', change: '+0.2', trend: 'up' },
      ],
      charts: [{ title: '会话量趋势', type: 'bar', labels: ['周一','周二','周三','周四','周五','周六','周日'], values: [980,1120,1050,1280,1150,890,750] }],
      tables: [{ title: '热门问题Top5', columns: [{key:'question',label:'问题',width:'180px'},{key:'count',label:'次数',width:'60px'},{key:'resolved',label:'解决率',width:'80px'}], rows: [{question:'如何修改账户密码',count:'328',resolved:'98%'},{question:'订单状态查询',count:'256',resolved:'95%'},{question:'发票申请流程',count:'198',resolved:'92%'},{question:'退款进度查询',count:'176',resolved:'88%'},{question:'产品使用教程',count:'142',resolved:'96%'}] }],
      alerts: [{ level:'warning', message:'退款类咨询量突增35%，建议关注产品侧问题', time:'1小时前' },{ level:'info', message:'本周客户满意度达4.6/5，创历史新高', time:'3小时前' }]
    }
  }
];
