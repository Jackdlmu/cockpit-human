# 国内外设计规范调研报告：可视化/Dashboard/驾驶舱领域

## 一、调研概述

### 1.1 调研背景与目标

本报告旨在系统梳理国内外优秀的设计规范体系，重点聚焦**可视化/Dashboard/驾驶舱**领域的设计系统与**组件级设计规范**，为产品设计团队提供可参考的设计规范框架与实操建议。

### 1.2 调研范围

| 类别 | 主要涵盖内容 |
|------|-------------|
| **国外设计系统** | Ant Design、Fluent UI、Material Design、Carbon Design |
| **数据可视化库** | ECharts、G2Plot、VisActor/VChart |
| **BI/分析平台** | Tableau、Power BI、FineBI |
| **大屏/驾驶舱** | DataV、EasyV、行业设计标准 |
| **国内设计系统** | ArcoDesign、TDesign、Element UI、NutUI、Vant |
| **组件级规范** | 色彩、字体、间距、动效、状态、交互 |

---

## 二、国外设计系统规范

### 2.1 Ant Design（蚂蚁金服）

**定位**：企业级UI设计语言与React组件库，专注中后台应用场景。

**核心设计原则**：

| 原则 | 说明 |
|------|------|
| **确定性** | 一致的设计逻辑和视觉风格 |
| **意义性** | 清晰的视觉层次和信息传递 |
| **成长性** | 支持业务发展和需求变化 |
| **自然性** | 自然的用户交互和体验 |

**十大交互设计原则**：

1. **亲密原则**：相关元素靠近，通过8px基准间距实现纵向层级（8px/16px/24px）
2. **对齐原则**：文案左对齐、冒号对齐（右对齐）、数值右对齐
3. **对比原则**：主次对比、总分对比、状态对比
4. **重复原则**：视觉元素重复增强品牌识别
5. **直截了当**：减少操作步骤
6. **简化交互**：降低认知负荷
7. **足不出户**：减少页面跳转
8. **提供邀请**：引导下一步操作
9. **即时反应**：操作反馈及时
10. **巧用过渡**：动效过渡自然

**Design Token体系**：

```css
/* 颜色系统 */
--ant-primary-color: #1890ff;
--ant-success-color: #52c41a;
--ant-warning-color: #faad14;
--ant-error-color: #ff4d4f;

/* 间距系统（基于8px） */
--ant-space-xs: 4px;
--ant-space-sm: 8px;
--ant-space-md: 16px;
--ant-space-lg: 24px;
--ant-space-xl: 32px;

/* 字体系统 */
--ant-font-size-base: 14px;
--ant-line-height-base: 1.5;
```

**组件分类**：

| 类别 | 核心组件 |
|------|----------|
| 布局 | Layout、Grid、Space、Divider |
| 导航 | Menu、Breadcrumb、Pagination、Steps |
| 数据录入 | Form、Input、Select、DatePicker、Upload |
| 数据展示 | Table、Card、List、Tree、Calendar |
| 反馈 | Modal、Message、Notification、Progress |

**适用场景**：企业级中后台系统、数据管理平台、B端产品

---

### 2.2 Material Design（Google）

**定位**：跨平台（Android、iOS、Web、Flutter）设计系统，Material You支持动态主题。

**核心设计理念**：

- **材质隐喻**：数字界面类比真实世界的纸与墨
- **大胆、图形化、有意图**：参考印刷设计方法
- **动效提供意义**：动效聚焦注意力、维持连续性

**Material 3设计系统关键特性**：

1. **色彩系统**：支持动态颜色（根据壁纸提取主色调）
2. **排版系统**：13级文字层级（Display至Caption）
3. **形状系统**：小/中/大三档圆角分类
4. **组件状态**：Focus、Selection、Activation、Error、Hover、Press、Drag、Disabled

**组件分类**：

| 类别 | 组件示例 |
|------|----------|
| 操作 | FAB、Button、IconButton、SegmentedButton |
| 通信 | Snackbar、Banner、Dialog、Badge |
| 导航 | NavigationBar、NavigationRail、NavigationDrawer、Tabs |
| 选择 | Checkbox、Radio、Switch、Slider、Chips |
| 文本输入 | TextField、OutlinedTextField |

**主题配置示例**：

```kotlin
// Android Material3主题配置
val colorScheme = when {
    dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
        val context = ContextAmbient.current
        if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    }
    darkTheme -> darkColorScheme
    else -> lightColorScheme
}
```

**适用场景**：移动端优先产品、跨平台应用、需要Material风格的应用

---

### 2.3 Fluent Design（Microsoft）

**定位**：跨平台设计系统，支撑Windows、Microsoft 365、Azure等全线产品。

**五大设计基石**：

