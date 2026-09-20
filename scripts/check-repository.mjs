import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { canonicalStringify, sha256 } from "../packages/acquisition/src/index.ts";

const root = resolve(new URL("..", import.meta.url).pathname);
const publicProfile=process.argv.includes("--public");
const required = [
  "README.md",
  "CHANGELOG.md",
  "package.json",
  "docs/ARCA_CORE_SPEC_v1.0.0.md",
  "docs/ARCA_CORE_v1_FOUNDATION_0.1.0_RELEASE_REPORT.md",
  "docs/ARCA_WORKBENCH_SPEC_v0.2.0.md",
  "docs/ARCA_AGENT_PROTOCOL_v0.2.0.md",
  "docs/ARCA_WORKBENCH_AGENT_BUNDLE_0.2.0_RELEASE_REPORT.md",
  "docs/ARCA_SYSTEM_0.2.0_TEST_REPORT.json",
  "docs/ARCA_ACQUISITION_CUSTODY_SPEC_v0.3.0.md",
  "docs/ARCA_ACQUISITION_CUSTODY_0.3.0_RELEASE_REPORT.md",
  "docs/ARCA_DOCUMENTO_MESTRE_v1.3.0_PUBLICO.md",
  "docs/ARCA_SYSTEM_0.3.0_TEST_REPORT.json",
  "docs/machine-bridge/PROTOCOL_V3.md",
  "docs/machine-bridge/WORKER_AGENT.md",
  "docs/machine-bridge/EXECUTION_IDENTITY_RECONCILED_FAILOVER_V0_1.md",
  "docs/machine-bridge/CONTROLLED_REPLACEMENT_DISPATCH_V0_2.md",
  "docs/machine-bridge/RECONCILED_FAILOVER_CHAIN_V0_3.md",
  "docs/machine-bridge/LIVE_AAP_RUNTIME_VALIDATION_V0_1.md",
  "docs/machine-bridge/GEMINI_AAP_RUNTIME_V0_1.md",
  "docs/machine-bridge/AGENT_DISCOVERY_FABRIC_V0_1.md",
  "docs/machine-bridge/A2A_DISCOVERY_ADAPTER_V0_1.md",
  "docs/machine-bridge/LIVE_A2A_DISCOVERY_VALIDATION_V0_1.md",
  "docs/machine-bridge/LIVE_A2A_REGISTRY_SEARCH_VALIDATION_V0_1.md",
  "docs/machine-bridge/LIVE_A2A_REGISTRY_RESOLUTION_VALIDATION_V0_1.md",
  "docs/machine-bridge/LIVE_A2A_REFERENCE_INSPECTION_VALIDATION_V0_1.md",
  "docs/machine-bridge/LIVE_A2A_GITHUB_REPOSITORY_RESOLUTION_V0_1.md",
  "docs/machine-bridge/LIVE_A2A_RUNTIME_REACHABILITY_V0_1.md",
  "docs/machine-bridge/ARCA_NODE_MANIFEST_AND_INTRODUCTION_V0_1.md",
  "docs/machine-bridge/ARCA_FEDERATION_RESPONSE_V0_1.md",
  "docs/machine-bridge/LIVE_ARCA_FEDERATION_INTRODUCTION_DELIVERY_V0_1.md",
  ".github/workflows/arca-node-introduction-validation.yml",
  ".github/workflows/arca-federation-response-validation.yml",
  ".github/workflows/arca-live-federation-introduction-delivery.yml",
  ".github/workflows/arca-live-a2a-runtime-reachability.yml",
  ".github/workflows/arca-live-a2a-github-repository-resolution.yml",
  ".github/workflows/arca-live-a2a-reference-inspection.yml",
  ".github/workflows/arca-live-a2a-registry-resolution.yml",
  ".github/workflows/arca-live-a2a-registry-search.yml",
  ".github/workflows/arca-live-a2a-discovery.yml",
  "docs/adr/ADR-ARCA-0014-discovery-is-not-trust.md",
  ".github/workflows/arca-live-gemini.yml",
  "docs/adr/ADR-ARCA-0013-signed-rejection-failover-chain.md",
  "docs/adr/ADR-ARCA-0012-controlled-replacement-dispatch-boundary.md",
  "docs/adr/ADR-ARCA-0011-execution-identity-and-reconciled-failover.md",
  "docs/machine-bridge/COGNITIVE_SUBSTITUTION_V0_2.md",
  "docs/adr/ADR-ARCA-0010-role-conformance-before-substitution.md",
  ".github/workflows/arca-ci.yml",
  ".github/workflows/arca-machine-bridge.yml",
  ".github/workflows/arca-machine-bridge-dispatch.yml",
  "schemas/arca-state-v1.schema.json",
  "schemas/arca-event-v1.schema.json",
  "schemas/arca-export-v1.schema.json",
  "schemas/arca-acquisition-request-v1.schema.json",
  "schemas/arca-custody-manifest-v1.schema.json",
  "schemas/machine-bridge-job-v3.schema.json",
  "schemas/machine-bridge-claim-v1.schema.json",
  "schemas/machine-bridge-worker-v1.schema.json",
  "schemas/machine-bridge-result-v1.schema.json",
  "schemas/machine-bridge-worker-registration-v1.schema.json",
  "schemas/arca-execution-identity-v1.schema.json",
  "schemas/arca-execution-attempt-v1.schema.json",
  "schemas/arca-reconciled-failover-receipt-v1.schema.json",
  "schemas/arca-node-manifest-v1.schema.json",
  "schemas/arca-federation-introduction-v1.schema.json",
  "schemas/arca-federation-response-v1.schema.json",
  "schemas/arca-execution-replacement-preparation-v1.schema.json",
  "schemas/arca-execution-dispatch-gate-v1.schema.json",
  "src/machine-bridge/action-registry.mjs",
  "src/machine-bridge/fs-transport.mjs",
  "src/machine-bridge/github-transport.mjs",
  "src/machine-bridge/lease.mjs",
  "src/machine-bridge/protocol-v3.mjs",
  "src/machine-bridge/execution-identity.mjs",
  "src/machine-bridge/reconciled-failover.mjs",
  "src/machine-bridge/arca-node-manifest.mjs",
  "src/machine-bridge/arca-federation-response.mjs",
  "src/machine-bridge/worker-runtime.mjs",
  "scripts/arca-worker-agent.mjs",
  "scripts/arca-gemini-aap-runtime.mjs",
  "scripts/validate-live-gemini-aap.mjs",
  "scripts/validate-live-a2a-discovery.mjs",
  "scripts/validate-live-a2a-registry-search.mjs",
  "scripts/validate-live-a2a-registry-resolution.mjs",
  "scripts/validate-live-a2a-reference-inspection.mjs",
  "scripts/validate-live-a2a-github-repository-resolution.mjs",
  "scripts/validate-live-a2a-runtime-reachability.mjs",
  "scripts/validate-arca-node-introduction.mjs",
  "scripts/validate-arca-federation-response.mjs",
  "scripts/validate-live-arca-federation-introduction-delivery.mjs",
  "scripts/arca-remote-submit.mjs",
  "packages/core/src/index.ts",
  "packages/cli/bin/arca.mjs",
  "packages/workbench/src/server.ts",
  "packages/agent/src/proposals.ts",
  "packages/agent/src/cognitive-substitution.ts",
  "packages/agent/src/reconciled-substitution.ts",
  "packages/agent/src/controlled-replacement-dispatch.ts",
  "packages/agent/src/reconciled-failover-chain.ts",
  "packages/agent/src/gemini-provider.ts",
  "packages/agent/src/gemini-aap-runtime.ts",
  "packages/agent/src/agent-discovery.ts",
  "packages/agent/src/a2a-discovery.ts",
  "packages/agent/src/a2a-registry-search.ts",
  "packages/agent/src/a2a-registry-resolution.ts",
  "packages/agent/src/a2a-reference-classification.ts",
  "packages/agent/src/a2a-reference-inspection.ts",
  "packages/agent/src/a2a-github-repository-resolution.ts",
  "packages/agent/src/a2a-runtime-reachability.ts",
  "packages/agent/src/arca-federation-introduction-delivery.ts",
  "packages/agent/arca-agent-discovery-candidate-v1.schema.json",
  "packages/agent/src/role-conformance.ts",
  "packages/agent/arca-role-contract-v1.schema.json",
  "packages/agent/arca-participant-runtime-binding-v1.schema.json",
  "packages/agent/arca-cognitive-substitution-receipt-v1.schema.json",
  "packages/agent/arca-role-conformance-profile-v1.schema.json",
  "packages/agent/arca-role-conformance-evidence-v1.schema.json",
  "packages/acquisition/src/index.ts",
  "packages/acquisition/bin/arca-acquire.mjs",
  "tests/acquisition.test.mjs",
  "tests/machine-bridge-worker.test.mjs",
  "tests/execution-identity-reconciled-failover.test.mjs",
  "tests/reconciled-substitution.test.mjs",
  "tests/controlled-replacement-dispatch.test.mjs",
  "tests/reconciled-failover-chain.test.mjs",
  "tests/live-aap-runtime-integration.test.mjs",
  "tests/gemini-aap-runtime.test.mjs",
  "tests/agent-discovery-fabric.test.mjs",
  "tests/a2a-discovery-adapter.test.mjs",
  "tests/a2a-registry-search.test.mjs",
  "tests/a2a-registry-resolution.test.mjs",
  "tests/a2a-reference-inspection.test.mjs",
  "tests/a2a-github-repository-resolution.test.mjs",
  "tests/a2a-runtime-reachability.test.mjs",
  "tests/arca-node-manifest.test.mjs",
  "tests/arca-federation-response.test.mjs",
  "tests/arca-federation-introduction-delivery.test.mjs",
  "tests/live-a2a-discovery-validation.test.mjs",
  "tests/fixtures/aap-live-agent.mjs",
  "tests/cognitive-substitution.test.mjs",
  "tests/role-conformance.test.mjs",
  "examples/cognitive-substitution-v0.2.mjs",
  "tests/github-transport.test.mjs",
  "examples/acquisition-pilot/README.md",
  "examples/acquisition-pilot/validation.json",
  "examples/acquisition-pilot/proposal.json",
  "examples/acquisition-pilot/arca-home/acquisitions/INV-ARCA-RELEASE-VALIDATION/ACQ-PILOT-MASTER-1-3-PUBLIC/custody.ndjson",
  "examples/acquisition-pilot/arca-home/acquisitions/INV-ARCA-RELEASE-VALIDATION/ACQ-PILOT-MASTER-1-3-PUBLIC/manifest.json",
  "examples/acquisition-pilot/arca-home/acquisitions/INV-ARCA-RELEASE-VALIDATION/ACQ-PILOT-MASTER-1-3-PUBLIC/original/ARCA_DOCUMENTO_MESTRE_v1.3.0_PUBLICO.pdf"
];
const effectiveRequired=publicProfile
  ? required.filter((item)=>!item.startsWith(".github/workflows/")||item===".github/workflows/arca-ci.yml")
  : required;
