import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArcaCore,
  canonicalStringify,
  findObject,
  sha256,
  traceGraph,
  verifyEventChain
} from "../packages/core/src/index.ts";

async function temporaryCore(t) {
  const home = await mkdtemp(join(tmpdir(), "arca-core-test-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  return { core: new ArcaCore(home), home };
}

function assertNoOrphanRelations(state) {
  for (const relation of state.relations) {
    assert.ok(findObject(state, relation.from), `${relation.id}: origem órfã ${relation.from}`);
    assert.ok(findObject(state, relation.to), `${relation.id}: destino órfão ${relation.to}`);
  }
}

async function importSyntheticFixture(core, raw) {
  const rawText = JSON.stringify(raw, null, 2) + "\n";
  return { raw, rawText, imported: await core.importLegacy({ raw, originalBytes: rawText }) };
}

function syntheticLegacyQuestionFixture() {
  return {
    arca_version: "synthetic-v0",
    investigation: {
      id: "INV-SYNTH-A",
      question: "A transformação sintética preserva a questão?",
      objective: "Exercitar a migração sem distribuir dados de uma investigação.",
      scope: "Fixture efêmera e inteiramente fictícia.",
      limits: "Não representa pessoa, organização ou fato real.",
      simulation: true
    },
    sources: [{ id: "SRC-SYNTH-A", type: "SRC", name: "Fonte sintética A", simulation: true }],
    documents: [{
      id: "DOC-SYNTH-A",
      type: "DOC",
      source_id: "SRC-SYNTH-A",
      title: "Documento sintético A",
      acquired_at: "2026-01-01T00:00:00.000Z",
      acquisition_method: "simulation",
      hash_sha256: "0".repeat(64),
      hash_status: "simulated",
      simulation: true
    }],
    information: [{
      id: "INF-SYNTH-A",
      type: "INF",
      document_id: "DOC-SYNTH-A",
      content: "Conteúdo sintético A.",
      locator: "simulation:1",
      simulation: true
    }],
    propositions: [{
      id: "PRO-SYNTH-A",
      type: "PRO",
      text: "Proposição sintética A.",
      epistemic_status: "Não verificado",
      classification_justification: "Fixture técnica.",
      simulation: true
    }],
    relations: [
      { id: "REL-SYNTH-A-1", from: "SRC-SYNTH-A", to: "DOC-SYNTH-A", relation_type: "acquired_from", category: "provenance", justification: "Fixture sintética." },
      { id: "REL-SYNTH-A-2", from: "DOC-SYNTH-A", to: "INF-SYNTH-A", relation_type: "extracted_from", category: "provenance", justification: "Fixture sintética." },
      { id: "REL-SYNTH-A-3", from: "INF-SYNTH-A", to: "PRO-SYNTH-A", relation_type: "supports", category: "evidence", epistemic_effect: "supports", justification: "Fixture sintética." }
    ]
  };
}

function syntheticLegacyEvidenceFixture() {
  return {
    arca_version: "synthetic-v0",
    investigation: {
      id: "INV-SYNTH-B",
      question: "O formato legado de evidência é normalizado sem inventar aquisição?",
      objective: "Exercitar compatibilidade legada com dados fictícios.",
      scope: "Fixture efêmera.",
      limits: "Simulação sem referência externa.",
      simulation: true
    },
    subjects: [{ id: "ENT-SYNTH-B", type: "subject", name: "Entidade sintética B", simulation: true }],
    sources: [{ id: "SRC-SYNTH-B", type: "synthetic_source", title: "Fonte sintética B", url: "simulation://source-b", simulation: true }],
    evidence: [{
      id: "EVD-SYNTH-B",
      source: "SRC-SYNTH-B",
      fact: "Informação sintética B.",
      location: "simulation:2",
      supports: ["PRO-SYNTH-B"],
      weakens: []
    }],
    propositions: [{ id: "PRO-SYNTH-B", type: "PRO", text: "Proposição sintética B.", epistemic_status: "Possível", simulation: true }],
    hypotheses: [{ id: "HIP-SYNTH-B", type: "HIP", statement: "Hipótese sintética B.", supports: ["PRO-SYNTH-B"], weakens: [], simulation: true }],
    gaps: [{ id: "GAP-SYNTH-B", type: "GAP", description: "Lacuna sintética B.", state: "L1", simulation: true }],
    conclusion: {
      id: "CON-SYNTH-B",
      type: "CON",
      statement: "Conclusão sintética B.",
      dependency_ids: ["PRO-SYNTH-B", "GAP-SYNTH-B"],
      favorable_bases: ["PRO-SYNTH-B"],
      contrary_bases: [],
      material_gaps: ["GAP-SYNTH-B"],
      reopening_conditions: ["Nova informação sintética."],
      simulation: true
    },
    agent_isolation: { mode: "synthetic", enabled: true },
    requirements_matrix: [{ id: "SYNTH-REQ", status: "UNSPECIFIED" }],
    devils_advocate: { for_direct_employment: ["PRO-SYNTH-B"], against_direct_employment: ["PRO-SYNTH-B"] }
  };
}

function syntheticLegacyAliasFixture() {
  return {
    arca_version: "synthetic-v0",
    investigation: {
      id: "INV-SYNTH-C",
      question_id: "QUE-SYNTH-C",
      question: "Aliases legados são reescritos em estruturas aninhadas?",
      objective: "Exercitar aliases sem conservar um caso distribuível.",
      scope: "Fixture efêmera.",
      limits: "Simulação sem referência externa.",
      simulation: true
    },
    sources: [{ id: "SRC-SYNTH-C", type: "SRC", name: "Fonte sintética C", simulation: true }],
    documents: [{ id: "DOC-SYNTH-C", type: "DOC", source_id: "SRC-SYNTH-C", title: "Documento sintético C", simulation: true }],
    information: [{ id: "INF-SYNTH-C", type: "INF", document_id: "DOC-SYNTH-C", content: "Conteúdo sintético C.", simulation: true }],
    propositions: [{ id: "PRO-SYNTH-C", type: "PRO", text: "Proposição sintética C.", epistemic_status: "Desconhecido", simulation: true }],
    searches: [{ id: "SEARCH-SYNTH-C", type: "SEARCH", query: "consulta sintética", date: "2026-01-01", simulation: true }],
    conclusions: [{
      id: "CON-SYNTH-C",
      type: "CON",
      statement: "Conclusão sintética C.",
      dependency_ids: ["PRO-SYNTH-C"],
      favorable_bases: ["PRO-SYNTH-C"],
      contrary_bases: [],
      material_gaps: [],
      reopening_conditions: [{
        logic: "OR",
        conditions: [
          { type: "DOC_ADDED", predicate: { contains: "synthetic" } },
          { type: "SEARCH_EXECUTED", predicate: { query_id: "SEARCH-SYNTH-C" } }
        ]
      }],
      simulation: true
    }],
    relations: [{ id: "REL-SYNTH-C", from: "INF-SYNTH-C", to: "PRO-SYNTH-C", relation_type: "supports", category: "evidence", epistemic_effect: "supports", justification: "Fixture sintética." }]
  };
}

async function graphFixture(core) {
  const state = await core.createInvestigation({
    question: "Duas trilhas independentes chegam à conclusão?",
    objective: "Testar grafo ramificado.",
    scope: "Fixture local.",
    limits: "Conteúdo simulado.",
    simulation: true
  });
  const investigationId = state.investigation.id;
  const q = state.investigation.questionIds[0];
  const src1 = await core.addObject({ investigationId, type: "SRC", data: { name: "Fonte A", independenceGroup: "A" } });
  const src2 = await core.addObject({ investigationId, type: "SRC", data: { name: "Fonte B", independenceGroup: "B" } });
  const doc1 = await core.addObject({ investigationId, type: "DOC", data: { title: "Documento A", sourceId: src1.id, location: "simulation://a", acquisitionMethod: "simulation", hashStatus: "simulated" } });
  const doc2 = await core.addObject({ investigationId, type: "DOC", data: { title: "Documento B", sourceId: src2.id, location: "simulation://b", acquisitionMethod: "simulation", hashStatus: "simulated" } });
  const inf1 = await core.addObject({ investigationId, type: "INF", data: { documentId: doc1.id, content: "Informação A", locator: "A:1" } });
  const inf2 = await core.addObject({ investigationId, type: "INF", data: { documentId: doc2.id, content: "Informação B", locator: "B:1" } });
  const pro1 = await core.addObject({ investigationId, type: "PRO", data: { text: "Proposição A", epistemicStatus: "Confirmado", classificationJustification: "Fixture A" } });
  const pro2 = await core.addObject({ investigationId, type: "PRO", data: { text: "Proposição B", epistemicStatus: "Confirmado", classificationJustification: "Fixture B" } });
  const con = await core.addObject({ investigationId, type: "CON", data: {
    questionId: q,
    statement: "As duas trilhas foram preservadas.",
    scope: "Fixture técnica.",
    epistemicStatus: "Confirmado",
    favorableBases: [pro1.id, pro2.id],
    contraryBases: [],
    materialGaps: [],
    limitations: ["Simulação"],
    reopeningConditions: ["Reabrir se um caminho desaparecer."],
    dependencyIds: [pro1.id, pro2.id]
  }});
  const edges = [
    [src1.id, doc1.id, "acquired_from", "provenance"],
    [doc1.id, inf1.id, "extracted_from", "provenance"],
    [inf1.id, pro1.id, "supports", "evidence"],
    [pro1.id, con.id, "supports", "epistemic"],
    [src2.id, doc2.id, "acquired_from", "provenance"],
    [doc2.id, inf2.id, "extracted_from", "provenance"],
    [inf2.id, pro2.id, "supports", "evidence"],
    [pro2.id, con.id, "supports", "epistemic"],
    [q, con.id, "answered_by", "investigation"]
  ];
  for (const [from, to, relationType, category] of edges) {
    await core.relate({
      investigationId,
      from,
      to,
      relationType,
      category,
      justification: `Fixture ${from} → ${to}`
    });
  }
  return { investigationId, q, src1, src2, doc1, doc2, inf1, inf2, pro1, pro2, con };
}

test("cria investigação e reconstrói a mesma projeção pelo event log", async (t) => {
  const { core, home } = await temporaryCore(t);
  const created = await core.createInvestigation({
    question: "Pergunta de teste?",
    objective: "Testar reconstrução.",
    scope: "Local.",
    limits: "Fixture.",
    simulation: true
  });
  const events = await core.store.loadEvents(created.investigation.id);
  assert.equal(events.length, 1);
  assert.equal(verifyEventChain(events).valid, true);
  const secondInstance = new ArcaCore(home);
  assert.deepEqual(await secondInstance.get(created.investigation.id), created);
});

test("TRACE preserva todos os ramos reais e não injeta nós", async (t) => {
  const { core } = await temporaryCore(t);
  const fixture = await graphFixture(core);
  const trace = await core.trace(fixture.investigationId, fixture.con.id);
  assert.equal(trace.truncated, false);
  assert.equal(trace.cycles.length, 0);
  assert.ok(trace.paths.length >= 3);
  assert.ok(trace.nodeIds.includes(fixture.src1.id));
  assert.ok(trace.nodeIds.includes(fixture.src2.id));
  assert.ok(trace.paths.some((path) => path.nodeIds.join("/").includes(`${fixture.src1.id}/${fixture.doc1.id}/${fixture.inf1.id}/${fixture.pro1.id}/${fixture.con.id}`)));
  assert.ok(trace.paths.some((path) => path.nodeIds.join("/").includes(`${fixture.src2.id}/${fixture.doc2.id}/${fixture.inf2.id}/${fixture.pro2.id}/${fixture.con.id}`)));
});

test("invalidação propaga reavaliação sem criar Contradito", async (t) => {
  const { core } = await temporaryCore(t);
  const fixture = await graphFixture(core);
  const invalidation = await core.invalidate({ investigationId: fixture.investigationId, id: fixture.doc1.id, reason: "Fixture invalidada" });
  assert.ok(invalidation.dependentIds.includes(fixture.pro1.id));
  assert.ok(invalidation.dependentIds.includes(fixture.con.id));
  const before = await core.get(fixture.investigationId);
  assert.equal(findObject(before, fixture.pro1.id).needsReevaluation, true);
  const reevaluated = await core.reevaluate({ investigationId: fixture.investigationId, id: fixture.pro1.id });
  assert.equal(reevaluated.epistemicStatus, "Não verificado");
  assert.notEqual(reevaluated.epistemicStatus, "Contradito");
  assert.equal(reevaluated.reevaluationOutcome, "support_removed_without_automatic_falsity");
});

test("Core rejeita evidência fora de INF → PRO e DOC → CON epistêmico", async (t) => {
  const { core } = await temporaryCore(t);
  const fixture = await graphFixture(core);
  await assert.rejects(
    core.relate({ investigationId: fixture.investigationId, from: fixture.doc1.id, to: fixture.pro1.id, relationType: "supports", category: "evidence", justification: "inválida" }),
    /INF → PRO/
  );
  await assert.rejects(
    core.relate({ investigationId: fixture.investigationId, from: fixture.doc1.id, to: fixture.con.id, relationType: "supports", category: "epistemic", justification: "inválida" }),
    /DOC → CON/
  );
});

test("O Limite bloqueia fechamento e aceita justificativa explícita", async (t) => {
  const { core } = await temporaryCore(t);
  const state = await core.createInvestigation({ question: "Fechar?", objective: "Testar O Limite.", scope: "Fixture.", limits: "Fixture.", simulation: true });
  const investigationId = state.investigation.id;
  const gap = await core.addObject({ investigationId, type: "GAP", data: { description: "Lacuna material", gapState: "L1", materiality: "high", likelyToChangeResult: true } });
  const conclusion = await core.addObject({ investigationId, type: "CON", data: {
    questionId: state.investigation.questionIds[0], statement: "Conclusão de teste", scope: "Fixture", favorableBases: [], contraryBases: [],
    materialGaps: [gap.id], limitations: ["Lacuna aberta"], reopeningConditions: ["Quando a lacuna for resolvida"]
  }});
  await core.relate({ investigationId, from: state.investigation.questionIds[0], to: conclusion.id, relationType: "answered_by", category: "investigation", justification: "Resposta fixture" });
  await core.relate({ investigationId, from: gap.id, to: conclusion.id, relationType: "limits", category: "operational", justification: "Lacuna limita a conclusão" });
  await assert.rejects(core.closeConclusion({ investigationId, id: conclusion.id }), /O Limite bloqueou/);
  const closed = await core.closeConclusion({ investigationId, id: conclusion.id, limitJustification: "Fechamento apenas para testar o mecanismo; não é alegação factual." });
  assert.equal(closed.lifecycleStatus, "closed");
});

test("validador emite os 47 requisitos e não concede selo indevido", async (t) => {
  const { core } = await temporaryCore(t);
  const fixture = await graphFixture(core);
  const report = await core.validate(fixture.investigationId);
  assert.equal(report.requirements.length, 47);
  assert.equal(report.eligibleForSeal, false);
  assert.equal(report.profiles["ACS-FULL"], "FAIL");
  assert.ok(report.summary.UNSPECIFIED > 0);
});

test("migra fixture sintética com Q de primeira classe e sem perda das relações", async (t) => {
  const { core } = await temporaryCore(t);
  const { raw, rawText, imported } = await importSyntheticFixture(core, syntheticLegacyQuestionFixture());
  assert.equal(imported.state.investigation.id, "INV-SYNTH-A");
  assert.equal(imported.state.objects.questions[0].id, "Q-SYNTH-A");
  assert.equal(imported.state.objects.questions[0].text, raw.investigation.question);
  assert.equal(imported.state.relations.length, raw.relations.length + 1);
  assert.equal(imported.report.originalSha256, sha256(rawText));
  assert.equal(imported.report.destructiveChanges, 0);
  assert.equal((await core.store.loadEvents("INV-SYNTH-A")).length, 1);
  assertNoOrphanRelations(imported.state);
  assert.ok(imported.state.relations.some((relation) => relation.from === "INV-SYNTH-A" && relation.to === "Q-SYNTH-A"));
});

test("migra fixture sintética de EVD sem inventar aquisição", async (t) => {
  const { core } = await temporaryCore(t);
  const { rawText, imported } = await importSyntheticFixture(core, syntheticLegacyEvidenceFixture());
  const { state, report } = imported;
  assert.equal(state.investigation.id, "INV-SYNTH-B");
  assert.equal(state.objects.questions[0].id, "Q-SYNTH-B");
  assert.equal(state.objects.entities.length, 1);
  assert.equal(state.objects.documents.length, 1);
  assert.equal(state.objects.information.length, 1);
  assert.equal(state.objects.conclusions.length, 1);
  assert.equal(report.originalSha256, sha256(rawText));
  assert.equal(report.destructiveChanges, 0);
  assert.ok(report.transformations.includes("subjects→entities"));
  assert.ok(report.transformations.includes("conclusion-singular→conclusions"));
  assert.ok(report.transformations.includes("1 evidence-objects→INF+REL"));
  assert.equal(state.relations.filter((relation) => relation.category === "evidence").length, 1);
  assert.ok(state.relations.filter((relation) => relation.category === "evidence").every((relation) => relation.from.startsWith("INF-") && relation.to.startsWith("PRO-") && relation.effect));
  assert.ok(state.objects.documents.every((document) => document.acquisitionOriginalUnknown === true && document.hashStatus === "not_computed"));
  assert.ok(state.extensions.legacyImport.unmappedSections.agentIsolation);
  assert.ok(state.extensions.legacyImport.unmappedSections.requirementsMatrix);
  assert.ok(state.objects.hypotheses.every((hypothesis) => hypothesis.extensions.globalDevilsAdvocateRecord));
  assertNoOrphanRelations(state);
});

test("migra fixture sintética, reescreve aliases e preserva gatilho de reabertura", async (t) => {
  const { core } = await temporaryCore(t);
  const { rawText, imported } = await importSyntheticFixture(core, syntheticLegacyAliasFixture());
  const { state, report } = imported;
  assert.equal(state.investigation.id, "INV-SYNTH-C");
  assert.equal(state.objects.questions[0].id, "Q-SYNTH-C");
  assert.deepEqual(state.objects.searches.map((search) => search.id), ["SEA-SYNTH-C"]);
  assert.equal(report.idAliases["QUE-SYNTH-C"], "Q-SYNTH-C");
  assert.equal(report.idAliases["SEARCH-SYNTH-C"], "SEA-SYNTH-C");
  assert.equal(report.originalSha256, sha256(rawText));
  assert.equal(report.destructiveChanges, 0);
  assert.ok(state.objects.conclusions.every((conclusion) => conclusion.questionId === "Q-SYNTH-C"));
  assert.ok(state.objects.conclusions.every((conclusion) => conclusion.reopeningConditions[0].logic === "OR"));
  assert.equal(state.objects.conclusions[0].reopeningConditions[0].conditions[1].predicate.queryId, "SEA-SYNTH-C");
  assert.equal(state.relations.filter((relation) => relation.from === "Q-SYNTH-C" && relation.to.startsWith("CON-")).length, 1);
  assert.equal(state.relations.filter((relation) => relation.from.startsWith("SRC-") && relation.to.startsWith("DOC-")).length, 1);
  assertNoOrphanRelations(state);
});

test("adulteração de um evento interrompe reconstrução", async (t) => {
  const { core, home } = await temporaryCore(t);
  const created = await core.createInvestigation({ question: "Íntegro?", objective: "Testar hash.", scope: "Fixture.", limits: "Fixture.", simulation: true });
  const path = join(home, "investigations", created.investigation.id, "events.ndjson");
  const original = await readFile(path, "utf8");
  await writeFile(path, original.replace("Testar hash.", "Texto adulterado."), "utf8");
  await assert.rejects(core.get(created.investigation.id), /hash inválido/);
});

test("exportação inclui eventos, validação e hash canônico verificável", async (t) => {
  const { core, home } = await temporaryCore(t);
  const fixture = await graphFixture(core);
  const path = join(home, "export.arca.json");
  const exported = await core.exportInvestigation(fixture.investigationId, path);
  const { integrity, ...base } = exported;
  assert.equal(integrity.canonicalContentHash, sha256(canonicalStringify(base)));
  assert.equal(integrity.eventHead, exported.events.at(-1).eventHash);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), exported);
});

test("TRACE detecta ciclo legado sem entrar em loop", () => {
  const now = new Date().toISOString();
  const state = {
    investigation: { id: "INV-CYCLE", type: "INV" },
    objects: {
      questions: [{ id: "Q-CYCLE", type: "Q", text: "?", createdAt: now, validity: "active" }],
      sources: [], documents: [], information: [],
      propositions: [
        { id: "PRO-000001", type: "PRO", createdAt: now, validity: "active" },
        { id: "PRO-000002", type: "PRO", createdAt: now, validity: "active" }
      ],
      entities: [], events: [], hypotheses: [], conclusions: [], frames: [], gaps: [], searches: []
    },
    relations: [
      { id: "REL-000001", type: "REL", from: "PRO-000001", to: "PRO-000002", validity: "active" },
      { id: "REL-000002", type: "REL", from: "PRO-000002", to: "PRO-000001", validity: "active" }
    ]
  };
  const trace = traceGraph(state, "PRO-000001");
  assert.ok(trace.cycles.length > 0);
  assert.equal(trace.truncated, false);
});
