export type FunnelStage = "install" | "session" | "sync" | "brief" | "paper" | "weekly";

export const FUNNEL_STAGES: FunnelStage[] = ["install", "session", "sync", "brief", "paper", "weekly"];

export interface FunnelSignals {
  briefs: number;
  hasPaper: boolean;
  posts: number;
  reviews: number;
  sessionActive: boolean;
}

export interface FunnelReport {
  dropOff?: FunnelStage;
  reached: Record<FunnelStage, boolean>;
}

export function measureFunnel(signals: FunnelSignals): FunnelReport {
  const reached: Record<FunnelStage, boolean> = {
    brief: signals.briefs > 0,
    install: true,
    paper: signals.hasPaper,
    session: signals.sessionActive,
    sync: signals.posts > 0,
    weekly: signals.reviews >= 2,
  };
  let dropOff: FunnelStage | undefined;
  for (const stage of FUNNEL_STAGES) {
    if (!reached[stage]) {
      dropOff = stage;
      break;
    }
  }
  if (dropOff === undefined) return { reached };
  return { dropOff, reached };
}

export function funnelSummary(report: FunnelReport): string {
  if (report.dropOff === undefined) return "Funnel complete through weekly habit.";
  const index = FUNNEL_STAGES.indexOf(report.dropOff);
  const done = FUNNEL_STAGES.slice(0, index).join(", ");
  return `Drop-off at ${report.dropOff} after ${done === "" ? "nothing" : done}.`;
}