for (const relative of effectiveRequired) await access(resolve(root, relative));
for (const schema of effectiveRequired.filter((item) => item.endsWith(".json"))) {
  JSON.parse(await readFile(resolve(root, schema), "utf8"));
}

const skippedDirectories = new Set([".git", "node_modules", "output", "release", "tmp"]);
const distributedFiles = [];
async function walk(current) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const absolutePath = resolve(current, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath);
      continue;
    }
    const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
    distributedFiles.push({ absolutePath, relativePath });
  }
}
await walk(root);

const prohibitedArtifactPaths = distributedFiles
  .map(({ relativePath }) => relativePath)
  .filter((relativePath) =>
    relativePath.startsWith("examples/legacy/") ||
    relativePath.startsWith("examples/migrated/") ||
    relativePath.startsWith("scripts/migrate-")
  );
assert.deepEqual(
  prohibitedArtifactPaths,
  [],
  `A distribuição pública contém artefatos de investigação: ${prohibitedArtifactPaths.join(", ")}`
);

// Fingerprints unidirecionais evitam republicar os próprios dados que o controle bloqueia.
const prohibitedTokenFingerprints = new Set([
  "89862648d255b4eb78dbc71ecbed6f8a389a6fcb80533c86ec03b8330e26f43a",
  "e04eb29020eaa961e99d3162635e9fe9585c5a1121bd88784c1378aa8837195c",
  "5ee55df0d1ff39ec2b86fb0e9fdca3d4e82e51e209d455c709ac038613aeed10",
  "103879ecd23ae2c365ff0572fb07f86022cc509d22cc2ba16ecee872323d3ef0",
  "02b618a121fdfda34e9bfcfb4fa4c92a8b1d2544c7fd72d335b4d9f9b1b63c40",
  "c4681e5365757b15f6b0fea109f08cda1f7e9032b38fe940c857d3b56157e994",
  "9ae77ce330479a7806d0909ab9e458a64865a2c263f7daf4852e6f26e8b2f894",
  "0361c9a0b8f63c43dc5abae0f4faabba520f06b6426635dc14686f21042ea0e7",
  "f093ea24a4876ceac8cc1b3fc9f714e8881d378f215766dd06891c0dafe04917",
  "b7ff8c32d14efef271ff1740789ff6d738ea77d11c2dda1ce132011c6237360d",
  "3e3c1399420a1b4096527b8c397694d05eff1e2789c67a78d4003cc1a345fb52",
  "c54359a5a805a0fd6b71eb8b8bf8d06f1b63168318a7482227a2fd4c21946e2d",
  "1bf0c0732532e6d8b1ded77c11641fa0c5e858e63bc9cfcc19844cc3a0b7480a"
]);

