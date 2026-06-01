# YonCockpit 本地化与国际化改造方案

## 1. 目标

本方案用于指导后续产品本地化和国际化改造，重点解决多语言基础能力、语言包切换、区域化格式、以及必要的区域视觉语义适配问题。

最小目标：

- 完整支持多语言 UI。
- 支持语言包切换，并在刷新后保持用户选择。
- 支持模板、组件目录、管理说明等配置型内容按语言展示。
- 支持日期、数字、货币等基础区域化格式。
- 支持必要的区域视觉语义，例如中文语境下上涨红色、下跌绿色。

增强目标：

- 外部平台、YonClaw、LLM 创建驾驶舱时可传入 `locale`。
- 动态生成内容记录原始语言，必要时支持翻译显示。
- 主题系统可承接区域化色值策略。

## 2. 当前代码现状

当前项目尚未引入 i18n 框架，中文文案主要硬编码在前端组件、后端模板和智能体提示词中。

前端主要集中在：

- `src/components/WorkspaceView.tsx`
- `src/components/WorkspaceDetail.tsx`
- `src/components/SettingsPanel.tsx`
- `src/components/ThemeSettings.tsx`
- `src/components/LayoutSettings.tsx`
- `src/components/WidgetDetailDrawer.tsx`
- `src/components/CreateCockpitDialog.tsx`
- `src/pages/TemplateManager.tsx`
- 连接管理、组件管理、模板管理相关组件

后端和数据侧主要集中在：

- `server/data/builtin-templates.json`
- `server/data/widget-catalog.json`
- `server/src/services/workspace-initializer.ts`
- `server/src/services/meta-agent.ts`
- `server/src/services/widget-catalog-store.ts`
- `server/src/agent/engine/llm-enhancer.ts`
- 各类错误消息、schema hint、prompt、示例数据

当前已有能力：

- 已使用 `next-themes` 作为主题切换基础。
- `src/index.css` 已有较完整的 CSS token，可以承接区域化主题和语义色扩展。
- 部分代码已使用 `Intl.DateTimeFormat('zh-CN')`，但 locale 仍是固定值。

当前主要风险：

- UI 文案、模板文案、业务数据内容混在一起，不能简单全局替换。
- 模板和组件目录里的 `name/title/description/caption/schemaHint` 等字段需要兼容老数据。
- 动态生成的业务内容可能来自 YonClaw、LLM 或用户输入，应保留原始语言，不应默认强制翻译。
- 趋势色和状态色需要分离：上涨/下跌是区域语义，成功/失败/告警是业务状态语义。

## 3. 设计原则

1. 产品 UI 和业务内容分离。
   产品按钮、菜单、设置、错误提示必须语言包化；用户数据、报告、LLM 输出默认保留原语言。

2. 稳定字段不本地化。
   `id`、`type`、`metricKey`、`dataIntent`、`widget.type`、`agentId` 等系统字段必须保持稳定。

3. 配置内容兼容旧格式。
   模板和组件目录继续支持现有 `name/title/description` 字段，同时新增可选 `i18n` 字段。

4. 区域格式集中封装。
   日期、数字、货币、百分比、列表连接词不在组件里直接调用固定 locale。

5. 视觉语义通过 token 化解决。
   趋势色、状态色、品牌色、主题色分层，避免不同语义互相污染。

## 4. 推荐架构

### 4.1 前端 i18n 层

建议引入：

- `i18next`
- `react-i18next`
- 可选：`i18next-icu`，用于复数、复杂插值和格式化

建议新增目录：

```text
src/i18n/
  index.ts
  types.ts
  locales/
    zh-CN/
      common.json
      settings.json
      workspace.json
      widget.json
      templateManager.json
      componentManager.json
      errors.json
    en-US/
      common.json
      settings.json
      workspace.json
      widget.json
      templateManager.json
      componentManager.json
      errors.json
```

建议 namespace：

