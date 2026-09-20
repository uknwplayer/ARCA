export const PROTOCOL_VERSION = "1.0.0";
export const STATE_SCHEMA_VERSION = "arca-state-v1";
export const EXPORT_FORMAT = "arca-export-v1";

export const OBJECT_TYPES = [
  "Q",
  "SRC",
  "DOC",
  "INF",
  "PRO",
  "ENT",
  "EVT",
  "HIP",
  "CON",
  "FRM",
  "GAP",
  "SEARCH"
] as const;

export const TYPE_TO_PREFIX: Record<string, string> = {
  INV: "INV",
  Q: "Q",
  SRC: "SRC",
  DOC: "DOC",
  INF: "INF",
  PRO: "PRO",
  ENT: "ENT",
  EVT: "EVT",
  HIP: "HIP",
  CON: "CON",
  FRM: "FRM",
  GAP: "GAP",
  SEARCH: "SEA",
  REL: "REL"
};

export const TYPE_TO_COLLECTION: Record<string, string> = {
  Q: "questions",
  SRC: "sources",
  DOC: "documents",
  INF: "information",
  PRO: "propositions",
  ENT: "entities",
  EVT: "events",
  HIP: "hypotheses",
  CON: "conclusions",
  FRM: "frames",
  GAP: "gaps",
  SEARCH: "searches"
};

export const COLLECTION_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_TO_COLLECTION).map(([type, collection]) => [collection, type])
);

export const EPISTEMIC_STATES = [
  "Confirmado",
  "Provável",
  "Possível",
  "Não verificado",
  "Contradito",
  "Desconhecido"
];

export const GAP_STATES = ["L0", "L1", "L2", "L3", "L4", "L5", "L6"];

export const EVIDENCE_EFFECTS = [
  "supports",
  "weakens",
  "contradicts",
  "inconclusive",
  "compatible"
];

export const RELATION_CATEGORIES = [
  "investigation",
  "provenance",
  "evidence",
  "epistemic",
  "semantic",
  "temporal",
  "identity",
  "frame",
  "operational"
];

export const EVENT_OPERATIONS = [
  "INVESTIGATION_CREATE",
  "OBJECT_CREATE",
  "OBJECT_UPDATE",
  "RELATION_CREATE",
  "OBJECT_ARCHIVE",
  "OBJECT_INVALIDATE",
  "OBJECT_REEVALUATE",
  "CONCLUSION_CLOSE",
  "CONCLUSION_REOPEN",
  "LEGACY_IMPORT"
];

export const ACS_REQUIREMENTS = [
  ["S-001", true], ["S-002", true], ["S-003", true], ["S-004", true],
  ["S-005", true], ["S-006", true], ["S-007", true], ["S-008", false],
  ["S-009", true], ["S-010", false],
  ["E-001", true], ["E-002", true], ["E-003", true], ["E-004", true],
  ["E-005", false], ["E-006", true], ["E-007", true], ["E-008", true],
  ["E-009", false], ["E-010", true], ["E-011", true], ["E-012", true],
  ["E-013", false], ["E-014", true], ["E-015", true],
  ["O-001", false], ["O-002", true], ["O-003", true], ["O-004", true],
  ["O-005", false], ["O-006", true], ["O-007", true], ["O-008", false],
  ["O-009", true], ["O-010", true], ["O-011", false], ["O-012", false],
  ["P-001", true], ["P-002", false], ["P-003", true], ["P-004", true],
  ["P-005", true], ["P-006", true], ["P-007", false], ["P-008", true],
  ["L-001", false], ["L-002", false]
] as Array<[string, boolean]>;
