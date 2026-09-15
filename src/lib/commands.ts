export type CommandId =
  | "go-library"
  | "go-reader"
  | "go-paper"
  | "sync-now"
  | "check-session";

export interface PanelCommand {
  id: CommandId;
  title: string;
  hint: string;
}

export const COMMANDS: PanelCommand[] = [
  { hint: "1", id: "go-library", title: "Go to Library" },
  { hint: "2", id: "go-reader", title: "Go to Reader" },
  { hint: "3", id: "go-paper", title: "Go to Paper" },
  { hint: "s", id: "sync-now", title: "Sync now" },
  { hint: "c", id: "check-session", title: "Check session" },
];

export function filterCommands(query: string): PanelCommand[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...COMMANDS];
  return COMMANDS.filter((command) => command.title.toLowerCase().includes(needle));
}
