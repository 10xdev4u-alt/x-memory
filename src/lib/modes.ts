export type GrokMode = "fast" | "think";

export type TaskClass = "brief" | "extract" | "ask" | "verify" | "judge" | "resolve";

const ROUTES: Record<TaskClass, GrokMode> = {
  ask: "fast",
  brief: "fast",
  extract: "fast",
  judge: "think",
  resolve: "think",
  verify: "think",
};

export interface ModeOptions {
  fast: string;
  think: string;
}

const OPTIONS_KEY = "xmem.modelOptions";

const DEFAULT_OPTIONS: ModeOptions = { fast: "", think: "" };

export function routeTask(task: TaskClass, override?: GrokMode): GrokMode {
  return override ?? ROUTES[task];
}

export async function readModelOptions(): Promise<ModeOptions> {
  const stored = await chrome.storage.local.get(OPTIONS_KEY);
  const options = stored[OPTIONS_KEY] as Partial<ModeOptions> | undefined;
  return { fast: options?.fast ?? "", think: options?.think ?? "" };
}

export async function writeModelOptions(options: ModeOptions): Promise<void> {
  await chrome.storage.local.set({ [OPTIONS_KEY]: options });
}

export function optionFor(mode: GrokMode, options: ModeOptions): string {
  return options[mode];
}

export { DEFAULT_OPTIONS };
