type RuntimeCheckState = 'pending' | 'ready' | 'error';

export interface RuntimeCheckSnapshot {
  id: string;
  required: boolean;
  state: RuntimeCheckState;
  message?: string;
  updatedAt: string;
}

interface RuntimeCheck extends RuntimeCheckSnapshot {}

class RuntimeStatus {
  private readonly startedAt = new Date().toISOString();
  private readonly checks = new Map<string, RuntimeCheck>();

  registerCheck(id: string, required = true, message?: string): void {
    const existing = this.checks.get(id);
    if (existing) {
      return;
    }
    this.checks.set(id, {
      id,
      required,
      state: 'pending',
      message,
      updatedAt: new Date().toISOString(),
    });
  }

  markReady(id: string, message?: string): void {
    this.upsert(id, 'ready', message);
  }

  markError(id: string, message?: string): void {
    this.upsert(id, 'error', message);
  }

  markPending(id: string, message?: string): void {
    this.upsert(id, 'pending', message);
  }

  snapshot() {
    const checks = Array.from(this.checks.values()).sort((left, right) => left.id.localeCompare(right.id));
    const requiredChecks = checks.filter((item) => item.required);
    const ready = requiredChecks.every((item) => item.state === 'ready');
    const hasError = requiredChecks.some((item) => item.state === 'error');
    const status = hasError ? 'error' : ready ? 'ready' : 'starting';

    return {
      startedAt: this.startedAt,
      ready,
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private upsert(id: string, state: RuntimeCheckState, message?: string): void {
    const existing = this.checks.get(id);
    this.checks.set(id, {
      id,
      required: existing?.required ?? true,
      state,
      message,
      updatedAt: new Date().toISOString(),
    });
  }
}

export const runtimeStatus = new RuntimeStatus();
