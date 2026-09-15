export type OperationKind = "query" | "mutation";

export interface OperationDescriptor {
  operationName: string;
  queryId: string;
  kind: OperationKind;
}

const registry = new Map<string, OperationDescriptor>();

export function registerOperation(descriptor: OperationDescriptor): void {
  if (registry.has(descriptor.operationName)) {
    throw new Error(`operation already registered: ${descriptor.operationName}`);
  }
  registry.set(descriptor.operationName, descriptor);
}

export function resolveOperation(name: string): OperationDescriptor | undefined {
  return registry.get(name);
}

export function clearOperations(): void {
  registry.clear();
}

export function operationCount(): number {
  return registry.size;
}
