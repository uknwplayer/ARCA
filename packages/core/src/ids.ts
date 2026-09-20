import { TYPE_TO_COLLECTION, TYPE_TO_PREFIX } from "./constants.ts";

const SAFE_ID = /^[A-Z]+-[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeId(id: unknown, expectedType?: string): asserts id is string {
  if (typeof id !== "string" || !SAFE_ID.test(id) || id.includes("..")) {
    throw new Error(`ID ARCA inválido ou inseguro: ${String(id)}`);
  }
  if (expectedType) {
    const prefix = TYPE_TO_PREFIX[expectedType];
    if (!prefix || !id.startsWith(`${prefix}-`)) {
      throw new Error(`ID ${id} não corresponde ao tipo ${expectedType}`);
    }
  }
}

export function typeFromId(id: string): string {
  assertSafeId(id);
  const prefix = id.slice(0, id.indexOf("-"));
  if (prefix === "SEA") return "SEARCH";
  if (prefix === "INV" || prefix === "REL") return prefix;
  const match = Object.entries(TYPE_TO_PREFIX).find(([, value]) => value === prefix);
  if (!match) throw new Error(`Prefixo ARCA desconhecido: ${prefix}`);
  return match[0];
}

export function collectionForType(type: string): string {
  const collection = TYPE_TO_COLLECTION[type];
  if (!collection) throw new Error(`Tipo de objeto não suportado: ${type}`);
  return collection;
}

export function nextTypedId(state: any, type: string): string {
  const prefix = TYPE_TO_PREFIX[type];
  const collection = collectionForType(type);
  const numbers = (state.objects[collection] ?? [])
    .map((item: any) => new RegExp(`^${prefix}-(\\d+)$`).exec(item.id)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = Math.max(0, ...numbers) + 1;
  return `${prefix}-${String(next).padStart(6, "0")}`;
}

export function nextRelationId(state: any): string {
  const numbers = (state.relations ?? [])
    .map((item: any) => /^REL-(\d+)$/.exec(item.id)?.[1])
    .filter(Boolean)
    .map(Number);
  return `REL-${String(Math.max(0, ...numbers) + 1).padStart(6, "0")}`;
}

export function nextInvestigationId(existingIds: string[]): string {
  const numbers = existingIds
    .map((id) => /^INV-(\d+)$/.exec(id)?.[1])
    .filter(Boolean)
    .map(Number);
  return `INV-${String(Math.max(0, ...numbers) + 1).padStart(6, "0")}`;
}
