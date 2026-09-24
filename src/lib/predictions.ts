import { getRecord, openDb, putRecords, type PredictionRecord, type PredictionStatus } from "./db.js";
import { extractModelEvidence } from "./evidence.js";
import { collectBriefText, type GrokSend } from "./briefs.js";
import { ThrottleQueue } from "./queue.js";

const MAX_MODEL_OUTPUT_LENGTH = 20_000;

export interface ExtractedPrediction {
  targetDate?: number;
  text: string;
}

export function buildExtractPrompt(postText: string, authorHandle: string): string {
  return [
    "List dated predictions in the post below, one per line.",
    "Each line must read: - <prediction> (by YYYY-MM-DD). Omit the date when none is stated.",
    "Reply with nothing when the post predicts nothing.",
    "",
    `Post by @${authorHandle !== "" ? authorHandle : "?"}:`,
    postText.slice(0, 1500),
  ].join("\n");
}

export function parsePredictionLines(reply: string): ExtractedPrediction[] {
  if (reply.length > MAX_MODEL_OUTPUT_LENGTH) return [];
  const predictions: ExtractedPrediction[] = [];
  for (const line of reply.split("\n")) {
    const match = /^-\s+(.+?)(?:\s+\(by\s+(\d{4}-\d{2}-\d{2})\))?\s*$/.exec(line.trim());
    if (match?.[1] === undefined) continue;
    const parsed: ExtractedPrediction = { text: match[1].trim() };
    if (match[2] !== undefined) {
      const date = Date.parse(`${match[2]}T00:00:00Z`);
      if (!Number.isNaN(date)) parsed.targetDate = date;
    }
    if (parsed.text !== "") predictions.push(parsed);
  }
  return predictions;
}

export interface ResolutionResult {
  evidence: string;
  source: string;
  status: PredictionStatus;
}

export function buildResolvePrompt(prediction: string): string {
  return [
    "Has the prediction below come true as of today?",
    "Start with exactly one word: TRUE, FALSE, or UNCLEAR.",
    "Then provide Source: followed by one HTTP(S) URL and Evidence: followed by one line.",
    "If you cannot provide a source, use UNCLEAR and explain why.",
    "",
    `Prediction: ${prediction.slice(0, 1000)}`,
  ].join("\n");
}

export function parseResolution(reply: string): ResolutionResult {
  if (reply.length > MAX_MODEL_OUTPUT_LENGTH) return { evidence: "", source: "", status: "open" };
  const match = /^\s*(TRUE|FALSE|UNCLEAR)\b[\s:,\-]*(.*)$/is.exec(reply.trim());
  const evidence = extractModelEvidence(reply, match?.[2] ?? reply.trim());
  if (match?.[1] === undefined || !evidence.sourceIsStrong || evidence.text === "") {
    return { evidence: evidence.text, source: evidence.source, status: "open" };
  }
  const word = match[1].toLowerCase();
  const status: PredictionStatus = word === "true" ? "resolved-true" : word === "false" ? "resolved-false" : "open";
  return { evidence: evidence.text, source: evidence.source, status };
}

export interface ResolveDeps {
  conversationId: string;
  dbFactory?: IDBFactory;
  dbName?: string;
  onlyDue?: boolean;
  onResolve?: (id: string, status: PredictionStatus) => void;
  queue?: ThrottleQueue;
  send: GrokSend;
}

export interface ResolveResult {
  expired: number;
  resolved: number;
  stillOpen: number;
}

export async function resolvePredictions(predictions: PredictionRecord[], deps: ResolveDeps): Promise<ResolveResult> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  const queue = deps.queue ?? new ThrottleQueue();
  const now = Date.now();
  const result: ResolveResult = { expired: 0, resolved: 0, stillOpen: 0 };
  try {
    for (const prediction of predictions) {
      if (prediction.status !== "open") continue;
      if (prediction.targetDate !== undefined && prediction.targetDate < now - 30 * 24 * 60 * 60 * 1000) {
        await putRecords(db, "predictions", [{ ...prediction, checkedAt: now, status: "expired" as const }]);
        result.expired += 1;
        continue;
      }
      if (deps.onlyDue === true && prediction.targetDate !== undefined && prediction.targetDate > now) continue;
      const reply = await queue.enqueue(() =>
        collectBriefText(deps.send, { conversationId: deps.conversationId, message: buildResolvePrompt(prediction.text) }),
      );
      const resolution = parseResolution(reply);
      await putRecords(db, "predictions", [{
        ...prediction,
        checkedAt: now,
        evidence: resolution.evidence,
        evidenceAt: now,
        evidenceSource: resolution.source,
        evidenceVerified: false,
        status: resolution.status,
      }]);
      if (resolution.status === "open") result.stillOpen += 1;
      else result.resolved += 1;
      deps.onResolve?.(prediction.id, resolution.status);
    }
  } finally {
    db.close();
  }
  return result;
}

export async function recordPredictions(
  predictions: PredictionRecord[],
  deps: { dbFactory?: IDBFactory; dbName?: string },
): Promise<void> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  try {
    for (const prediction of predictions) {
      const existing = await getRecord(db, "predictions", prediction.id);
      if (existing === undefined) await putRecords(db, "predictions", [prediction]);
    }
  } finally {
    db.close();
  }
}
