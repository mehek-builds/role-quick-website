/**
 * One client UUID per exact generation action.
 *
 * Keep the UUID after failures so a transport retry cannot reserve another trial unit. Clear it
 * only after a successful response, which makes a later deliberate regeneration a new action.
 */
export function operationIdFor(registry: Map<string, string>, actionKey: string): string {
  const existing = registry.get(actionKey);
  if (existing) return existing;
  const created = globalThis.crypto.randomUUID();
  registry.set(actionKey, created);
  return created;
}

export function completeOperationId(registry: Map<string, string>, actionKey: string): void {
  registry.delete(actionKey);
}