| 原则 | 说明 |
|------|------|
| **Light（光照）** | 模拟自然光照效果 |
| **Depth（深度）** | Z轴层级、阴影、高度 |
| **Motion（动效）** | 流畅、自然的过渡 |
| **Material（材质）** | Mica、Acrylic等半透明材质 |
| **Scale（缩放）** | 自适应不同屏幕尺寸 |

**色彩系统架构**：

```css
/* 全局颜色样式（语义化命名） */
--colorNeutralBackground1: #FFFFFF;
--colorNeutralForeground1: #242424;
--colorBrandBackground1: #0078D4;

/* 状态色 */
--colorSuccessBackground1: #DFF6DD;
--colorSuccessForeground1: #107C10;
--colorWarningBackground1: #FFF4CE;
--colorWarningForeground1: #797673;
--colorErrorBackground1: #FDE7E9;
--colorErrorForeground1: #C42B1C;
```

**字体系统**：

- 核心字体：Segoe UI Variable（可变字体）
- 中文回退：微软雅黑、HarmonyOS Sans CN
- 排版层级：7级（H1-H6 + Body）

**间距系统（4px基准）**：

```css
--spacing-sizeNone: 0;
--spacing-size40: 4px;    /* 基准单位 */
--spacing-size80: 8px;
--spacing-size160: 16px;
--spacing-size240: 24px;
--spacing-size320: 32px;
```

**动效规范**：

- 时间函数：`cubic-bezier(0.2, 0, 0, 1)`
- 微交互：100-200ms
- 页面过渡：300-500ms

**适用场景**：企业级桌面应用、跨平台产品、Windows生态应用

---

### 2.4 Carbon Design（IBM）

**定位**：IBM企业级开源设计系统，专注无障碍性和企业级一致性。

**设计原则**：

1. **确定性（Certainty）**：降低认知负荷
2. **有用性（Useful）**：每个元素都有明确目的
3. **可及性（Accessible）**：WCAG 2.1 AA标准
4. **一致性（Consistent）**：跨产品统一体验

**组件架构**：

| 类别 | 组件示例 |
|------|----------|
| 表单 | Text Input、Dropdown、Checkbox、Toggle、DatePicker |
| 导航 | Header、Breadcrumb、SideNav、Tabs、Pagination |
| 数据展示 | DataTable、StructuredList、Tag、Accordion |
| 反馈 | Modal、Notification、Loading、Tooltip |
| 图表 | Bar、Line、Donut、Scatter（via @carbon/charts-react） |

**Design Token层级**：

```scss
// 全局Token（原始值）
$blue-60: #0f62fe;
$gray-100: #f4f4f4;

// 别名Token（语义化）
$link-primary: $blue-60;
$background-ui-01: $gray-100;

// 组件Token
$button-primary-background: $link-primary;
```

**排版系统**：

| 用途 | 字号 | 字重 | 行高 |
|------|------|------|------|
| Body Long | 16px | Regular | 1.5 |
| Heading 03 | 28px | Semibold | 1.29 |
| Label 01 | 12px | Medium | 1.33 |

**2x Grid系统**：

- 基准单位：16px
- 列数：12列
- 间距模式：Wide(32px)/Narrow(16px)/Condensed(1px)

**适用场景**：企业级B端产品、需要高可访问性标准的产品、数据密集型应用

---

### 2.5 ECharts（百度）

**定位**：Apache顶级开源可视化图表库，专注Web端数据可视化。

**图表类型覆盖**：

| 类别 | 图表类型 |
|------|----------|
| 基本图表 | 折线图、柱状图、饼图、散点图 |
| 组合图表 | K线图、雷达图、仪表盘、热力图、树图 |
| 地理可视化 | 地图、流图、航线图 |
| 关系图 | 桑基图、力导向图、矩形树图 |
| 3D图表 | 3D散点图、3D柱状图、曲面图 |

**组件系统架构**：

```
ECharts Option结构：
├── title          # 标题组件
├── legend         # 图例组件
├── tooltip        # 提示框组件
├── grid           # 直角坐标系网格
├── xAxis/yAxis    # 坐标轴组件
├── polar          # 极坐标系
├── geo            # 地理坐标系
├── dataZoom       # 数据区域缩放
├── visualMap      # 视觉映射组件
├── series         # 数据系列（核心）
└── toolbox        # 工具箱组件
```

**主题配置示例**：

```javascript
// 自定义主题
const customTheme = {
    color: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de'],
    backgroundColor: 'rgba(0,0,0,0)',
    textStyle: {
        fontFamily: 'Microsoft YaHei, sans-serif'
    },
    title: {
        textStyle: { color: '#333', fontSize: 18 }
    },
    legend: {
        textStyle: { color: '#666' }
    }
};

// 应用主题
echarts.registerTheme('custom', customTheme);
const chart = echarts.init(dom, 'custom');
```

**交互规范**：

