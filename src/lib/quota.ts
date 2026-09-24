import type { GrokEvent, GrokMessage } from "./grok.js";

const USAGE_KEY = "xmem.quota.usage";

export interface QuotaBudget {
  maxCalls: number;
  maxInputChars: number;
  windowMs: number;
}

export interface QuotaUsage {
  inputChars: number;
  calls: number;
  windowStart: number;
}

export interface QuotaStatus {
  allowed: boolean;
  remainingCalls: number;
  remainingChars: number;
  resetInMs: number;
}

export const DEFAULT_BUDGET: QuotaBudget = {
  maxCalls: 50,
  maxInputChars: 500000,
  windowMs: 60 * 60 * 1000,
};

export function estimateInputChars(text: string): number {
  return text.length;
}

export async function readUsage(): Promise<QuotaUsage | undefined> {
  const stored = await chrome.storage.local.get(USAGE_KEY);
  return stored[USAGE_KEY] as QuotaUsage | undefined;
}

export function checkQuota(budget: QuotaBudget, usage: QuotaUsage | undefined, now: number): QuotaStatus {
  const active = usage !== undefined && now - usage.windowStart < budget.windowMs ? usage : undefined;
  if (active === undefined) {
    return { allowed: true, remainingCalls: budget.maxCalls, remainingChars: budget.maxInputChars, resetInMs: 0 };
  }
  const remainingCalls = Math.max(0, budget.maxCalls - active.calls);
  const remainingChars = Math.max(0, budget.maxInputChars - active.inputChars);
  return {
    allowed: remainingCalls > 0 && remainingChars > 0,
    remainingCalls,
    remainingChars,
    resetInMs: budget.windowMs - (now - active.windowStart),
  };
}

export async function recordUsage(calls: number, inputChars: number, now: number, windowMs: number): Promise<QuotaUsage> {
  const stored = await readUsage();
  const current = stored !== undefined && now - stored.windowStart < windowMs ? stored : undefined;
  const next: QuotaUsage = {
    inputChars: (current?.inputChars ?? 0) + inputChars,
    calls: (current?.calls ?? 0) + calls,
    windowStart: current?.windowStart ?? now,
  };
  await chrome.storage.local.set({ [USAGE_KEY]: next });
  return next;
}

export class QuotaExceededError extends Error {
  readonly resetInMs: number;

  constructor(resetInMs: number) {
    super(`Grok budget exhausted, resumes in ${Math.ceil(resetInMs / 1000)}s`);
    this.resetInMs = resetInMs;
  }
}

export async function guardSend(prompt: string, budget: QuotaBudget, now: number): Promise<void> {
  const status = checkQuota(budget, await readUsage(), now);
  if (!status.allowed || estimateInputChars(prompt) > status.remainingChars) {
    throw new QuotaExceededError(status.resetInMs);
  }
}

class QuotaGate {
  private tail: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    const previous = this.tail;
    let release = (): void => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }
}

const gate = new QuotaGate();

export function createQuotaSend(
  send: (message: GrokMessage) => AsyncGenerator<GrokEvent, void, void>,
  budget: QuotaBudget = DEFAULT_BUDGET,
  now: () => number = Date.now,
): (message: GrokMessage) => AsyncGenerator<GrokEvent, void, void> {
  return async function* guardedSend(message: GrokMessage): AsyncGenerator<GrokEvent, void, void> {
    const release = await gate.acquire();
    let admitted = false;
    try {
      await guardSend(message.message, budget, now());
      admitted = true;
      for await (const event of send(message)) yield event;
    } finally {
      try {
        if (admitted) await recordUsage(1, estimateInputChars(message.message), now(), budget.windowMs);
      } finally {
        release();
      }
    }
  };
}
