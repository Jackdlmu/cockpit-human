import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, WidgetErrorFallback } from './ErrorBoundary';

// Component that throws
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test explosion');
  }
  return <div data-testid="safe">Safe content</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeDefined();
  });

  it('catches errors and shows fallback UI', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('组件渲染出错')).toBeDefined();
    expect(screen.getByText('重试')).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary onError={onError}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const [error, errorInfo] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test explosion');
    expect(errorInfo).toHaveProperty('componentStack');

    consoleSpy.mockRestore();
  });

  it('resets error state when retry clicked', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('组件渲染出错')).toBeDefined();

    // First fix the child so it won't throw on retry
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );

    // Click retry to reset error boundary state
    fireEvent.click(screen.getByText('重试'));

    expect(screen.getByTestId('safe')).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('renders custom fallback when provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom error</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeDefined();

    consoleSpy.mockRestore();
  });
});

describe('WidgetErrorFallback', () => {
  it('renders fallback message', () => {
    render(<WidgetErrorFallback />);
    expect(screen.getByText('组件渲染失败')).toBeDefined();
    expect(screen.getByText('数据格式可能不正确')).toBeDefined();
  });
});