- Tooltip：支持多种触发方式（item/axis/none）
- 数据区域缩放：内置滑块型和 Inside 型
- 图表联动：通过 connect 方法实现多图联动
- 拖拽重计算：支持数据点拖拽

**适用场景**：数据可视化大屏、BI报表、监控仪表盘、统计图表

---

## 三、国内设计系统规范

### 3.1 ArcoDesign（字节跳动）

**定位**：字节跳动企业级开源设计系统，支持React/Vue多框架，服务4000+内部项目。

**四大设计原则**：

| 原则 | 说明 |
|------|------|
| **一致（Agreement）** | 样式、操作、呈现方式统一 |
| **韵律（Rhythm）** | 间距、层次有节奏感 |
| **清晰（Clear）** | 信息层次分明 |
| **开放（Open）** | 支持业务扩展定制 |

**色彩系统**：

```css
/* 主色系（13种通用主色） */
--color-brand-1: #e6f1ff;
--color-brand-6: #165dff;  /* 默认主色 */
--color-brand-10: #001a57;

/* 功能色 */
--color-success-6: #00b42a;
--color-warning-6: #ff7d00;
--color-error-6: #f53f3f;
--color-info-6: #0fc6c2;

/* 中性色 */
--color-text-1: rgba(0, 0, 0, 0.9);
--color-text-4: rgba(0, 0, 0, 0.26);
--color-bg-1: #ffffff;
--color-bg-5: #e5e6eb;
```

**字体系统**：

| 层级 | 字号 | 字重 | 行高 |
|------|------|------|------|
| Body 1 | 14px | Regular | 1.4 |
| Body 2 | 12px | Regular | 1.4 |
| Title 1 | 20px | Medium | 1.4 |
| Title 2 | 16px | Medium | 1.4 |

**间距系统（4px基准）**：

```css
--spacing-1: 4px;
--spacing-2: 8px;
--spacing-3: 12px;
--spacing-4: 16px;
--spacing-6: 24px;
--spacing-8: 32px;
```

**主题定制能力**：

- 风格配置平台支持一键切换暗色模式
- 通过 Design Token 实现千余个样式变量覆盖
- 支持组件级样式定制

**组件生态**：

| 类别 | 组件数量 |
|------|----------|
| 基础组件 | 67+ |
| 业务组件 | 按需扩展 |
| 图表组件 | Arco Charts |

**适用场景**：企业级中后台、移动端产品、需要高度定制化的应用

---

### 3.2 TDesign（腾讯）

**定位**：腾讯开源企业级设计系统，支持React/Vue/小程序/Flutter多技术栈。

**设计价值观**：

- **团队协作（Collaborative）**：设计与开发无缝衔接
- **迭代进化（Evolving）**：持续更新与优化
- **极致体验（Delightful）**：用户友好、直观易用
- **技术驱动（Tech-Enabled）**：工程化支持完善

**Design Token体系**：

```css
/* 品牌色（10级梯度） */
--td-brand-color-1: #f2f3ff;
--td-brand-color-6: #366ef4;  /* 默认主色 */
--td-brand-color-10: #001a57;

/* 警告色 */
--td-warning-color-1: #fff1e9;
--td-warning-color-6: #e37318;

/* 错误色 */
--td-error-color-1: #fff0ed;
--td-error-color-6: #d54941;

/* 成功色 */
--td-success-color-1: #e3f9e9;
--td-success-color-6: #2ba471;

/* 中性灰 */
--td-gray-color-1: #f3f3f3;
--td-gray-color-14: #181818;
```

**排版规范**：

| 用途 | 字号 | 字重 | 行高 |
|------|------|------|------|
| 正文 | 14px | 400 | 22px |
| 小标题 | 16px | 500 | 24px |
| 大标题 | 20px | 600 | 28px |
| 主标题 | 28px | 600 | 36px |

**组件库架构**：

```
TDesign/
├── tdesign-react/      # React组件库
├── tdesign-vue-next/   # Vue3组件库
├── tdesign-vue/        # Vue2组件库
├── tdesign-miniprogram/# 小程序组件库
├── tdesign-mobile-vue/  # 移动端Vue组件库
└── tdesign-common/     # 公共样式与Token
```

**Starter Kit**：

- 开箱即用的中后台框架
- 集成登录、权限、菜单等常见功能
- 支持快速原型开发

**适用场景**：多端产品（Web/小程序/移动端）、需要跨技术栈一致性的团队

---

### 3.3 Element UI（饿了么）

**定位**：Vue 2桌面端组件库，国内后台管理系统首选方案。

**四大设计原则**：

| 原则 | 说明 |
|------|------|
| **一致性（Consistency）** | 与现实生活一致、界面元素一致 |
| **反馈性（Feedback）** | 操作反馈及时 |
| **效率性（Efficiency）** | 简化操作流程 |
| **可控性（Controllability）** | 用户可控操作 |

