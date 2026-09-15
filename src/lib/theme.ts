export type XTheme = "light" | "dim" | "dark";
export type ThemeOverride = "auto" | XTheme;

const THEME_KEY = "xmem.theme.override";
const DETECTED_KEY = "xmem.theme.detected";

function luminance(red: number, green: number, blue: number): number {
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

export function classifyTheme(background: string): XTheme {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(background);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return "dark";
  }
  const light = luminance(Number(match[1]), Number(match[2]), Number(match[3]));
  if (light > 0.7) return "light";
  if (light > 0.05) return "dim";
  return "dark";
}

export function resolveTheme(override: ThemeOverride, detected: XTheme): XTheme {
  return override === "auto" ? detected : override;
}

export async function readThemeOverride(): Promise<ThemeOverride> {
  const stored = await chrome.storage.local.get(THEME_KEY);
  const value = stored[THEME_KEY] as ThemeOverride | undefined;
  return value ?? "auto";
}

export async function writeThemeOverride(override: ThemeOverride): Promise<void> {
  await chrome.storage.local.set({ [THEME_KEY]: override });
}

export async function readDetectedTheme(): Promise<XTheme> {
  const stored = await chrome.storage.local.get(DETECTED_KEY);
  return (stored[DETECTED_KEY] as XTheme | undefined) ?? "dark";
}

export async function writeDetectedTheme(theme: XTheme): Promise<void> {
  await chrome.storage.local.set({ [DETECTED_KEY]: theme });
}

export async function applyTheme(root: HTMLElement): Promise<XTheme> {
  const theme = resolveTheme(await readThemeOverride(), await readDetectedTheme());
  root.dataset["theme"] = theme;
  return theme;
}
