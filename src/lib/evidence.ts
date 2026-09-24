export interface ModelEvidence {
  source: string;
  sourceIsStrong: boolean;
  text: string;
}

function isStrongSource(source: string): boolean {
  if (!/^https?:\/\//i.test(source) || /\s/.test(source)) return false;
  try {
    const url = new URL(source);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

export function extractModelEvidence(reply: string, fallbackText = ""): ModelEvidence {
  const source = /^\s*Source:\s*(.+?)\s*$/im.exec(reply)?.[1]?.trim() ?? "";
  const evidence = /^\s*Evidence:\s*(.+?)\s*$/im.exec(reply)?.[1]?.trim();
  const text = evidence ?? (source === "" ? fallbackText.trim() : "");
  return { source, sourceIsStrong: isStrongSource(source), text: text.slice(0, 500) };
}
