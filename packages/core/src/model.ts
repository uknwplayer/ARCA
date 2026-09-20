import { PROTOCOL_VERSION, STATE_SCHEMA_VERSION, TYPE_TO_COLLECTION } from "./constants.ts";
import { assertSafeId, collectionForType, typeFromId } from "./ids.ts";

export interface Actor {
  id: string;
  type: "human" | "system" | "agent" | "migration";
  method?: string | null;
}

export interface ArcaEvent {
  eventId: string;
  protocolVersion: string;
  investigationId: string;
  sequence: number;
  operation: string;
  timestamp: string;
  actor: Actor;
  payload: Record<string, unknown>;
  previousEventHash: string | null;
  hashAlgorithm: "sha256";
  eventHash: string;
}

export function utcNow(): string {
  return new Date().toISOString();
}

export function createEmptyObjects(): Record<string, any[]> {
  return {
    questions: [],
    sources: [],
    documents: [],
    information: [],
    propositions: [],
    entities: [],
    events: [],
    hypotheses: [],
    conclusions: [],
    frames: [],
    gaps: [],
    searches: []
  };
}

export function createEmptyState(investigation: any, question: any, relation: any): any {
  const objects = createEmptyObjects();
  objects.questions.push(question);
  return {
    protocolVersion: PROTOCOL_VERSION,
    schemaVersion: STATE_SCHEMA_VERSION,
    investigation,
    objects,
    relations: [relation],
    projection: {
      sequence: 0,
      eventHead: null,
      createdAt: investigation.createdAt,
      updatedAt: investigation.updatedAt
    },
    history: [],
    legacyHistory: [],
    extensions: {}
  };
}

export function allObjects(state: any, includeInvestigation = true): any[] {
  const nodes = Object.values(state.objects ?? {}).flat() as any[];
  return includeInvestigation ? [state.investigation, ...nodes] : nodes;
}

export function findObject(state: any, id: string): any | undefined {
  assertSafeId(id);
  if (state.investigation?.id === id) return state.investigation;
  if (id.startsWith("REL-")) return state.relations?.find((item: any) => item.id === id);
  let type: string;
  try {
    type = typeFromId(id);
  } catch {
    return undefined;
  }
  if (type === "INV" || type === "REL") return undefined;
  const collection = collectionForType(type);
  return state.objects?.[collection]?.find((item: any) => item.id === id);
}

export function replaceObject(state: any, id: string, replacement: any): void {
  if (state.investigation?.id === id) {
    state.investigation = replacement;
    return;
  }
  if (id.startsWith("REL-")) {
    const index = state.relations.findIndex((item: any) => item.id === id);
    if (index < 0) throw new Error(`Relação inexistente: ${id}`);
    state.relations[index] = replacement;
    return;
  }
  const type = typeFromId(id);
  const collection = TYPE_TO_COLLECTION[type];
  const index = state.objects[collection].findIndex((item: any) => item.id === id);
  if (index < 0) throw new Error(`Objeto inexistente: ${id}`);
  state.objects[collection][index] = replacement;
}

export function normalizeActor(actor?: Partial<Actor>): Actor {
  const normalized: Actor = {
    id: actor?.id?.trim() || "local-user",
    type: actor?.type || "human"
  };
  if (actor?.method) normalized.method = actor.method;
  return normalized;
}
