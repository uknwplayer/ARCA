import { clone } from "./canonical.ts";
import { createEmptyState, findObject, replaceObject } from "./model.ts";
import type { ArcaEvent } from "./model.ts";

function requireState(state: any, event: ArcaEvent): any {
  if (!state) throw new Error(`${event.operation} não pode ser o primeiro evento`);
  return state;
}

function appendHistory(state: any, event: ArcaEvent): void {
  state.history ??= [];
  state.history.push({
    eventId: event.eventId,
    sequence: event.sequence,
    operation: event.operation,
    timestamp: event.timestamp,
    actor: clone(event.actor)
  });
  state.projection.sequence = event.sequence;
  state.projection.eventHead = event.eventHash;
  state.projection.updatedAt = event.timestamp;
  state.investigation.updatedAt = event.timestamp;
}

export function applyEvent(current: any | undefined, event: ArcaEvent): any {
  let state = current ? clone(current) : undefined;
  const payload: any = event.payload;

  switch (event.operation) {
    case "INVESTIGATION_CREATE": {
      if (state) throw new Error("INVESTIGATION_CREATE duplicado");
      state = createEmptyState(
        clone(payload.investigation),
        clone(payload.question),
        clone(payload.relation)
      );
      break;
    }
    case "LEGACY_IMPORT": {
      if (state) throw new Error("LEGACY_IMPORT só pode ser o primeiro evento");
      state = clone(payload.state);
      state.history = [];
      break;
    }
    case "OBJECT_CREATE": {
      state = requireState(state, event);
      const collection = payload.collection;
      if (!Array.isArray(state.objects[collection])) throw new Error(`Coleção inválida: ${collection}`);
      state.objects[collection].push(clone(payload.object));
      break;
    }
    case "OBJECT_UPDATE": {
      state = requireState(state, event);
      const existing = findObject(state, payload.id);
      if (!existing) throw new Error(`Objeto inexistente no replay: ${payload.id}`);
      replaceObject(state, payload.id, { ...existing, ...clone(payload.patch), updatedAt: event.timestamp });
      break;
    }
    case "RELATION_CREATE": {
      state = requireState(state, event);
      state.relations.push(clone(payload.relation));
      break;
    }
    case "OBJECT_ARCHIVE": {
      state = requireState(state, event);
      const existing = findObject(state, payload.id);
      if (!existing) throw new Error(`Objeto inexistente no replay: ${payload.id}`);
      replaceObject(state, payload.id, {
        ...existing,
        validity: "archived",
        archivedAt: event.timestamp,
        archiveReason: payload.reason,
        updatedAt: event.timestamp
      });
      break;
    }
    case "OBJECT_INVALIDATE": {
      state = requireState(state, event);
      const target = findObject(state, payload.id);
      if (!target) throw new Error(`Objeto inexistente no replay: ${payload.id}`);
      replaceObject(state, payload.id, {
        ...target,
        validity: "invalidated",
        invalidatedAt: event.timestamp,
        invalidationReason: payload.reason,
        updatedAt: event.timestamp
      });
      for (const dependentId of payload.dependentIds ?? []) {
        const dependent = findObject(state, dependentId);
        if (!dependent || dependent.validity !== "active") continue;
        replaceObject(state, dependentId, {
          ...dependent,
          needsReevaluation: true,
          reevaluationReason: `Dependência invalidada: ${payload.id}`,
          updatedAt: event.timestamp
        });
      }
      break;
    }
    case "OBJECT_REEVALUATE": {
      state = requireState(state, event);
      const existing = findObject(state, payload.id);
      if (!existing) throw new Error(`Objeto inexistente no replay: ${payload.id}`);
      replaceObject(state, payload.id, {
        ...existing,
        ...clone(payload.result),
        needsReevaluation: false,
        lastReevaluatedAt: event.timestamp,
        updatedAt: event.timestamp
      });
      break;
    }
    case "CONCLUSION_CLOSE": {
      state = requireState(state, event);
      const conclusion = findObject(state, payload.id);
      if (!conclusion) throw new Error(`Conclusão inexistente no replay: ${payload.id}`);
      replaceObject(state, payload.id, {
        ...conclusion,
        lifecycleStatus: "closed",
        closedAt: event.timestamp,
        limitJustification: payload.limitJustification ?? conclusion.limitJustification ?? null,
        updatedAt: event.timestamp
      });
      break;
    }
    case "CONCLUSION_REOPEN": {
      state = requireState(state, event);
      const conclusion = findObject(state, payload.id);
      if (!conclusion) throw new Error(`Conclusão inexistente no replay: ${payload.id}`);
      replaceObject(state, payload.id, {
        ...conclusion,
        lifecycleStatus: "reopened",
        reopenedAt: event.timestamp,
        reopeningReason: payload.reason,
        updatedAt: event.timestamp
      });
      break;
    }
    default:
      throw new Error(`Operação desconhecida no replay: ${event.operation}`);
  }

  appendHistory(state, event);
  return state;
}

export function replayEvents(events: ArcaEvent[]): any {
  if (!events.length) throw new Error("Event log vazio");
  let state: any | undefined;
  for (const event of events) state = applyEvent(state, event);
  return state;
}
