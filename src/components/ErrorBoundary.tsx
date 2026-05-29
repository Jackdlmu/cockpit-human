// ─── Error Boundary ───
// React 错误边界：捕获子组件渲染错误，防止整站白屏

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** 错误上下文（如 widget 类型、标题等），用于日志定位 */
  context?: Record<string, unknown>;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const ctx = this.props.context || {};
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Context:', JSON.stringify(ctx));
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-6 rounded-xl bg-app-surface border border-red-500/20 text-app-text">
          <h3 className="text-sm font-semibold text-red-400 mb-2">组件渲染出错</h3>
          <p className="text-xs text-app-text-muted mb-3">
            该组件遇到错误，已自动隔离以防止影响其他功能。
          </p>
          <details className="text-[10px] text-app-text-subtle">
            <summary className="cursor-pointer hover:text-app-text-muted">查看详情</summary>
            <pre className="mt-2 p-2 rounded bg-app-bg overflow-auto max-h-[120px]">
              {this.state.error?.message}
            </pre>
          </details>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-3 px-3 py-1.5 rounded-lg text-[10px] bg-app-surface-hover hover:bg-app-surface-subtle transition-colors"
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** 轻量版错误边界：用于 Widget 级别 */
export function WidgetErrorFallback({ type, title }: { type?: string; title?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-app-text-subtle gap-1 px-2">
      <div className="text-xs">组件渲染失败</div>
      <div className="text-[10px] text-app-text-subtle">数据格式可能不正确</div>
      {type && (
        <div className="text-[9px] text-app-text-subtle/60 mt-0.5">
          类型: {type} {title ? `· ${title}` : ''}
        </div>
      )}
      <div className="text-[9px] text-app-text-subtle/40 mt-1">
        请打开浏览器控制台查看详细错误信息
      </div>
    </div>
  );
}
