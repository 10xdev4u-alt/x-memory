import { registerOperation, type OperationDescriptor, type OperationKind } from "./op-registry.js";

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