- `common`：通用按钮、加载、空态、确认、取消、删除、保存
- `settings`：常用配置、连接管理、外观、工具调用
- `workspace`：首页、驾驶舱列表、创建、刷新、删除、主控区
- `widget`：组件标题、详情抽屉、图表通用文案、指标通用文案
- `templateManager`：模板管理
- `componentManager`：组件管理
- `errors`：错误提示
- `agent`：智能体、工具调用、对话状态

示例语言包：

```json
{
  "common": {
    "loading": "加载中...",
    "save": "保存",
    "delete": "删除",
    "refresh": "刷新",
    "cancel": "取消",
    "confirm": "确认"
  }
}
```

英文示例：

```json
{
  "common": {
    "loading": "Loading...",
    "save": "Save",
    "delete": "Delete",
    "refresh": "Refresh",
    "cancel": "Cancel",
    "confirm": "Confirm"
  }
}
```

### 4.2 Locale Provider

语言选择来源优先级：

1. 用户显式选择：`localStorage.yonclaw-locale`
2. 浏览器语言：`navigator.language`
3. 默认语言：`zh-CN`

建议支持：

```ts
type SupportedLocale = 'zh-CN' | 'en-US';
```

后续可以扩展：

```ts
type SupportedLocale = 'zh-CN' | 'zh-HK' | 'en-US' | 'ja-JP';
```

### 4.3 设置入口

建议在“常用配置 > 外观”中增加语言切换：

```text
常用配置
  - 连接管理
  - 外观
    - 导航布局
    - 外观主题
    - 语言与区域
  - 工具调用
```

语言设置字段：

- 显示语言：`zh-CN` / `en-US`
- 区域格式：默认跟随显示语言，后续可独立设置
- 趋势色规则：默认跟随区域，也可在高级设置里覆盖

## 5. 数据模型改造

### 5.1 模板本地化

当前模板字段示例：

```json
{
  "id": "strategic-overview",
  "name": "CEO战略总览驾驶舱",
  "domain": "战略管理",
  "description": "{{name}} — 企业战略健康度一站式总览"
}
```

建议新增可选 `i18n` 字段：

```json
{
  "id": "strategic-overview",
  "name": "CEO战略总览驾驶舱",
  "domain": "战略管理",
  "description": "{{name}} — 企业战略健康度一站式总览",
  "i18n": {
    "en-US": {
      "name": "CEO Strategic Overview Cockpit",
      "domain": "Strategy Management",
      "description": "{{name}} — an executive overview across strategy, finance, customer, operations, people and risk"
    }
  }
}
```

读取规则：

1. 如果请求 locale 有对应 `i18n[locale]`，优先使用。
2. 否则使用根字段。
3. 根字段继续作为默认中文和向后兼容来源。

### 5.2 Widget 本地化

Widget 建议支持：

```json
{
  "id": "w-revenue",
  "type": "metric",
  "title": "营收达成率",
  "data": {
    "caption": "展示当前营收完成情况、同比变化和目标达成状态。"
  },
  "i18n": {
    "en-US": {
      "title": "Revenue Attainment",
      "data": {
        "caption": "Shows current revenue attainment, YoY change and target progress."
      }
    }
  }
}
```

不建议本地化：

- `id`
- `type`
- `position`
- `dataIntent.metricKey`
- `dataSource`
- `thresholds`
- `visualMapping`

建议本地化：

- `title`
- `description`
- `caption`
- `summary`
- `detail.content`
- `data.labels`
- `data.columns`
- `data.rows` 中的表头类字段

对于真实业务数据，需要区分“字段名”和“数据值”。字段名可本地化，业务值默认不自动翻译。

### 5.3 组件目录本地化

`server/data/widget-catalog.json` 建议支持：

```json
{
  "type": "metric",
  "name": "指标卡",
  "description": "展示核心 KPI 指标",
  "schemaHint": "data.value 为主指标值",
  "i18n": {
    "en-US": {
      "name": "Metric Card",
      "description": "Displays a primary KPI metric.",
      "schemaHint": "data.value is the primary metric value."
    }
  }
}
```

### 5.4 Workspace 内容语言

建议在 workspace 增加可选字段：

```ts
interface Workspace {
  locale?: string;
  contentLocale?: string;
}
```

含义：

