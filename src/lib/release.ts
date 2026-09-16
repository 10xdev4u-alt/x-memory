export type ReleaseChannel = "stable" | "beta";

export function packageName(version: string, channel: ReleaseChannel): string {
  const suffix = channel === "beta" ? "-beta" : "";
  return `x-memory-${version}${suffix}.zip`;
}
