# YonCockpit 智能驾驶舱 · 技能安装指南

## 简介

智能驾驶舱是 YonCockpit 的核心技能，提供**多智能体聚合执行的动态呈现与管理**能力。

## 安装方式

### 方式一：独立服务（推荐开发调试）

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（可选，默认使用 mock 数据）
cp .env.example .env
# 编辑 .env 设置 ADAPTER_TYPE 和智能体平台地址

# 3. 启动服务
npm run dev

# 4. 访问
# 前端: http://localhost:3000
# 后端: http://localhost:3001
```

### 方式二：作为技能安装到 OpenClaw / YonClaw

1. 将本目录下的 `manifest.json` 复制到宿主平台的技能目录
2. 宿主平台读取 manifest，自动通过 iframe 嵌入前端页面
3. 配置 `ADAPTER_TYPE` 为 `yonclaw`，并设置平台地址
4. 宿主平台代理后端 API 请求

```json
// 宿主平台技能配置示例
{
  "skillId": "yoncockpit.cockpit",
  "config": {
    "adapterType": "yonclaw",
    "agentPlatformUrl": "http://yonclaw-internal:8080",
    "agentPlatformApiKey": "${YONCLAW_API_KEY}"
  }
}
```

## 配置说明

| 配置项 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `adapterType` | string | 是 | `mock` | 适配器类型：`mock` / `http` / `yonclaw` |
| `agentPlatformUrl` | string | 条件 | - | 智能体平台地址（非 mock 时必填） |
| `agentPlatformApiKey` | string | 否 | - | API 认证密钥 |
| `port` | integer | 否 | `3001` | 后端服务端口 |

## 适配器说明

### mock（默认）
使用本地静态数据，无需外部依赖。适合独立演示和开发测试。

### http
通过标准 REST API 对接任意智能体平台。要求外部平台提供以下接口：
- `GET /agents` — 智能体列表
- `GET /workspaces` — 驾驶舱列表
- `POST /workspaces/:id/execute` — 执行指令
- `POST /workspaces/:id/chat` — 对话（支持 SSE）

### yonclaw
对接 YonClaw / OpenClaw 内核。当前继承 http 协议，未来将支持 gRPC / 专用 SDK。

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/agents` | 智能体列表 |
| GET | `/api/agents/:id` | 智能体详情 |
| GET | `/api/agents/:id/stats` | 智能体统计 |
| GET | `/api/workspaces` | 驾驶舱列表 |
| GET | `/api/workspaces/:id` | 驾驶舱详情 |
| POST | `/api/workspaces/:id/execute` | 执行指令 |
| POST | `/api/workspaces/:id/chat` | 流式对话（SSE） |
