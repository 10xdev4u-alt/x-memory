import { classifyTheme, writeDetectedTheme } from "../lib/theme.js";

async function detectTheme(): Promise<void> {
  const background = getComputedStyle(document.body).backgroundColor;
  await writeDetectedTheme(classifyTheme(background));
}

console.debug("[x-memory] session client loaded");
void detectTheme();