**组件分类**：

| 类别 | 核心组件 |
|------|----------|
| 基础组件 | Button、Link、Icon |
| 表单组件 | Input、Select、Radio、Checkbox、Switch、DatePicker |
| 数据展示 | Table、Tag、Progress、Tree、Pagination |
| 导航组件 | NavMenu、Tabs、Breadcrumb、Pagination |
| 布局组件 | Container、Header、Aside、Main、Footer、Row、Col |
| 反馈组件 | Modal、Message、Notification、Alert、Loading |

**栅格系统**：

- 24列分栏模式
- 响应式断点：xs(<768px)、sm(≥768px)、md(≥992px)、lg(≥1200px)、xl(≥1920px)

**样式定制**：

```scss
/* 变量覆盖 */
$--color-primary: #409eff;
$--font-size-base: 14px;
$--border-radius-base: 4px;

/* 按需引入 */
import { Button, Select } from 'element-ui';
```

**适用场景**：Vue 2中后台管理系统、企业内部系统（已升级至Element Plus支持Vue 3）

---

### 3.4 DataV（阿里云）

**定位**：阿里云数据可视化大屏解决方案，提供丰富的可视化组件与编辑工具。

**核心能力**：

| 能力 | 说明 |
|------|------|
| **丰富组件** | 基础组件、图表组件、交互组件 |
| **拖拽编辑** | 可视化配置大屏 |
| **数据接入** | 支持多种数据源接入 |
| **主题切换** | 支持深色/浅色主题 |
| **发布分享** | 一键发布与分享 |

**组件分类**：

| 类别 | 组件示例 |
|------|----------|
| 基础组件 | 文字、轮播文字、图片、背景 |
| 图表组件 | 折线图、柱状图、饼图、仪表盘、地图 |
| 数据组件 | 翻牌器、数字滚动、进度条 |
| 媒体组件 | 视频、iframe |
| 交互组件 | 时间器、筛选器、按钮 |

**配置控件类型**：

| 控件类型 | 说明 |
|----------|------|
| input | 文本输入 |
| number | 数字输入 |
| select | 下拉选择 |
| switch | 开关 |
| slider | 滑动条 |
| colorPicker | 颜色选择 |
| imageSelect | 图片选择 |
| font | 字体套件 |
| margin/padding | 边距套件 |

**适用场景**：数据可视化大屏、指挥中心、展厅展示、监控驾驶舱

---

## 四、组件级设计规范详解

### 4.1 色彩系统

#### 4.1.1 色彩层级架构

优秀的设计系统通常采用**三级色彩架构**：

```
┌─────────────────────────────────────────────┐
│  第一层：Global Token（基础色板）           │
│  例：--blue-50, --blue-100, ..., --blue-900│
├─────────────────────────────────────────────┤
│  第二层：Alias Token（语义色）              │
│  例：--color-primary, --color-success       │
├─────────────────────────────────────────────┤
│  第三层：Component Token（组件色）          │
│  例：--button-bg, --card-header-bg           │
└─────────────────────────────────────────────┘
```

#### 4.1.2 色彩语义定义

| 语义 | 用途 | 建议色值范围 |
|------|------|-------------|
| Primary/Brand | 品牌色、主要操作 | 蓝色系 #0066FF - #1890FF |
| Success | 成功、正向 | 绿色系 #52C41A - #00B42A |
| Warning | 警告、注意 | 橙色/黄色系 #FAAD14 - #FF7D00 |
| Error/Danger | 错误、危险 | 红色系 #FF4D4F - #F53F3F |
| Info | 信息、提示 | 青色/蓝色系 #0FC6C2 - #165DFF |
| Neutral | 中性文本、背景 | 灰黑色系 #000 - #FFF |

#### 4.1.3 可访问性要求

- **对比度标准**：文本与背景对比度≥4.5:1（大文本≥3:1）
- **色盲友好**：不依赖单一颜色传递信息，配合形状/图标/文字
- **状态色规范**：

```css
/* 按钮状态色变化 */
--button-bg-default: var(--color-primary);
--button-bg-hover: var(--color-primary-light);    /* 加亮10-15% */
--button-bg-active: var(--color-primary-dark);   /* 变暗10-15% */
--button-bg-disabled: var(--color-neutral-30);    /* 降低透明度 */
```

---

### 4.2 字体系统

#### 4.2.1 字体层级规范

| 层级 | 英文名称 | 字号 | 字重 | 行高 | 用途 |
|------|----------|------|------|------|------|
| Display | Display | 36-48px | 700 | 1.2 | 大屏数字、Hero标题 |
| H1 | Heading 1 | 28-32px | 600 | 1.3 | 页面主标题 |
| H2 | Heading 2 | 24px | 600 | 1.35 | 模块标题 |
| H3 | Heading 3 | 20px | 500 | 1.4 | 卡片标题 |
| Body | Body | 14-16px | 400 | 1.5 | 正文内容 |
| Caption | Caption | 12px | 400 | 1.4 | 说明文字、标签 |
| Overline | Overline | 10-12px | 500 | 1.2 | 分类标签 |

