import { findObject } from "./model.ts";

export interface TracePath {
  nodeIds: string[];
  relationIds: string[];
}

export interface TraceResult {
  target: string;
  direction: "ancestors" | "descendants";
  paths: TracePath[];
  nodeIds: string[];
  relationIds: string[];
  cycles: string[][];
  truncated: boolean;
}

function activeRelations(state: any, includeInvalidated = false): any[] {
  return (state.relations ?? []).filter((relation: any) =>
    includeInvalidated || (relation.validity ?? "active") === "active"
  );
}

export function traceGraph(
  state: any,
  target: string,
  direction: "ancestors" | "descendants" = "ancestors",
  options: { maxPaths?: number; maxDepth?: number; includeInvalidated?: boolean } = {}
): TraceResult {
  if (!findObject(state, target)) throw new Error(`Nó não encontrado para TRACE: ${target}`);
  const relations = activeRelations(state, options.includeInvalidated);
  const byTo = new Map<string, any[]>();
  const byFrom = new Map<string, any[]>();
  for (const relation of relations) {
    if (!byTo.has(relation.to)) byTo.set(relation.to, []);
    if (!byFrom.has(relation.from)) byFrom.set(relation.from, []);
    byTo.get(relation.to)!.push(relation);
    byFrom.get(relation.from)!.push(relation);
  }
  for (const list of [...byTo.values(), ...byFrom.values()]) {
    list.sort((left, right) => left.id.localeCompare(right.id));
  }

  const maxPaths = options.maxPaths ?? 10_000;
  const maxDepth = options.maxDepth ?? 512;
  const paths: TracePath[] = [];
  const cycles: string[][] = [];
  let truncated = false;

  const walk = (
    nodeId: string,
    visited: Set<string>,
    nodeIds: string[],
    relationIds: string[]
  ): void => {
    if (paths.length >= maxPaths || nodeIds.length > maxDepth) {
      truncated = true;
      return;
    }
    const adjacent = direction === "ancestors" ? (byTo.get(nodeId) ?? []) : (byFrom.get(nodeId) ?? []);
    if (!adjacent.length) {
      const path = direction === "ancestors"
        ? { nodeIds: [...nodeIds].reverse(), relationIds: [...relationIds].reverse() }
        : { nodeIds: [...nodeIds], relationIds: [...relationIds] };
      paths.push(path);
      return;
    }

    let advanced = false;
    for (const relation of adjacent) {
      const nextId = direction === "ancestors" ? relation.from : relation.to;
      if (visited.has(nextId)) {
        cycles.push([...nodeIds, nextId]);
        continue;
      }
      if (!findObject(state, nextId)) continue;
      advanced = true;
      walk(nextId, new Set([...visited, nextId]), [...nodeIds, nextId], [...relationIds, relation.id]);
    }
    if (!advanced) {
      const path = direction === "ancestors"
        ? { nodeIds: [...nodeIds].reverse(), relationIds: [...relationIds].reverse() }
        : { nodeIds: [...nodeIds], relationIds: [...relationIds] };
      paths.push(path);
    }
  };

  walk(target, new Set([target]), [target], []);

  const nodeIds = [...new Set(paths.flatMap((path) => path.nodeIds))].sort();
  const relationIds = [...new Set(paths.flatMap((path) => path.relationIds))].sort();
  return { target, direction, paths, nodeIds, relationIds, cycles, truncated };
}

export function descendantIds(state: any, sourceId: string): string[] {
  const trace = traceGraph(state, sourceId, "descendants");
  return trace.nodeIds.filter((id) => id !== sourceId);
}

export function hasDirectedPath(state: any, from: string, to: string): boolean {
  if (from === to) return true;
  const relations = activeRelations(state);
  const byFrom = new Map<string, string[]>();
  for (const relation of relations) {
    if (!byFrom.has(relation.from)) byFrom.set(relation.from, []);
    byFrom.get(relation.from)!.push(relation.to);
  }
  const queue = [from];
  const visited = new Set(queue);
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of byFrom.get(current) ?? []) {
      if (next === to) return true;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}
