import { canonicalStringify, cleanJson, sha256 } from "./canonical.ts";
import { EVENT_OPERATIONS, PROTOCOL_VERSION } from "./constants.ts";
import type { Actor, ArcaEvent } from "./model.ts";

export function eventHash(eventWithoutHash: Omit<ArcaEvent, "eventHash"> | Record<string, unknown>): string {
  return sha256(canonicalStringify(eventWithoutHash));
}

export function createEvent(input: {
  investigationId: string;
  sequence: number;
  operation: string;
  timestamp: string;
  actor: Actor;
  payload: Record<string, unknown>;
  previousEventHash: string | null;
}): ArcaEvent {
  if (!EVENT_OPERATIONS.includes(input.operation)) {
    throw new Error(`Operação de evento não suportada: ${input.operation}`);
  }
  const base = cleanJson({
    eventId: `EVLOG-${String(input.sequence).padStart(8, "0")}`,
    protocolVersion: PROTOCOL_VERSION,
    investigationId: input.investigationId,
    sequence: input.sequence,
    operation: input.operation,
    timestamp: input.timestamp,
    actor: input.actor,
    payload: input.payload,
    previousEventHash: input.previousEventHash,
    hashAlgorithm: "sha256"
  }) as unknown as Omit<ArcaEvent, "eventHash">;
  return { ...base, eventHash: eventHash(base) };
}

export function verifyEventChain(events: ArcaEvent[], expectedInvestigationId?: string): {
  valid: boolean;
  count: number;
  head: string | null;
} {
  let previous: string | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      throw new Error(`Event log adulterado: sequência ${event.sequence}, esperado ${expectedSequence}`);
    }
    if (event.eventId !== `EVLOG-${String(expectedSequence).padStart(8, "0")}`) {
      throw new Error(`Event log adulterado: eventId incompatível na sequência ${expectedSequence}`);
    }
    if (expectedInvestigationId && event.investigationId !== expectedInvestigationId) {
      throw new Error(`Event log pertence a outra investigação: ${event.investigationId}`);
    }
    if (event.previousEventHash !== previous) {
      throw new Error(`Event log adulterado: previousEventHash inválido em ${event.eventId}`);
    }
    const { eventHash: storedHash, ...withoutHash } = event;
    const computed = eventHash(withoutHash);
    if (storedHash !== computed) {
      throw new Error(`Event log adulterado: hash inválido em ${event.eventId}`);
    }
    previous = storedHash;
  }
  return { valid: true, count: events.length, head: previous };
}