#### 4.2.2 中文字体选择

| 场景 | 推荐字体 |
|------|----------|
| Web | 思源黑体（Source Han Sans）、微软雅黑 |
| 移动端 | 系统默认字体（PingFang SC、Hiragino Sans） |
| 数据可视化大屏 | 黑体（无衬线，清晰度高） |

#### 4.2.3 字体规范示例（Ant Design）

```css
/* 字号 */
--font-size-heading-1: 38px;
--font-size-heading-2: 30px;
--font-size-heading-3: 24px;
--font-size-heading-4: 20px;
--font-size-body: 14px;
--font-size-caption: 12px;

/* 行高 */
--line-height-base: 1.5;
--line-height-heading: 1.2;
```

---

### 4.3 间距系统

#### 4.3.1 基准间距单位

| 设计系统 | 基准单位 | 间距层级 |
|----------|----------|----------|
| Ant Design | 8px | 4, 8, 12, 16, 24, 32, 48 |
| Material Design | 4px | 4, 8, 12, 16, 24, 32, 40, 48, 64 |
| Fluent Design | 4px | 4, 8, 12, 16, 20, 24, 32, 40, 48 |
| Carbon Design | 16px | 8, 16, 24, 32, 48, 64 |

#### 4.3.2 组件间距规范

```css
/* 紧凑布局 */
--spacing-compact: 4px;

/* 常规布局 */
--spacing-normal: 8px;

/* 宽松布局 */
--spacing-loose: 16px;

/* 组件内边距 */
--padding-xs: 4px;
--padding-sm: 8px;
--padding-md: 16px;
--padding-lg: 24px;

/* 组件间间距 */
--margin-xs: 4px;
--margin-sm: 8px;
--margin-md: 16px;
--margin-lg: 24px;
```

#### 4.3.3 间距使用场景

| 间距值 | 适用场景 |
|--------|----------|
| 4px | 紧凑列表、标签内文字与边框 |
| 8px | 表单项之间、按钮内元素 |
| 12px | 卡片内元素、小间距 |
| 16px | 区块间距、表单间分组 |
| 24px | 卡片间、模块间 |
| 32px | 大区块分隔、页面边距 |

---

### 4.4 圆角与阴影

#### 4.4.1 圆角规范

| 元素类型 | 圆角值 | 示例 |
|----------|--------|------|
| 按钮/输入框 | 4-6px | `border-radius: 4px;` |
| 卡片/面板 | 6-8px | `border-radius: 8px;` |
| 模态框 | 8-12px | `border-radius: 12px;` |
| 头像 | 50%（圆形） | `border-radius: 50%;` |
| 标签/徽章 | 2-4px | `border-radius: 2px;` |

#### 4.4.2 阴影层级

| 层级 | 用途 | CSS示例 |
|------|------|---------|
| Level 0 | 无阴影 | - |
| Level 1 | 卡片默认 | `box-shadow: 0 1px 2px rgba(0,0,0,0.06);` |
| Level 2 | 悬停状态 | `box-shadow: 0 4px 8px rgba(0,0,0,0.08);` |
| Level 3 | 下拉菜单 | `box-shadow: 0 6px 16px rgba(0,0,0,0.12);` |
| Level 4 | 模态框 | `box-shadow: 0 12px 32px rgba(0,0,0,0.16);` |

---

### 4.5 动效规范

#### 4.5.1 动效时长规范

| 动效类型 | 时长范围 | 说明 |
|----------|----------|------|
| 微交互反馈 | 100-150ms | 按钮点击、hover状态 |
| 组件展开 | 200-300ms | 下拉展开、折叠 |
| 页面过渡 | 300-400ms | 路由切换、模态弹出 |
| 复杂动画 | 400-600ms | 数据加载、图表动画 |

#### 4.5.2 缓动曲线

| 缓动类型 | CSS值 | 适用场景 |
|----------|-------|----------|
| ease-out | `cubic-bezier(0, 0, 0.2, 1)` | 元素进入 |
| ease-in | `cubic-bezier(0.4, 0, 1, 1)` | 元素离开 |
| ease-in-out | `cubic-bezier(0.4, 0, 0.2, 1)` | 状态切换 |
| spring | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | 弹性效果 |

#### 4.5.3 动效设计原则

1. **目的性**：动效服务于功能，传达状态变化
2. **自然性**：符合物理世界认知（如重力、惯性）
3. **克制性**：不过度使用，避免干扰
4. **一致性**：相同场景使用相同动效模式