- `locale`：创建或显示时的目标 locale。
- `contentLocale`：当前业务内容实际语言。

对于 YonClaw 或 LLM 生成内容，应记录 `contentLocale`，避免切换 UI 语言时误认为业务报告也应自动变更。

## 6. 后端协议改造

### 6.1 Locale 传递

前端请求建议统一带：

```http
Accept-Language: en-US
```

也可以支持 query fallback：

```http
GET /api/templates?locale=en-US
```

后端 locale 解析优先级：

1. query `locale`
2. header `Accept-Language`
3. 默认 `zh-CN`

### 6.2 模板和组件目录返回

建议在后端增加本地化 merge 工具：

```ts
function localizeEntity<T extends { i18n?: Record<string, Partial<T>> }>(
  entity: T,
  locale: string
): T {
  return {
    ...entity,
    ...(entity.i18n?.[locale] || {}),
  };
}
```

注意事项：

- 需要递归处理 widget 的 `i18n` 字段。
- 不应覆盖 `id/type/position/dataSource` 等系统字段。
- 返回给前端时可保留或移除 `i18n`，建议管理端保留，普通展示端可不返回。

### 6.3 创建驾驶舱协议

创建请求建议扩展：

```json
{
  "name": "CFO cockpit",
  "templateId": "cfo-finance",
  "locale": "en-US",
  "contentLocale": "en-US"
}
```

LLM 初始化 prompt 应带语言要求：

```text
Please generate all user-visible titles, captions, summaries and report content in en-US.
Keep stable schema keys such as id, type, dataIntent, metricKey unchanged.
```

中文：

```text
请使用简体中文生成所有用户可见的标题、说明、摘要与报告内容。
id、type、dataIntent、metricKey 等稳定结构字段必须保持不变。
```

## 7. 区域化格式

建议新增格式化工具：

```text
src/lib/formatters.ts
```

能力：

```ts
formatDate(value, locale)
formatDateTime(value, locale)
formatNumber(value, locale)
formatPercent(value, locale)
formatCurrency(value, currency, locale)
formatRelativeTime(value, locale)
```

替换原则：

- 不在组件里直接写 `zh-CN`。
- 不在组件里直接拼接货币符号。
- 不在组件里直接拼接日期格式。

示例：

```ts
new Intl.DateTimeFormat(locale, {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(date);
```

## 8. 区域视觉语义

当前系统已经出现中文语境的趋势色要求：

- 中文语境：上涨红色，下跌绿色。
- 西方默认语境：上涨绿色，下跌红色。

建议把趋势色从固定 Tailwind class 升级为 CSS token：

```css
:root {
  --trend-up: 0 72% 51%;
  --trend-down: 142 71% 45%;
}

[data-trend-color-scheme="western"] {
  --trend-up: 142 71% 45%;
  --trend-down: 0 72% 51%;
}
```

趋势类样式使用：

```ts
{
  text: 'text-trend-up',
  bg: 'bg-trend-up/8',
  border: 'border-trend-up/15'
}
```

需要分清：

- 趋势色：上涨、下跌、持平。
- 状态色：成功、失败、告警、健康、异常。
- 品牌色：主色、强调色。
- 图表分类色：多系列图表的类别区分。

状态色不应随 locale 变化。

## 9. 动态内容策略

动态内容来源包括：

- 用户输入
- YonClaw 生成
- OpenClaw / Hermes 等外部平台
- LLM 初始化
- 模板演示数据

第一阶段不建议自动翻译动态内容。原因：

- 报告可能包含专业术语，自动翻译可能改变含义。
- 数据字段和值可能混合，容易误翻译。
- HTML 报告需要保持原结构。

建议策略：

```ts
interface LocalizedContentMeta {
  contentLocale?: string;
  sourceLocale?: string;
  generatedBy?: string;
}
```

切换 UI 语言时：

- 产品 UI 立即切换。
- 已生成报告/业务内容保持原语言。
- 后续可提供“翻译此报告”按钮，生成新的 translated view。

## 10. 迁移阶段

### 第一阶段：基础设施

目标：让应用具备语言包能力。

