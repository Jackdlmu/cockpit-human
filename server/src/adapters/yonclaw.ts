// ─── YonClaw / OpenClaw 专用适配器 ───
// 预留扩展：对接 YonClaw 内核的专用协议
// 当前继承 HttpAdapter，未来可覆盖为 gRPC / WebSocket / 专用 SDK

import { HttpAdapter } from './http';

export class YonClawAdapter extends HttpAdapter {
  // 未来可在此添加 YonClaw 特有的能力：
  // - 技能发现与调用
  // - 流程编排引擎对接
  // - 大模型上下文管理
  // - 企业权限体系对接
}