---

### 4.6 组件状态设计

#### 4.6.1 通用状态定义

| 状态 | 说明 | 视觉表现 |
|------|------|----------|
| Default | 默认状态 | 正常样式 |
| Hover | 悬停状态 | 颜色变化、轻微提升 |
| Active/Pressed | 点击/按下状态 | 颜色加深、轻微下沉 |
| Focus | 聚焦状态 | 聚焦环（如蓝色轮廓） |
| Disabled | 禁用状态 | 降低透明度(30-50%)、禁用交互 |
| Loading | 加载状态 | 加载指示器、骨架屏 |
| Error | 错误状态 | 红色边框、错误提示 |
| Empty | 空数据状态 | 空状态插画、引导文案 |

#### 4.6.2 状态设计示例

```css
/* 按钮状态 */
.btn {
  background: var(--color-primary);
  transition: all 150ms ease-out;
}

.btn:hover {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-1);
}

.btn:active {
  background: var(--color-primary-active);
  transform: translateY(1px);
}

.btn:focus {
  outline: 2px solid var(--color-primary-focus);
  outline-offset: 2px;
}

.btn:disabled {
  background: var(--color-neutral-30);
  cursor: not-allowed;
  opacity: 0.5;
}

.btn.loading {
  position: relative;
  color: transparent;
}

.btn.loading::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
```

---

### 4.7 图表组件规范

#### 4.7.1 图表类型选择指南

| 数据分析目的 | 推荐图表 | 禁用/慎用 |
|-------------|----------|-----------|
| 趋势变化 | 折线图、面积图 | 饼图、雷达图 |
| 分类对比 | 柱状图、条形图 | 3D图表 |
| 占比构成 | 环形图、堆叠柱状图 | 3D饼图 |
| 分布分析 | 直方图、箱线图 | - |
| 相关关系 | 散点图、气泡图 | - |
| 地理分布 | 地图、热力图 | - |
| 目标进度 | 仪表盘、子弹图 | - |

#### 4.7.2 图表配色规范

**连续色板（单色渐变）**：

```javascript
// 适用于连续数据
const sequentialPalette = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'];
```

**分类色板（多色对比）**：

```javascript
// 适用于分类数据（≤10类）
const categoricalPalette = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', 
  '#73c0de', '#3ba272', '#fc8452', '#9a60b4', 
  '#ea7ccc', '#1aadce'
];
```

#### 4.7.3 图表交互规范

| 交互类型 | 实现方式 | 设计要点 |
|----------|----------|----------|
| Tooltip | 悬停显示详情 | 300ms延迟，避免遮挡数据 |
| 数据筛选 | 下拉/多选控件 | 支持多维组合筛选 |
| 下钻/钻取 | 点击穿透 | ≤4层，避免迷失 |
| 联动 | 多图表同步刷新 | 明确主从关系 |
| 缩放 | 拖拽/滚轮 | 提供重置功能 |
| 图例开关 | 点击图例 | 切换数据系列显隐 |

---

## 五、Dashboard/驾驶舱设计模式

### 5.1 Dashboard类型学

| 类型 | 受众 | 更新频率 | 数据粒度 | 交互深度 |
|------|------|----------|----------|----------|
| **战略型** | C-level/董事会 | 日/周/月 | 高度聚合 | 低（仅筛选） |
| **战术型** | 部门经理/PM | 周/日 | 中等（按团队） | 中（对比、钻取） |
| **操作型** | 一线主管/客服 | 秒/分钟/实时 | 细粒度交易 | 低（告警为主） |
| **分析型** | 数据分析师 | 按需/交互式 | 明细+聚合 | 高（多维分析） |

### 5.2 布局设计原则

#### 5.2.1 视觉动线管理

遵循**F型阅读模式**：

```
┌──────────────────────────────────────────┐
│  [核心KPI区域]         [重要指标区]     │  ← 用户首先关注
├──────────────────────────────────────────┤
│                                          │
│  [趋势分析区]      [对比分析区]          │  ← 自然扫描
│                                          │
├──────────────────────────────────────────┤
│  [明细数据区]                            │  ← 需要时深入
└──────────────────────────────────────────┘
```

#### 5.2.2 信息层级布局

| 区域 | 内容 | 设计要点 |
|------|------|----------|
| 顶部/左上 | 核心KPI | 大字号数字、目标对比、趋势箭头 |
| 中部 | 趋势/对比分析 | 折线图、柱状图 |
| 底部/右侧 | 明细数据 | 表格、列表、可展开 |

#### 5.2.3 布局模板推荐

**经典仪表盘布局**：

