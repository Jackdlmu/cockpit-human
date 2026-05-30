# P0 / P1 加固执行状态

## 本轮已完成

- `P0` 安全与稳定加固
  - 模板管理、组件管理、连接写操作已接入真实管理员鉴权，统一使用 `X-Admin-Key`
  - 连接存储已拆分为：
    - `connections.json`：非敏感主配置
    - `connection-secrets.json`：本地运行态密钥
  - 连接接口默认返回脱敏配置，不再向前端回传明文 `apiKey/token/pat`
  - 模板、组件、连接存储统一补上：
    - 原子写入
    - `.bak` 备份恢复
  - 服务补充 `GET /api/ready`
  - `GET /api/health` 增加 readiness 摘要

- `P1` 单节点生产可用版
  - 工作区列表/详情读取统一改为 `workspaceStore`，避免读写分裂
  - 驾驶舱初始化升级为持久化任务：
    - `workspace-init-jobs.json`
    - 任务状态：`pending/running/succeeded/failed`
    - 自动重试
    - 启动恢复未完成任务
  - workspace 增加初始化运行态字段：
    - `initializing`
    - `initializationMode`
    - `initializationJobId`
    - `initializationError`
    - `initializedAt`
  - 增加本地审计日志：
    - `audit-log.jsonl`

## 当前约束

- 本轮仍然是单节点文件存储方案，适合当前“继续可用 + 先做商业集成准备”的阶段，不等同于正式多租户生产架构
- 事件总线历史仍以内存为主，审计日志已落盘，但完整事件持久化与回放仍属于后续增强项
- 真实密钥仍保存在本地文件，只是从主配置中剥离，正式商业化仍应进入 Secret Manager

## 启动要求

- 若需要管理模板、组件、连接，服务端必须配置：

```bash
export ADMIN_KEY="your-admin-key"
```

- 前端管理页继续通过 `localStorage.adminKey` 或既有输入入口传递 `X-Admin-Key`

## 后续建议

- 下一阶段优先继续做：
  - 事件历史持久化
  - 初始化任务并发控制与超时治理
  - PostgreSQL / Redis 迁移准备
  - 面向 YonClaw 的租户、组织、权限继承
