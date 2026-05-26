// ─── 协议适配层：统一导出 ───

export * from './types';
export * from './manager';
export { GenericLLMConnector } from './connectors/generic-llm';
export { BaseConnector } from './connectors/base';
