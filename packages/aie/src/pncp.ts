import { deterministicId } from "./engine.ts";
import { normalizeProcurementRecord } from "./procurement.ts";

export const PNCP_BUNDLE_FORMAT = "arca-aie-pncp-bundle-v1";

function taxIdentifier(value) {
  return String(value ?? "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function finite(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueParticipants(resultados = []) {
  const ids = new Set();
  for (const result of resultados) {
    const id = taxIdentifier(result?.niFornecedor ?? result?.fornecedor?.niFornecedor ?? result?.fornecedor?.cnpj);
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

function additiveSummary(termos = [], initialValue = null) {
  const valid = termos
    .map((term) => finite(term?.valorAcrescido))
    .filter((value) => value !== null && value > 0);
  const valueAdded = valid.reduce((sum, value) => sum + value, 0);
  const additivePercent = initialValue && initialValue > 0 ? (valueAdded / initialValue) * 100 : 0;
  return { termCount: termos.length, valueAdded, additivePercent };
}

function contractSupplier(contract, resultados) {
  const directId = taxIdentifier(contract?.niFornecedor);
  if (directId) {
    return {
      cnpj: directId,
      name: String(contract?.nomeRazaoSocialFornecedor ?? "").trim() || null,
      source: "contract"
    };
  }
  const informed = (resultados ?? []).find((item) => taxIdentifier(item?.niFornecedor));
  if (!informed) return { cnpj: null, name: null, source: "unresolved" };
  return {
    cnpj: taxIdentifier(informed.niFornecedor),
    name: String(informed.nomeRazaoSocialFornecedor ?? "").trim() || null,
    source: "result"
  };
}

export function validatePncpBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    return { valid: false, errors: ["bundle-invalid"] };
  }
  const procurement = bundle.contratacao;
  if (!procurement || typeof procurement !== "object") errors.push("missing-contratacao");
  if (!procurement?.numeroControlePNCP) errors.push("missing-numero-controle-pncp");
  if (bundle.contratos !== undefined && !Array.isArray(bundle.contratos)) errors.push("contratos-not-array");
  if (bundle.resultados !== undefined && !Array.isArray(bundle.resultados)) errors.push("resultados-not-array");
  if (bundle.termos !== undefined && !Array.isArray(bundle.termos)) errors.push("termos-not-array");
  return { valid: errors.length === 0, errors };
}

export function normalizePncpBundle(bundle, options = {}) {
  const validation = validatePncpBundle(bundle);
  if (!validation.valid) throw new Error(`PNCP bundle invalido: ${validation.errors.join(",")}`);

  const contratacao = bundle.contratacao;
  const contratos = bundle.contratos ?? [];
  const resultados = bundle.resultados ?? [];
  const termos = bundle.termos ?? [];
  const participants = uniqueParticipants(resultados);
  const sourceRef = options.sourceRef ?? `pncp-fixture:${contratacao.numeroControlePNCP}`;

  const contractsToNormalize = contratos.length ? contratos : [null];
  return contractsToNormalize.map((contract, index) => {
    const initialValue = finite(contract?.valorInicial ?? contract?.valorGlobal ?? contratacao?.valorTotalHomologado ?? contratacao?.valorTotalEstimado);
    const add = additiveSummary(termos.filter((term) => {
      if (!contract) return true;
      const termContract = term?.numeroControlePNCPContrato ?? term?.numeroControlePNCP;
      const contractControl = contract?.numeroControlePNCP;
      return !termContract || !contractControl || termContract === contractControl;
    }), initialValue);
    const supplier = contractSupplier(contract, resultados);
    const procurementId = contract?.numeroControlePNCPCompra ?? contratacao.numeroControlePNCP;
    const contractId = contract?.numeroControlePNCP ?? null;

    const normalized = normalizeProcurementRecord({
      procurementId,
      processId: contract?.processo ?? contratacao.processo ?? contratacao.numeroCompra,
      supplierCnpj: supplier.cnpj,
      supplierName: supplier.name,
      amount: finite(contract?.valorGlobal ?? contract?.valorInicial ?? contratacao?.valorTotalHomologado ?? contratacao?.valorTotalEstimado),
      participantCount: participants.length || null,
      additivePercent: add.additivePercent,
      modality: contratacao.modalidadeNome ?? contratacao.tipoInstrumentoConvocatorioNome ?? "unknown",
      objectDescription: contract?.objetoContrato ?? contratacao.objetoCompra ?? contratacao.objeto ?? null,
      publishedAt: contratacao.dataPublicacaoPncp ?? contratacao.dataPublicacaoPNCP ?? null
    }, { sourceRef: `${sourceRef}#contract-${index + 1}` });

    return {
      ...normalized,
      pncp: {
        bundleFormat: PNCP_BUNDLE_FORMAT,
        procurementControlNumber: contratacao.numeroControlePNCP,
        contractControlNumber: contractId,
        contractNumber: contract?.numeroContratoEmpenho ?? null,
        procurementYear: contratacao.anoCompra ?? contratacao.anoContratacao ?? null,
        contractYear: contract?.anoContrato ?? null,
        participantIds: participants,
        supplierResolutionSource: supplier.source,
        additiveTermCount: add.termCount,
        additiveValueAdded: add.valueAdded,
        bundleFingerprint: deterministicId("PNCP", bundle)
      }
    };
  });
}

export function normalizePncpBundles(bundles, options = {}) {
  if (!Array.isArray(bundles)) throw new TypeError("bundles deve ser array");
  return bundles.flatMap((bundle, index) => normalizePncpBundle(bundle, {
    sourceRef: options.sourceRef ? `${options.sourceRef}#bundle-${index + 1}` : undefined
  }));
}