const intentionalAttributionFingerprintAllowlist = new Map();

const privacyHits = [];
let scannedTextFiles = 0;
for (const { absolutePath, relativePath } of distributedFiles) {
  const contents = await readFile(absolutePath);
  if (contents.includes(0)) continue;
  scannedTextFiles += 1;
  const text = `${relativePath}\n${contents.toString("utf8")}`.toLocaleLowerCase("pt-BR");
  const tokens = text.match(/[\p{L}\p{N}][\p{L}\p{N}.-]*/gu) ?? [];
  const candidates = [...tokens, ...tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`)];
  const allowedFingerprints = intentionalAttributionFingerprintAllowlist.get(relativePath) ?? new Set();
  for (const candidate of candidates) {
    const fingerprint = createHash("sha256").update(candidate).digest("hex");
    if (prohibitedTokenFingerprints.has(fingerprint) && !allowedFingerprints.has(fingerprint)) {
      privacyHits.push(relativePath);
      break;
    }
  }
}
assert.deepEqual(
  privacyHits,
  [],
  `A varredura de privacidade encontrou conteúdo bloqueado em: ${privacyHits.join(", ")}`
);

const adrs = (await readdir(resolve(root, "docs/adr"))).filter((item) => item.endsWith(".md"));
assert.ok(adrs.length >= 9, "São esperados pelo menos nove ADRs ratificados");
const testFiles = (await readdir(resolve(root, "tests"))).filter((item) => item.endsWith(".test.mjs"));
const testSource = await Promise.all(testFiles.map((item) => readFile(resolve(root, "tests", item), "utf8")));
const declaredTests = testSource.reduce((sum, source) => sum + (source.match(/\btest\s*\(/g) ?? []).length, 0);
assert.ok(declaredTests >= 42, "A release 0.3.0 deve preservar pelo menos os 42 testes da baseline");

const pilotRoot = resolve(
  root,
  "examples/acquisition-pilot/arca-home/acquisitions/INV-ARCA-RELEASE-VALIDATION/ACQ-PILOT-MASTER-1-3-PUBLIC"
);
const original = await readFile(resolve(pilotRoot, "original/ARCA_DOCUMENTO_MESTRE_v1.3.0_PUBLICO.pdf"));
const originalSha256 = createHash("sha256").update(original).digest("hex");
const manifest = JSON.parse(await readFile(resolve(pilotRoot, "manifest.json"), "utf8"));
const events = (await readFile(resolve(pilotRoot, "custody.ndjson"), "utf8"))
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
let previousEventHash = null;
for (const [index, event] of events.entries()) {
  const { eventHash, ...base } = event;
  assert.equal(event.sequence, index + 1, "Sequência inválida na captura-piloto");
  assert.equal(event.previousEventHash, previousEventHash, "Encadeamento inválido na captura-piloto");
  assert.equal(eventHash, sha256(canonicalStringify(base)), "Hash de evento inválido na captura-piloto");
  previousEventHash = eventHash;
}
assert.equal(originalSha256, manifest.original.originalSha256, "Hash do original piloto divergente");
assert.equal(original.byteLength, manifest.original.byteLength, "Tamanho do original piloto divergente");
assert.equal(manifest.eventCount, 2, "A captura-piloto deve conter aquisição e revisão");
assert.equal(manifest.eventHead, previousEventHash, "Head da captura-piloto divergente");
assert.equal(manifest.reviews.at(-1)?.outcome, "accepted", "A captura-piloto deve estar aceita");
assert.equal(manifest.reviews.at(-1)?.actor, undefined);
const reviewEvent = events.at(-1);
assert.equal(reviewEvent.kind, "REVIEW_RECORDED");
assert.equal(reviewEvent.actor.id, "owner-reviewer");
const proposal = JSON.parse(await readFile(resolve(root, "examples/acquisition-pilot/proposal.json"), "utf8"));
assert.equal(proposal.humanReviewRequired, true);
const pilotValidation = JSON.parse(await readFile(resolve(root, "examples/acquisition-pilot/validation.json"), "utf8"));
assert.equal(pilotValidation.status, "HUMAN_REVIEW_ACCEPTED");
assert.equal(pilotValidation.valid, true);
assert.equal(pilotValidation.privacy.profile, "public-sanitized");
assert.equal(pilotValidation.privacy.textAndPdfScan, "passed");

process.stdout.write(JSON.stringify({
  ok: true,
  requiredFiles: effectiveRequired.length,
  distributionProfile: publicProfile?"public":"engineering",
  adrs: adrs.length,
  testFiles: testFiles.length,
  declaredTests,
  pilot: {
    acquisitionId: manifest.acquisitionId,
    originalSha256,
    eventCount: manifest.eventCount,
    eventHead: manifest.eventHead,
    review: reviewEvent.payload.outcome
  },
  privacy: {
    profile: "public-sanitized",
    scannedTextFiles,
    prohibitedArtifactPaths: prohibitedArtifactPaths.length,
    prohibitedContentHits: privacyHits.length
  }
}) + "\n");