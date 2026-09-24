import { allRecords, openDb, type PostRecord, type PredictionRecord } from "./db.js";
import { dueReviews } from "./review.js";
import { findContradictionPairs } from "./debates.js";
import { missedFromTrusted } from "./missed.js";
import { buildMorningPaper, type MorningPaper, type PaperClash, type PaperMiss, type PaperResolution } from "./paper.js";
import { collectBriefText, type GrokSend } from "./briefs.js";
import { ThrottleQueue } from "./queue.js";

const PAPER_KEY = "xmem.paper.latest";
const DUE_KEY = "xmem.paper.due";

export interface StoredPaper {
  markdown: string;
  speech: string;
}

export interface PaperJobDeps {
  conversationId?: string;
  dbFactory?: IDBFactory;
  dbName?: string;
  queue?: ThrottleQueue;
  send?: GrokSend;
  since: number;
}

function stores(deps: PaperJobDeps): { dbFactory?: IDBFactory; dbName?: string } {
  const out: { dbFactory?: IDBFactory; dbName?: string } = {};
  if (deps.dbFactory !== undefined) out.dbFactory = deps.dbFactory;
  if (deps.dbName !== undefined) out.dbName = deps.dbName;
  return out;
}

export async function gatherPaperInput(deps: PaperJobDeps): Promise<{
  clashes: PaperClash[];
  missed: PaperMiss[];
  resolutions: PaperResolution[];
  reviewsDue: number;
}> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  try {
    const predictions = await allRecords<PredictionRecord>(db, "predictions");
    const resolutions: PaperResolution[] = [];
    for (const prediction of predictions) {
      if (
        (prediction.status === "resolved-true" || prediction.status === "resolved-false") &&
        prediction.checkedAt >= deps.since
      ) {
        resolutions.push({
          evidence: prediction.evidence ?? "",
          evidenceAt: prediction.evidenceAt ?? prediction.checkedAt,
          evidenceSource: prediction.evidenceSource ?? "",
          evidenceVerified: prediction.evidenceVerified === true,
          outcome: prediction.status === "resolved-true" ? "TRUE" : "FALSE",
          text: prediction.text,
        });
      }
    }
    const missedPosts = await missedFromTrusted({ ...stores(deps), since: deps.since });
    const missed: PaperMiss[] = missedPosts.slice(0, 5).map((post) => ({
      authorLine: post.authorHandle !== "" ? `@${post.authorHandle}` : post.authorId,
      text: post.text.slice(0, 200),
    }));
    const posts = await allRecords<PostRecord>(db, "posts");
    const pairs = findContradictionPairs(
      posts.slice(0, 60).map((post) => ({ authorHandle: post.authorHandle, id: post.id, text: post.text })),
    );
    const clashes: PaperClash[] = [];
    const send = deps.send;
    const conversationId = deps.conversationId;
    const first = pairs[0];
    if (first !== undefined && send !== undefined && conversationId !== undefined) {
      const a = posts.find((post) => post.id === first.postA);
      const b = posts.find((post) => post.id === first.postB);
      if (a !== undefined && b !== undefined) {
        const queue = deps.queue ?? new ThrottleQueue();
        const verdict = await queue.enqueue(() =>
          collectBriefText(send, {
            conversationId,
            message: `Two saved posts may disagree. Summarize the disagreement in two sentences. First: ${a.text.slice(0, 500)}. Second: ${b.text.slice(0, 500)}`,
          }),
        );
        clashes.push({ summary: verdict.slice(0, 500), topic: first.shared[0] ?? "disagreement" });
      }
    } else if (first !== undefined) {
      clashes.push({ summary: `${first.postA} and ${first.postB} pull opposite ways.`, topic: first.shared[0] ?? "disagreement" });
    }
    const due = await dueReviews(Date.now(), stores(deps));
    return { clashes, missed, resolutions, reviewsDue: due.length };
  } finally {
    db.close();
  }
}

export async function runPaperJob(
  deps: PaperJobDeps & { markdown: (paper: MorningPaper) => string; speech: (paper: MorningPaper) => string },
): Promise<MorningPaper> {
  const input = await gatherPaperInput(deps);
  const paper = buildMorningPaper(
    {
      clashes: input.clashes,
      date: new Date().toISOString().slice(0, 10),
      missed: input.missed,
      resolutions: input.resolutions,
      reviewsDue: input.reviewsDue,
    },
    Date.now(),
  );
  await chrome.storage.local.set({
    [PAPER_KEY]: { markdown: deps.markdown(paper), speech: deps.speech(paper) } satisfies StoredPaper,
  });
  await chrome.storage.local.remove(DUE_KEY);
  return paper;
}

export async function readLatestPaper(): Promise<StoredPaper | undefined> {
  const stored = await chrome.storage.local.get(PAPER_KEY);
  return stored[PAPER_KEY] as StoredPaper | undefined;
}

export async function markPaperDue(): Promise<void> {
  await chrome.storage.local.set({ [DUE_KEY]: Date.now() });
}

export async function isPaperDue(): Promise<boolean> {
  const stored = await chrome.storage.local.get(DUE_KEY);
  return stored[DUE_KEY] !== undefined;
}
