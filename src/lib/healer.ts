import { registerOperation, resolveOperation, type OperationDescriptor, type OperationKind } from "./op-registry.js";

const OPS_KEY = "xmem.ops";
const BEARER_KEY = "xmem.bearer";

export interface StoredOperation {
  kind: OperationKind;
  queryId: string;
}

const BEARER_PATTERN = /AAAAAAAAA[A-Za-z0-9%]{40,}/;

export function scanBearer(sources: string[]): string | undefined {
  for (const source of sources) {
    const match = BEARER_PATTERN.exec(source);
    if (match !== null) return decodeURIComponent(match[0]);
  }
  return undefined;
}

export async function saveBearer(bearer: string): Promise<void> {
  await chrome.storage.local.set({ [BEARER_KEY]: bearer });
}

export async function readBearer(): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(BEARER_KEY);
  const bearer = stored[BEARER_KEY] as string | undefined;
  return bearer === "" ? undefined : bearer;
}

export async function saveOps(descriptors: OperationDescriptor[]): Promise<void> {
  const stored = await chrome.storage.local.get(OPS_KEY);
  const records = (stored[OPS_KEY] as Record<string, StoredOperation> | undefined) ?? {};
  for (const descriptor of descriptors) {
    records[descriptor.operationName] = { kind: descriptor.kind, queryId: descriptor.queryId };
  }
  await chrome.storage.local.set({ [OPS_KEY]: records });
}

export async function loadOps(names: string[]): Promise<OperationDescriptor[]> {
  const stored = await chrome.storage.local.get(OPS_KEY);
  const records = (stored[OPS_KEY] as Record<string, StoredOperation> | undefined) ?? {};
  const descriptors: OperationDescriptor[] = [];
  for (const name of names) {
    const record = records[name];
    if (record === undefined) continue;
    const descriptor: OperationDescriptor = { kind: record.kind, operationName: name, queryId: record.queryId };
    try {
      registerOperation(descriptor);
    } catch {
      if (resolveOperation(name)?.queryId !== descriptor.queryId) continue;
    }
    descriptors.push(descriptor);
  }
  return descriptors;
}

const DESCRIPTOR_PATTERN =
  /\{queryId:"([^"]+)",operationName:"([^"]+)",operationType:"(query|mutation)"\}/g;

export type ChunkRegistry = Array<[unknown, Record<string, unknown>]>;

function sourceOf(moduleValue: unknown): string {
  if (typeof moduleValue === "function") {
    try {
      return Function.prototype.toString.call(moduleValue);
    } catch {
      return "";
    }
  }
  return typeof moduleValue === "string" ? moduleValue : "";
}

export function extractDescriptors(registry: ChunkRegistry): OperationDescriptor[] {
  const found = new Map<string, OperationDescriptor>();
  for (const chunk of registry) {
    const modules = chunk[1];
    if (modules === null || typeof modules !== "object") continue;
    for (const key of Object.keys(modules)) {
      const source = sourceOf((modules as Record<string, unknown>)[key]);
      if (source === "") continue;
      DESCRIPTOR_PATTERN.lastIndex = 0;
      let match = DESCRIPTOR_PATTERN.exec(source);
      while (match !== null) {
        const [, queryId, operationName, operationType] = match;
        if (queryId !== undefined && operationName !== undefined && operationType !== undefined) {
          found.set(operationName, {
            kind: operationType as OperationKind,
            operationName,
            queryId,
          });
        }
        match = DESCRIPTOR_PATTERN.exec(source);
      }
    }
  }
  return [...found.values()];
}

export interface HealReport {
  healed: string[];
  failed: string[];
}

export function healOperations(registry: ChunkRegistry, wanted: string[]): HealReport {
  const descriptors = new Map(extractDescriptors(registry).map((descriptor) => [descriptor.operationName, descriptor]));
  const report: HealReport = { failed: [], healed: [] };
  for (const name of wanted) {
    const descriptor = descriptors.get(name);
    if (descriptor === undefined) {
      report.failed.push(name);
      continue;
    }
    try {
      registerOperation(descriptor);
      report.healed.push(name);
    } catch {
      report.failed.push(name);
    }
  }
  return report;
}
