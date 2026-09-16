import type { PredictionRecord } from "./db.js";

const WAGERS_KEY = "xmem.wagers";

export type WagerStance = "true" | "false";

export interface Wager {
  confidence: number;
  createdAt: number;
  id: string;
  predictionId: string;
  resolvedAt?: number;
  correct?: boolean;
  stance: WagerStance;
}

function freshId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `w-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export async function listWagers(): Promise<Wager[]> {
  const stored = await chrome.storage.local.get(WAGERS_KEY);
  return (stored[WAGERS_KEY] as Wager[] | undefined) ?? [];
}

export async function placeWager(predictionId: string, stance: WagerStance, confidence: number, now: number): Promise<Wager> {
  if (!(confidence > 0 && confidence <= 1)) {
    throw new Error("confidence must be within (0, 1]");
  }
  const existing = (await listWagers()).filter((wager) => wager.predictionId !== predictionId);
  const wager: Wager = { confidence, createdAt: now, id: freshId(), predictionId, stance };
  existing.push(wager);
  await chrome.storage.local.set({ [WAGERS_KEY]: existing });
  return wager;
}

export async function settleWagers(predictions: PredictionRecord[], now: number): Promise<Wager[]> {
  const byId = new Map(predictions.map((prediction) => [prediction.id, prediction]));
  const wagers = await listWagers();
  let changed = false;
  for (const wager of wagers) {
    if (wager.resolvedAt !== undefined) continue;
    const prediction = byId.get(wager.predictionId);
    if (prediction === undefined || prediction.status === "open" || prediction.status === "expired") continue;
    wager.correct = (wager.stance === "true") === (prediction.status === "resolved-true");
    wager.resolvedAt = now;
    changed = true;
  }
  if (changed) await chrome.storage.local.set({ [WAGERS_KEY]: wagers });
  return wagers.filter((wager) => wager.resolvedAt !== undefined);
}

export interface Calibration {
  brier: number;
  calibration: number;
  resolved: number;
}

export function calibrationScore(wagers: Wager[]): Calibration | undefined {
  const settled = wagers.filter((wager) => wager.resolvedAt !== undefined && wager.correct !== undefined);
  if (settled.length === 0) return undefined;
  let squared = 0;
  for (const wager of settled) {
    const predicted = wager.stance === "true" ? wager.confidence : 1 - wager.confidence;
    const actual = wager.correct === true ? 1 : 0;
    squared += (predicted - actual) ** 2;
  }
  const brier = squared / settled.length;
  return { brier, calibration: 1 - brier, resolved: settled.length };
}
