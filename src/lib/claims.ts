import { getRecord, openDb, putRecords, type ClaimRecord, type ClaimStatus } from "./db.js";
import { extractModelEvidence } from "./evidence.js";
import { collectBriefText, type GrokSend } from "./briefs.js";
import { ThrottleQueue } from "./queue.js";

const MAX_MODEL_OUTPUT_LENGTH = 20_000;

export interface VerdictResult {
  evidence: string;
  source: string;
  status: ClaimStatus;
}

export function buildVerifyPrompt(claim: string): string {
  return [
    "Check whether the claim below still holds today.",
    "Start your reply with exactly one word: CONFIRMED, EVOLVED, or DEAD.",
    "Then provide Source: followed by one HTTP(S) URL and Evidence: followed by one line.",
    "If you cannot provide a source, use EVOLVED and explain why.",
    "",
    `Claim: ${claim.slice(0, 1000)}`,
  ].join("\n");
}

export function parseVerdict(reply: string): VerdictResult {
  if (reply.length > MAX_MODEL_OUTPUT_LENGTH) return { evidence: "", source: "", status: "evolving" };
  const match = /^\s*(CONFIRMED|EVOLVED|DEAD)\b[\s:,\-]*(.*)$/is.exec(reply.trim());
  const evidence = extractModelEvidence(reply, match?.[2] ?? reply.trim());
  if (match?.[1] === undefined || !evidence.sourceIsStrong || evidence.text === "") {
    return { evidence: evidence.text, source: evidence.source, status: "evolving" };
  }
  const word = match[1].toLowerCase();
  const status: ClaimStatus = word === "confirmed" ? "fresh" : word === "dead" ? "dead" : "evolving";
  return { evidence: evidence.text, source: evidence.source, status };
}

export interface VerifyDeps {
  conversationId: string;
  dbFactory?: IDBFactory;
  dbName?: string;
  onVerdict?: (claimId: string, status: ClaimStatus) => void;
  queue?: ThrottleQueue;
  send: GrokSend;
}

export interface VerifyResult {
  checked: number;
  dead: number;
  evolved: number;
}

export async function verifyClaims(claims: ClaimRecord[], deps: VerifyDeps): Promise<VerifyResult> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  const queue = deps.queue ?? new ThrottleQueue();
  const result: VerifyResult = { checked: 0, dead: 0, evolved: 0 };
  try {
    for (const claim of claims) {
      if (claim.status === "dead") continue;
      const reply = await queue.enqueue(() =>
        collectBriefText(deps.send, { conversationId: deps.conversationId, message: buildVerifyPrompt(claim.text) }),
      );
      const verdict = parseVerdict(reply);
      const now = Date.now();
      await putRecords(db, "claims", [{
        ...claim,
        checkedAt: now,
        evidence: verdict.evidence,
        evidenceAt: now,
        evidenceSource: verdict.source,
        evidenceVerified: false,
        status: verdict.status,
      }]);
      result.checked += 1;
      if (verdict.status === "dead") result.dead += 1;
      if (verdict.status === "evolving") result.evolved += 1;
      deps.onVerdict?.(claim.id, verdict.status);
    }
  } finally {
    db.close();
  }
  return result;
}

export async function recordClaims(
  claims: ClaimRecord[],
  deps: { dbFactory?: IDBFactory; dbName?: string },
): Promise<void> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  try {
    for (const claim of claims) {
      const existing = await getRecord(db, "claims", claim.id);
      if (existing === undefined) await putRecords(db, "claims", [claim]);
    }
  } finally {
    db.close();
  }
}
