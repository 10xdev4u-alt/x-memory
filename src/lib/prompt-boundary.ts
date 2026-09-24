export function untrustedSource(label: string, value: string): string {
  const safeLabel = label.replace(/[\u0000-\u001f<>"]/g, "");
  const safeValue = value.replaceAll("<", "‹").replaceAll(">", "›");
  return [
    `<untrusted_source label="${safeLabel}">`,
    safeValue,
    "</untrusted_source>",
  ].join("\n");
}
