import { detectRobustOutliers, deterministicId } from "./engine.ts";

export const PROCUREMENT_ITEM_FORMAT = "arca-aie-procurement-item-v1";

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numberFrom(value) {
  if (finiteNumber(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  let normalized;
  if (text.includes(",")) {
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = text;
  }
  normalized = normalized.replace(/R\$/gi, "").replace(/\s+/g, "").replace(/[^0-9.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pick(raw, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let current = raw;
    for (const part of parts) current = current?.[part];
    if (current !== undefined && current !== null && current !== "") return current;
  }
  return null;
}

export function normalizeComparableText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeUnit(value) {
  const unit = normalizeComparableText(value).replace(/\s+/g, "");
  const aliases = new Map([
    ["kg", "kg"], ["quilo", "kg"], ["quilos", "kg"], ["quilograma", "kg"], ["quilogramas", "kg"],
    ["g", "g"], ["grama", "g"], ["gramas", "g"],
    ["l", "l"], ["lt", "l"], ["litro", "l"], ["litros", "l"],
    ["ml", "ml"], ["mililitro", "ml"], ["mililitros", "ml"],
    ["un", "unit"], ["und", "unit"], ["unid", "unit"], ["unidade", "unit"], ["unidades", "unit"], ["unit", "unit"],
    ["m", "m"], ["metro", "m"], ["metros", "m"],
    ["m2", "m2"], ["metroquadrado", "m2"], ["metrosquadrados", "m2"],
    ["m3", "m3"], ["metrocubico", "m3"], ["metroscubicos", "m3"],
    ["cx", "box"], ["caixa", "box"], ["caixas", "box"],
    ["pct", "pack"], ["pacote", "pack"], ["pacotes", "pack"]
  ]);
  return aliases.get(unit) ?? (unit || null);
}

function buildComparabilityKey({ description, objectClass, unit }) {
  const classKey = normalizeComparableText(objectClass);
  const descriptionKey = normalizeComparableText(description);
  const semanticKey = classKey ? `class:${classKey}` : descriptionKey ? `desc:${descriptionKey}` : null;
  if (!semanticKey || !unit) return null;
  return `${semanticKey}|unit:${unit}`;
}

export function normalizeProcurementItem(raw, options = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("item bruto de contratação inválido");

  const sourceRef = options.sourceRef ?? pick(raw, ["sourceRef", "source.ref"]) ?? "synthetic-item-fixture";
  const procurementId = String(pick(raw, ["procurementId", "numeroControlePNCP", "process.id"]) ?? "").trim() || null;
  const itemNumber = String(pick(raw, ["itemNumber", "numeroItem", "item.numero"]) ?? "").trim() || null;
  const description = String(pick(raw, ["description", "descricao", "descricaoItem", "item.description"]) ?? "").trim() || null;
  const objectClass = String(pick(raw, ["objectClass", "classe", "categoria", "item.objectClass"]) ?? "").trim() || null;
  const quantity = numberFrom(pick(raw, ["quantity", "quantidade", "item.quantity"]));
  const unit = normalizeUnit(pick(raw, ["unit", "unidadeMedida", "unidade", "item.unit"]));
  const explicitUnitPrice = numberFrom(pick(raw, ["unitPrice", "valorUnitario", "valorUnitarioEstimado", "item.unitPrice"]));
  const totalPrice = numberFrom(pick(raw, ["totalPrice", "valorTotal", "valorTotalEstimado", "item.totalPrice"]));
  const unitPrice = explicitUnitPrice !== null
    ? explicitUnitPrice
    : finiteNumber(totalPrice) && finiteNumber(quantity) && quantity > 0 ? totalPrice / quantity : null;

  const warnings = [];
  if (!description && !objectClass) warnings.push("missing-item-description-or-class");
  if (!unit) warnings.push("missing-unit");
  if (!finiteNumber(quantity) || quantity <= 0) warnings.push("invalid-quantity");
  if (!finiteNumber(unitPrice) || unitPrice < 0) warnings.push("invalid-unit-price");
  if (explicitUnitPrice === null && unitPrice !== null) warnings.push("unit-price-derived-from-total-and-quantity");

  const comparabilityKey = buildComparabilityKey({ description, objectClass, unit });
  if (!comparabilityKey) warnings.push("missing-comparability-key");

  const base = {
    format: PROCUREMENT_ITEM_FORMAT,
    procurementId,
    itemNumber,
    description,
    objectClass,
    quantity,
    unit,
    unitPrice,
    totalPrice,
    comparabilityKey,
    sourceRefs: [String(sourceRef)],
    normalization: {
      method: "public-procurement-item-normalizer-v1",
      warnings,
      originalShapeHash: deterministicId("RAWITEM", raw)
    }
  };

  return {
    itemId: deterministicId("PITEM", {
      procurementId,
      itemNumber,
      description: normalizeComparableText(description),
      objectClass: normalizeComparableText(objectClass),
      quantity,
      unit,
      unitPrice,
      sourceRef
    }),
    ...base
  };
}

export function normalizeProcurementItems(items, options = {}) {
  if (!Array.isArray(items)) throw new TypeError("items deve ser array");
  return items.map((item, index) => normalizeProcurementItem(item, {
    sourceRef: options.sourceRef ? `${options.sourceRef}#item-${index + 1}` : undefined
  }));
}

export function buildComparableItemGroups(items, options = {}) {
  if (!Array.isArray(items)) throw new TypeError("items deve ser array");
  const minimumGroupSize = options.minimumGroupSize ?? 5;
  const grouped = new Map();
  const excluded = [];

  for (const item of items) {
    if (!item?.comparabilityKey) {
      excluded.push({ itemId: item?.itemId ?? null, reason: "missing-comparability-key" });
      continue;
    }
    if (!finiteNumber(item.unitPrice) || item.unitPrice < 0) {
      excluded.push({ itemId: item.itemId, reason: "invalid-unit-price" });
      continue;
    }
    if (!grouped.has(item.comparabilityKey)) grouped.set(item.comparabilityKey, []);
    grouped.get(item.comparabilityKey).push(item);
  }

  const groups = [...grouped.entries()]
    .map(([comparabilityKey, records]) => ({
      comparabilityKey,
      records,
      recordCount: records.length,
      eligible: records.length >= minimumGroupSize
    }))
    .sort((a, b) => a.comparabilityKey.localeCompare(b.comparabilityKey));

  return { groups, excluded, minimumGroupSize };
}

export function detectComparableUnitPriceOutliers(items, options = {}) {
  const minimumGroupSize = options.minimumGroupSize ?? 5;
  const threshold = options.threshold ?? 3.5;
  const grouping = buildComparableItemGroups(items, { minimumGroupSize });
  const legitimateExplanations = [
    "Especificação técnica, marca, qualidade, embalagem ou condição de entrega diferente apesar da descrição semelhante.",
    "Prazo, local, escala ou obrigação contratual pode alterar o preço unitário comparável.",
    "Quantidade, unidade de medida ou preço unitário pode ter sido informado ou normalizado incorretamente."
  ];
  const findings = [];

  for (const group of grouping.groups.filter((item) => item.eligible)) {
    const rawFindings = detectRobustOutliers(group.records, {
      field: "unitPrice",
      threshold,
      minimumSampleSize: minimumGroupSize,
      detectorId: "RISK-COMPARABLE-UNIT-PRICE-001",
      baselineOptions: {
        group: group.comparabilityKey,
        filters: { comparabilityKey: group.comparabilityKey }
      }
    });

    for (const raw of rawFindings) {
      const body = {
        ...raw,
        summary: "Preço unitário fora do baseline de itens comparáveis",
        observed: {
          ...raw.observed,
          comparabilityKey: group.comparabilityKey,
          comparableRecordCount: group.recordCount
        },
        alternativeExplanations: legitimateExplanations,
        gaps: [
          "Confirmar especificação técnica, embalagem, marca quando juridicamente relevante, local de entrega, quantidade e unidade antes de interpretar o desvio.",
          "Confirmar o preço unitário diretamente na fonte primária e verificar se tributos, frete ou serviços acessórios estão incluídos."
        ]
      };
      delete body.findingId;
      findings.push({ findingId: deterministicId("FND", body), ...body });
    }
  }

  return findings;
}

export function buildItemComparabilityProfile(items, options = {}) {
  if (!Array.isArray(items)) throw new TypeError("items deve ser array");
  const grouping = buildComparableItemGroups(items, options);
  const findings = detectComparableUnitPriceOutliers(items, options);
  const warningCount = items.reduce((sum, item) => sum + (item?.normalization?.warnings?.length ?? 0), 0);
  return {
    format: "arca-aie-item-comparability-profile-v1",
    itemCount: items.length,
    groupCount: grouping.groups.length,
    eligibleGroupCount: grouping.groups.filter((group) => group.eligible).length,
    excludedCount: grouping.excluded.length,
    normalizationWarningCount: warningCount,
    findingCount: findings.length,
    investigateCount: findings.filter((finding) => finding.triage === "investigate").length,
    reviewCount: findings.filter((finding) => finding.triage === "review").length,
    groups: grouping.groups.map((group) => ({
      comparabilityKey: group.comparabilityKey,
      recordCount: group.recordCount,
      eligible: group.eligible,
      itemIds: group.records.map((item) => item.itemId)
    })),
    excluded: grouping.excluded,
    findings,
    humanReviewRequired: true
  };
}

export function normalizePncpItems(bundle, options = {}) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) throw new TypeError("bundle PNCP invalido");
  const items = bundle.itens ?? bundle.items ?? [];
  if (!Array.isArray(items)) throw new TypeError("bundle.itens deve ser array");
  const procurementId = bundle.contratacao?.numeroControlePNCP ?? bundle.numeroControlePNCP ?? null;
  return items.map((item, index) => normalizeProcurementItem({
    ...item,
    procurementId: item.procurementId ?? procurementId,
    itemNumber: item.itemNumber ?? item.numeroItem ?? index + 1,
    description: item.description ?? item.descricao ?? item.descricaoItem,
    quantity: item.quantity ?? item.quantidade,
    unit: item.unit ?? item.unidadeMedida ?? item.unidade,
    unitPrice: item.unitPrice ?? item.valorUnitario ?? item.valorUnitarioEstimado,
    totalPrice: item.totalPrice ?? item.valorTotal ?? item.valorTotalEstimado,
    objectClass: item.objectClass ?? item.classe ?? item.categoria
  }, {
    sourceRef: options.sourceRef ? `${options.sourceRef}#pncp-item-${index + 1}` : `pncp-fixture:${procurementId ?? "unknown"}#item-${index + 1}`
  }));
}