```
┌───────────────────────────────────────┐
│            仪表盘标题 & 时间筛选器      │
├───────────┬───────────┬───────────────┤
│  KPI卡片  │  KPI卡片  │    KPI卡片    │
├───────────┴───────────┴───────────────┤
│                                        │
│              主趋势图                   │
│                                        │
├─────────────────────┬────────────────┤
│    分类柱状图        │     饼图       │
├─────────────────────┴────────────────┤
│              明细数据表格              │
└───────────────────────────────────────┘
```

**大屏展示布局**：

```
┌───────────────────────────────────────┐
│  ┌─────────────────────────────────┐  │
│  │         中心地图/主题图          │  │
│  └─────────────────────────────────┘  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ │
│  │指标│ │指标│ │指标│ │指标│ │指标│ │
│  └────┘ └────┘ └────┘ └────┘ └────┘ │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │趋势图1 │ │趋势图2 │ │趋势图3 │  │
│  └─────────┘ └─────────┘ └─────────┘  │
└───────────────────────────────────────┘
```

### 5.3 大屏设计规范（参考T/CIDADS标准）

#### 5.3.1 观看距离与字号

| 视距范围 | 最小字号（像素） | 推荐字号 |
|----------|-----------------|----------|
| 3-5米 | 18-24px | 24-32px |
| 5-10米 | 32-48px | 48-64px |
| >10米 | >48px | 64px+ |

**计算公式**：`最小字号 = (视距 / 200) × (分辨率/屏幕高度)`

#### 5.3.2 色彩规范

| 要素 | 规范 |
|------|------|
| 背景色 | 深色系为主（#0a0e27、#1a1f36） |
| 主色调 | 1-2种，配合品牌色 |
| 强调色 | 用于告警/重点数据 |
| 对比度 | 符合WCAG AA标准（≥4.5:1） |
| 饱和度 | 中等，避免过亮刺眼 |

#### 5.3.3 设备尺寸与拼接

| 项目 | 规范 |
|------|------|
| 推荐比例 | 16:9 |
| 设计分辨率 | 1920×1080 或 3840×2160 |
| 拼接屏间距 | 考虑边框位置，避免内容被切割 |
| 边距 | ≥20px |

---

## 六、Design Token体系

### 6.1 Token层级结构

```
Global Tokens (Primitive)
├── 颜色原值：--blue-500, --gray-100
├── 间距值：--spacing-4, --spacing-8
├── 字号值：--font-size-14, --font-size-16
│
├── Alias Tokens (Semantic)
│   ├── --color-primary: var(--blue-500)
│   ├── --color-success: var(--green-500)
│   ├── --spacing-component: var(--spacing-4)
│   │
│   └── Component Tokens
│       ├── --button-bg-color: var(--color-primary)
│       ├── --card-padding: var(--spacing-component)
│       └── --input-font-size: var(--font-size-14)
```

### 6.2 Token命名规范

| 模式 | 示例 | 适用场景 |
|------|------|----------|
| 类别-属性 | `--color-background` | 全局Token |
| 类别-属性-状态 | `--color-text-primary` | 语义Token |
| 组件-属性-状态 | `--button-bg-hover` | 组件Token |

### 6.3 Token平台适配

```json
{
  "color": {
    "brand": {
      "primary": {
        "value": "#0066FF",
        "type": "color"
      }
    }
  }
}
```

```css
/* Web */
:root {
  --color-brand-primary: #0066FF;
}

/* iOS */
Color(red: 0, green: 102, blue: 255)

/* Android */
<color name="color_brand_primary">#0066FF</color>
```

---

## 七、国内外设计规范对比

### 7.1 核心差异分析

| 维度 | 国外设计系统 | 国内设计系统 |
|------|-------------|-------------|
| **设计理念** | 原则导向、理论支撑强 | 场景导向、实用性强 |
| **文档质量** | 详尽、学术性强 | 通俗、实操性强 |
| **组件定制** | 限制较多，稳定优先 | 高度可定制，灵活度高 |
| **主题支持** | 主题切换为主 | 品牌定制能力强 |
| **社区生态** | 国际化程度高 | 中文社区活跃 |
| **更新频率** | 稳定迭代 | 快速响应需求 |

### 7.2 各系统特色总结

| 设计系统 | 核心优势 | 最适场景 |
|----------|---------|----------|
| **Ant Design** | 组件丰富、文档完善、社区成熟 | 企业级中后台 |
| **ArcoDesign** | 主题定制强、暗黑模式、多框架 | 需要品牌定制的企业 |
| **TDesign** | 多端覆盖、腾讯生态 | 跨平台小程序/H5 |
| **Material Design** | 理论体系完整、国际化 | 移动端优先产品 |
| **Fluent Design** | Windows生态、企业级 | 桌面应用 |
| **Carbon Design** | 无障碍标准高 | 数据密集型产品 |

### 7.3 行业趋势

