import { SessionError } from "./session-client.js";

export interface QueueOptions {
  minIntervalMs: number;
  maxAttempts: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface QueueStats {
  pending: number;
  lastStartAt: number;
}

const RETRYABLE = new Set(["rate-limited", "server", "network"]);

const DEFAULTS = { baseDelayMs: 1000, maxAttempts: 4, minIntervalMs: 1200 };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ThrottleQueue {
  private readonly options: Required<QueueOptions>;
  private lastStartAt = 0;
  private pending = 0;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options?: Partial<QueueOptions>) {
    this.options = {
      baseDelayMs: options?.baseDelayMs ?? DEFAULTS.baseDelayMs,
      maxAttempts: options?.maxAttempts ?? DEFAULTS.maxAttempts,
      minIntervalMs: options?.minIntervalMs ?? DEFAULTS.minIntervalMs,
      now: options?.now ?? Date.now,
      sleep: options?.sleep ?? defaultSleep,
    };
  }

  stats(): QueueStats {
    return { lastStartAt: this.lastStartAt, pending: this.pending };
  }

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.pending += 1;
    const run = this.tail.then(() => this.execute(task)).finally(() => {
      this.pending -= 1;
    });
    this.tail = run.catch(() => undefined);
    return run as Promise<T>;
  }

  private async execute<T>(task: () => Promise<T>): Promise<T> {
    const { baseDelayMs, maxAttempts, minIntervalMs, now, sleep } = this.options;
    let attempt = 0;
    for (;;) {
      const wait = this.lastStartAt + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      this.lastStartAt = now();
      attempt += 1;
      try {
        return await task();
      } catch (error) {
        const retryable = error instanceof SessionError && RETRYABLE.has(error.kind);
        if (!retryable || attempt >= maxAttempts) throw error;
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
}
