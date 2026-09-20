import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeId, traceGraph } from "../packages/core/src/index.ts";

function generator(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

function randomDag(seed, size = 14) {
  const random = generator(seed);
  const propositions = Array.from({ length: size }, (_, index) => ({
    id: `PRO-${String(index + 1).padStart(6, "0")}`,
    type: "PRO",
    text: `Nó ${index + 1}`,
    validity: "active"
  }));
  const relations = [];
  for (let from = 0; from < size - 1; from += 1) {
    for (let to = from + 1; to < size; to += 1) {
      if (random() < 0.17 || (to === from + 1 && random() < 0.32)) {
        relations.push({
          id: `REL-${String(relations.length + 1).padStart(6, "0")}`,
          type: "REL",
          from: propositions[from].id,
          to: propositions[to].id,
          relationType: "supports",
          category: "epistemic",
          validity: "active"
        });
      }
    }
  }
  return {
    investigation: { id: `INV-PROP${seed}`, type: "INV" },
    objects: {
      questions: [], sources: [], documents: [], information: [], propositions,
      entities: [], events: [], hypotheses: [], conclusions: [], frames: [], gaps: [], searches: []
    },
    relations
  };
}

test("TRACE em 40 DAGs pseudoaleatórios só retorna nós e arestas existentes", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const state = randomDag(seed);
    const target = "PRO-000014";
    const trace = traceGraph(state, target, "ancestors");
    const nodeIds = new Set([state.investigation.id, ...state.objects.propositions.map((item) => item.id)]);
    const relationIds = new Set(state.relations.map((item) => item.id));
    assert.equal(trace.truncated, false, `seed ${seed}`);
    assert.equal(trace.cycles.length, 0, `seed ${seed}`);
    assert.ok(trace.nodeIds.every((id) => nodeIds.has(id)), `seed ${seed}: nó inventado`);
    assert.ok(trace.relationIds.every((id) => relationIds.has(id)), `seed ${seed}: relação inventada`);
    for (const path of trace.paths) {
      assert.equal(path.relationIds.length, path.nodeIds.length - 1, `seed ${seed}: caminho inconsistente`);
      path.relationIds.forEach((relationId, index) => {
        const relation = state.relations.find((item) => item.id === relationId);
        assert.equal(relation.from, path.nodeIds[index], `seed ${seed}: origem divergente`);
        assert.equal(relation.to, path.nodeIds[index + 1], `seed ${seed}: destino divergente`);
      });
    }
  }
});

test("validação de ID rejeita travessia, separadores e prefixo incorreto", () => {
  const unsafe = ["INV-..", "INV-../segredo", "INV-a/b", "../INV-1", "inv-000001", "INV-", "INV-%2e%2e", "INV-a\\b"];
  for (const id of unsafe) assert.throws(() => assertSafeId(id, "INV"), /inválido|não corresponde/);
  assert.doesNotThrow(() => assertSafeId("INV-000001", "INV"));
  assert.throws(() => assertSafeId("SRC-000001", "INV"), /não corresponde/);
});