1. **Design Token标准化**：W3C Design Token Community Group推动跨平台Token标准
2. **AI辅助设计**：自动生成设计稿、智能主题适配
3. **低代码集成**：设计系统与低代码平台深度整合
4. **多端一致性**：跨设备、跨平台体验统一
5. **可访问性增强**：WCAG 3.0、APCA新标准

---

## 八、实操建议与引入路径

### 8.1 设计系统选型决策矩阵

| 评估维度 | 权重 | Ant Design | ArcoDesign | TDesign | Element Plus |
|----------|------|------------|------------|---------|-------------|
| 组件丰富度 | 20% | ★★★★★ | ★★★★☆ | ★★★★☆ | ★★★★☆ |
| 主题定制能力 | 20% | ★★★☆☆ | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| 多框架支持 | 15% | ★★★★☆ | ★★★★★ | ★★★★★ | 仅Vue |
| 文档质量 | 15% | ★★★★★ | ★★★★☆ | ★★★★☆ | ★★★★☆ |
| 社区活跃度 | 15% | ★★★★★ | ★★★★☆ | ★★★★☆ | ★★★★☆ |
| 学习曲线 | 15% | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★★★ |

### 8.2 组件级规范引入建议

#### 阶段一：基础规范建立（1-2个月）

1. **Design Token体系建设**
   - 定义品牌色彩系统
   - 建立字体层级规范
   - 制定间距系统
   - 定义阴影/圆角规范

2. **基础组件规范**
   - Button（按钮）
   - Input（输入框）
   - Select（下拉选择）
   - Checkbox/Radio（复选/单选）
   - Switch（开关）

#### 阶段二：核心组件扩展（2-3个月）

3. **数据展示组件**
   - Table（表格）
   - Card（卡片）
   - Modal（模态框）
   - Pagination（分页）
   - Tag/Badge（标签/徽章）

4. **图表组件规范**
   - 图表配色系统
   - 图表交互规范
   - Tooltip/图例设计

#### 阶段三：业务组件与模板（3-6个月）

5. **业务组件沉淀**
   - 数据筛选器
   - 数据统计卡片
   - 图表容器组件
   - Dashboard模板

6. **Dashboard模板库**
   - 战略型仪表盘模板
   - 战术型仪表盘模板
   - 大屏展示模板

### 8.3 组件规范文档模板

```markdown
## 组件名称

### 基本信息
- **组件类型**：基础组件/复合组件/业务组件
- **使用场景**：什么情况下使用
- **设计依据**：参考的设计系统/规范

### 设计规范

#### 视觉规范
- 尺寸规范
- 颜色规范
- 状态样式

#### 交互规范
- 交互行为描述
- 键盘/手势支持
- 边界情况处理

#### 无障碍规范
- ARIA属性
- 键盘导航
- 屏幕阅读器支持

### 代码规范
- Props/API定义
- 样式变量
- 事件定义

### 使用示例
```tsx
// 示例代码
```

### 注意事项
- 常见问题
- 性能优化点
```

---

## 九、参考资料

### 官方设计系统文档

| 设计系统 | 官方地址 |
|----------|----------|
| Ant Design | https://ant.design |
| ArcoDesign | https://arco.design |
| TDesign | https://tdesign.tencent.com |
| Element Plus | https://element-plus.org |
| Material Design | https://material.io |
| Fluent Design | https://www.microsoft.com/design/fluent |
| Carbon Design | https://carbondesignsystem.com |

### 数据可视化规范

| 工具库 | 官方地址 |
|--------|----------|
| ECharts | https://echarts.apache.org |
| VChart | https://www.visactor.com/vchart |
| G2Plot | https://g2plot.antv.vision |
| DataV | https://datav.aliyun.com |
| FineBI | https://www.fanruan.com/finereport |

### 行业标准

- T/CIDADS 00011-2022《数字大屏可视化设计指南》
- GB/T 43770-2024《室内LED显示屏规范》
- WCAG 2.1 / WCAG 3.0 无障碍标准

---

## 十、总结

本报告系统梳理了国内外主流设计系统的核心规范，重点分析了可视化/Dashboard/驾驶舱领域的组件设计标准。核心结论如下：

1. **设计系统选择**：根据团队技术栈和业务场景选择合适的设计系统，企业中后台优先考虑Ant Design、ArcoDesign。

2. **组件级规范是基础**：建立Design Token体系，统一色彩、字体、间距、动效等基础规范，是确保产品一致性的关键。

3. **Dashboard设计有章可循**：遵循信息层级、视觉动线、交互效率等设计原则，避免"炫技式"设计。

4. **大屏设计需特殊规范**：考虑观看距离、设备特性、色彩表现等因素，参考行业设计标准。

5. **持续迭代与沉淀**：设计规范不是一次性工程，需要在实践中持续迭代和组件沉淀。

---

*报告生成时间：2026年6月*
*信息来源：各设计系统官方网站、行业标准文档、技术社区*