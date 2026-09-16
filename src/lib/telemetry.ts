const CONSENT_KEY = "xmem.telemetry.consent";
const EVENTS_KEY = "xmem.telemetry.events";
const MAX_EVENTS = 100;

export interface TelemetryEvent {
  at: number;
  name: string;
  props?: Record<string, string>;
}

export async function isTelemetryEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(CONSENT_KEY);
  return (stored[CONSENT_KEY] as boolean | undefined) === true;
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [CONSENT_KEY]: enabled });
  if (!enabled) await chrome.storage.local.remove(EVENTS_KEY);
}

export async function recordEvent(name: string, props?: Record<string, string>): Promise<boolean> {
  if (!(await isTelemetryEnabled())) return false;
  const stored = await chrome.storage.local.get(EVENTS_KEY);
  const events = (stored[EVENTS_KEY] as TelemetryEvent[] | undefined) ?? [];
  const event: TelemetryEvent = { at: Date.now(), name };
  if (props !== undefined) event.props = props;
  events.push(event);
  await chrome.storage.local.set({ [EVENTS_KEY]: events.slice(-MAX_EVENTS) });
  return true;
}

export async function listEvents(): Promise<TelemetryEvent[]> {
  const stored = await chrome.storage.local.get(EVENTS_KEY);
  return (stored[EVENTS_KEY] as TelemetryEvent[] | undefined) ?? [];
}

export async function clearEvents(): Promise<void> {
  await chrome.storage.local.remove(EVENTS_KEY);
}

export async function exportEvents(): Promise<string> {
  return JSON.stringify(await listEvents());
}