任务：

- 引入 i18n 初始化。
- 建立 `src/i18n/locales`。
- 增加语言设置和 localStorage 持久化。
- 抽出 `common/settings/workspace/widget/errors` 基础语言包。
- 替换主路径硬编码文案。

优先改造页面：

1. 首页和驾驶舱入口。
2. 常用配置。
3. 驾驶舱详情页。
4. 组件详情抽屉。
5. 创建弹窗。

### 第二阶段：模板与组件目录

目标：配置型内容可多语展示。

任务：

- `builtin-templates.json` 增加 `i18n` 扩展。
- `widget-catalog.json` 增加 `i18n` 扩展。
- 后端模板接口按 locale merge。
- 模板管理支持编辑多语言字段。
- 组件管理支持编辑多语言说明和 schema hint。

### 第三阶段：格式化和区域视觉

目标：日期、数字、货币和趋势色区域化。

任务：

- 新增 formatter 工具。
- 替换固定 `Intl.DateTimeFormat('zh-CN')`。
- 增加趋势色 token。
- 将 `getTrendSemanticClasses` 调整为读取区域策略。
- 支持 `zh-CN` 和 `en-US` 下不同趋势色方案。

### 第四阶段：外部协议和 LLM

目标：外部创建和动态生成内容具备 locale 感知。

任务：

- 创建驾驶舱 API 增加 `locale`。
- workspace 增加 `locale/contentLocale`。
- YonClaw 外部同步协议补充 locale。
- LLM 初始化 prompt 增加语言要求。
- 保留动态内容原始语言。

### 第五阶段：质量保障

目标：避免多语改造后出现遗漏、布局溢出、格式错误。

任务：

- 增加 i18n key 缺失测试。
- 增加语言包 JSON schema 校验。
- 增加关键页面 `zh-CN/en-US` Playwright 截图回归。
- 增加长英文文本布局检查。
- 增加 RTL 预研，不作为第一阶段交付。

## 11. 验收标准

基础能力：

- 用户可在设置中切换语言。
- 刷新后语言选择保持。
- 首页、设置、创建弹窗、驾驶舱详情、详情抽屉无主要硬编码中文 UI。
- 缺失翻译时能 fallback 到默认语言，不导致空白。

模板和组件：

- 模板列表能按语言展示名称、描述、领域。
- 组件目录能按语言展示名称、说明、配置说明。
- 管理员可理解并配置多语言字段。

格式化：

- 日期格式随 locale 变化。
- 数字、百分比、货币格式随 locale 变化。
- 不再出现固定 `zh-CN` 的展示格式。

视觉语义：

- `zh-CN` 下上涨红色、下跌绿色。
- `en-US` 下可配置为上涨绿色、下跌红色。
- 告警、错误、成功、健康状态色不被趋势色规则影响。

动态内容：

- 已生成中文报告在切换英文 UI 后不会被错误翻译或破坏。
- 新建英文驾驶舱时，LLM/YonClaw 可按 `locale` 生成英文可见内容。

## 12. 推荐优先级

建议优先级如下：

1. i18n 基础设施和语言设置。
2. 首页、设置、驾驶舱详情主路径语言包化。
3. 模板和组件目录 `i18n` 字段扩展。
4. 后端接口 locale merge。
5. 日期、数字、货币格式化。
6. 区域趋势色 token 化。
7. LLM/YonClaw 协议 locale 扩展。
8. 管理端多语言编辑能力。

## 13. 关键决策建议

建议采用：

- UI 多语言：`i18next + react-i18next`
- 语言包格式：按 namespace 拆分 JSON
- 模板/组件多语言：现有字段 + `i18n` 扩展字段
- 后端本地化：按请求 locale merge 返回
- 动态内容：记录 `contentLocale`，不默认自动翻译
- 区域视觉：通过 CSS token 和 locale/region 策略解决

不建议：

- 直接把所有中文替换成英文。
- 把业务数据内容强制语言包化。
- 将 `id/type/metricKey/dataIntent` 等稳定字段本地化。
- 把趋势色和状态色合并成一套规则。

