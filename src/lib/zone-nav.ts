export const ZONES = ["library", "reader", "paper"] as const;

export type Zone = (typeof ZONES)[number];

export function isZone(value: string): value is Zone {
  return (ZONES as readonly string[]).includes(value);
}

export function nextZone(current: Zone): Zone {
  return ZONES[(ZONES.indexOf(current) + 1) % ZONES.length] ?? "library";
}

export function zoneIndex(zone: Zone): number {
  return ZONES.indexOf(zone);
}
