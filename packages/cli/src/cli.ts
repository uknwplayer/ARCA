import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ArcaCore, prettyJson } from "../../core/src/index.ts";
import { runOpenAITermuxAsk } from "../../agent/src/index.ts";

interface ParsedArgs {
  positional: string[];
  options: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const equal = token.indexOf("=");
    if (equal > 2) {
      options[token.slice(2, equal)] = token.slice(equal + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { positional, options };
}

function textOption(options: Record<string, any>, key: string, required = false): string | undefined {
  const value = options[key];
  if (required && (typeof value !== "string" || !value.trim())) throw new Error(`--${key} é obrigatório`);
  return typeof value === "string" ? value : undefined;
}

function actorFrom(options: Record<string, any>): any {
  return {
    id: textOption(options, "actor") ?? "local-user",
    type: textOption(options, "actor-type") ?? "human",
    method: textOption(options, "actor-method") ?? "arca-cli@0.2.0"
  };
}

async function jsonInput(options: Record<string, any>, dataKey = "data", fileKey = "file"): Promise<any> {
  const inline = textOption(options, dataKey);
  const file = textOption(options, fileKey);
  if (Boolean(inline) === Boolean(file)) throw new Error(`Use exatamente um entre --${dataKey} e --${fileKey}`);
  const raw = inline ?? await readFile(resolve(file!), "utf8");
  try {
    return JSON.parse(raw);
  } catch (error: any) {
    throw new Error(`JSON inválido: ${error.message}`);
  }
}

function help(): string {
  return `ARCA Core CLI 0.2.0 — offline, append-only e auditável

Uso:
  arca init [--home .arca]
  arca list [--home .arca]
  arca ask --message "..." --allow-external [--model MODELO] [--max-output-tokens 1200]
  arca investigation create --question ... --objective ... --scope ... --limits ...
  arca investigation show --investigation INV-000001
  arca investigation status --investigation INV-000001
  arca object add --investigation ID --type SRC --data '{...}'
  arca object update --investigation ID --id PRO-000001 --data '{...}'
  arca relate --investigation ID --from INF-... --to PRO-... --relation supports --category evidence --justification ...
  arca trace --investigation ID --target CON-... [--direction ancestors|descendants]
  arca invalidate --investigation ID --id DOC-... --reason ...
  arca reevaluate --investigation ID --id PRO-... [--justification ...]
  arca conclusion close --investigation ID --id CON-... [--limit-justification ...]
  arca conclusion reopen --investigation ID --id CON-... --reason ...
  arca validate --investigation ID
  arca export --investigation ID --out arquivo.arca.json
  arca import legacy --file estado-legado.json
  arca demo [--home .arca-demo]

Opções globais:
  --home PATH       armazenamento local; padrão ARCA_HOME ou .arca
  --actor ID        autor da operação; padrão local-user
  --actor-type TYPE human|system|agent|migration
  --json            saída JSON compacta para automação
`;
}

async function runDemo(core: ArcaCore, home: string): Promise<any> {
  const state = await core.createInvestigation({
    question: "O fluxo local do ARCA preserva proveniência, grafo e reavaliação?",
    objective: "Demonstrar as operações do Core com conteúdo sintético claramente isolado.",
    scope: "Fixture local sem alegações sobre fatos externos.",
    limits: "A demonstração não prova fatos e não substitui auditoria semântica.",
    simulation: true,
    actor: { id: "demo-runner", type: "system", method: "arca-demo@0.2.0" }
  });
  const investigationId = state.investigation.id;
  const questionId = state.investigation.questionIds[0];
  const actor = { id: "demo-runner", type: "system" as const, method: "arca-demo@0.2.0" };
  const source = await core.addObject({ investigationId, type: "SRC", actor, data: {
    name: "Fonte sintética da demonstração",
    sourceType: "fixture",
    authority: "demonstrative_only",
    independenceGroup: "ARCA-DEMO",
    location: "simulation://arca-demo"
  }});
  const document = await core.addObject({ investigationId, type: "DOC", actor, data: {
    sourceId: source.id,
    title: "Documento sintético do fluxo ARCA",
    location: "simulation://arca-demo/document-1",
    acquiredAt: new Date().toISOString(),
    acquisitionMethod: "simulation",
    hashStatus: "simulated"
  }});
  const information = await core.addObject({ investigationId, type: "INF", actor, data: {
    documentId: document.id,
    content: "A execução simulada criou objetos distintos e os ligou por relações explícitas.",
    locator: "fixture:linha-1",
    extractionMethod: "manual_fixture",
    transformation: { method: "synthetic fixture", version: "0.1.0", reviewed: true }
  }});
  const proposition = await core.addObject({ investigationId, type: "PRO", actor, data: {
    text: "Nesta execução simulada, objetos ontológicos distintos foram persistidos.",
    epistemicStatus: "Confirmado",
    classificationJustification: "Confirmação limitada ao estado local produzido pela própria suíte de demonstração."
  }});
  const hypothesis = await core.addObject({ investigationId, type: "HIP", actor, data: {
    statement: "O event log pode reconstruir a projeção sem depender de snapshot.",
    epistemicStatus: "Possível",
    tests: ["Apagar qualquer cache e reproduzir todos os eventos em nova instância."],
    alternatives: ["A projeção poderia depender de estado oculto fora do log."],
    devilsAdvocateCompleted: true
  }});
  const gap = await core.addObject({ investigationId, type: "GAP", actor, data: {
    gapState: "L0",
    gapType: "external_semantic_audit",
    description: "A demonstração não contém auditoria semântica externa.",
    materiality: "medium",
    likelyToChangeResult: false,
    nextAction: "Submeter uma investigação real a auditor independente."
  }});
  const conclusion = await core.addObject({ investigationId, type: "CON", actor, data: {
    questionId,
    statement: "O fluxo técnico local foi executado; isso não demonstra conformidade semântica integral.",
    scope: "Execução simulada do Core 0.2.0.",
    epistemicStatus: "Confirmado",
    lifecycleStatus: "provisional",
    favorableBases: [proposition.id],
    contraryBases: ["Ausência de auditoria externa"],
    materialGaps: [gap.id],
    limitations: ["Fixture sintética", "Sem fonte externa", "Sem auditoria independente"],
    reopeningConditions: ["Reabrir se um replay produzir projeção estruturalmente diferente."],
    dependencyIds: [proposition.id, hypothesis.id, gap.id]
  }});

  await core.relate({ investigationId, from: source.id, to: document.id, relationType: "acquired_from", category: "provenance", justification: "Documento sintético pertence à fonte sintética.", actor });
  await core.relate({ investigationId, from: document.id, to: information.id, relationType: "extracted_from", category: "provenance", justification: "Informação extraída do documento fixture.", actor });
  await core.relate({ investigationId, from: information.id, to: proposition.id, relationType: "supports", category: "evidence", effect: "supports", justification: "O conteúdo fixture descreve o estado persistido.", actor });
  await core.relate({ investigationId, from: questionId, to: hypothesis.id, relationType: "generates", category: "investigation", justification: "Hipótese deriva da questão da demonstração.", actor });
  await core.relate({ investigationId, from: proposition.id, to: conclusion.id, relationType: "supports", category: "epistemic", effect: "supports", justification: "A proposição sustenta a conclusão apenas no escopo técnico local.", actor });
  await core.relate({ investigationId, from: hypothesis.id, to: conclusion.id, relationType: "depends_on", category: "epistemic", justification: "A conclusão depende do teste de reconstrução.", actor });
  await core.relate({ investigationId, from: gap.id, to: conclusion.id, relationType: "limits", category: "operational", justification: "A lacuna limita a declaração de conformidade integral.", actor });
  await core.relate({ investigationId, from: questionId, to: conclusion.id, relationType: "answered_by", category: "investigation", justification: "A conclusão responde à questão no escopo declarado.", actor });
  await core.closeConclusion({ investigationId, id: conclusion.id, actor });

  const outputPath = join(home, "exports", `${investigationId}.arca.json`);
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  const exported = await core.exportInvestigation(investigationId, outputPath);
  return {
    message: "Demonstração ARCA concluída com conteúdo sintético isolado.",
    investigationId,
    home,
    exportPath: outputPath,
    eventCount: exported.events.length,
    trace: await core.trace(investigationId, conclusion.id),
    status: await core.status(investigationId)
  };
}

export async function main(argv: string[]): Promise<void> {
  const { positional, options } = parseArgs(argv);
  const [command, subcommand] = positional;
  if (!command || ["help", "--help", "-h"].includes(command)) {
    process.stdout.write(help());
    return;
  }
  const home = resolve(textOption(options, "home") ?? process.env.ARCA_HOME ?? ".arca");
  const core = new ArcaCore(home);
  const actor = actorFrom(options);
  const investigationId = textOption(options, "investigation");
  let result: any;

  if (command === "init") {
    result = await core.init();
  } else if (command === "list") {
    result = { home, investigations: await core.list() };
  } else if (command === "ask") {
    const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) throw new Error("OPENAI_API_KEY é obrigatório para arca ask");
    const model = textOption(options, "model") ?? (String(process.env.ARCA_OPENAI_MODEL ?? "").trim() || undefined);
    const allowExternal = options["allow-external"] === true || options["allow-external"] === "true";
    result = await runOpenAITermuxAsk({
      message: textOption(options, "message", true)!,
      apiKey,
      ...(model ? { model } : {}),
      allowExternal,
      maxOutputTokens: Number(textOption(options, "max-output-tokens") ?? "1200"),
      timeoutMs: Number(textOption(options, "timeout-ms") ?? "30000")
    });
  } else if (command === "investigation" && subcommand === "create") {
    result = await core.createInvestigation({
      id: textOption(options, "id"),
      question: textOption(options, "question", true)!,
      objective: textOption(options, "objective", true)!,
      scope: textOption(options, "scope", true)!,
      limits: textOption(options, "limits", true)!,
      simulation: options.simulation === true || options.simulation === "true",
      actor
    });
  } else if (command === "investigation" && subcommand === "show") {
    result = await core.get(investigationId ?? textOption(options, "id", true)!);
  } else if (command === "investigation" && subcommand === "status") {
    result = await core.status(investigationId ?? textOption(options, "id", true)!);
  } else if (command === "object" && subcommand === "add") {
    result = await core.addObject({
      investigationId: investigationId ?? textOption(options, "investigation", true)!,
      type: textOption(options, "type", true)!,
      id: textOption(options, "id"),
      data: await jsonInput(options),
      actor
    });
  } else if (command === "object" && subcommand === "update") {
    result = await core.updateObject({
      investigationId: investigationId ?? textOption(options, "investigation", true)!,
      id: textOption(options, "id", true)!,
      patch: await jsonInput(options),
      actor
    });
  } else if (command === "relate") {
    result = await core.relate({
      investigationId: investigationId ?? textOption(options, "investigation", true)!,
      from: textOption(options, "from", true)!,
      to: textOption(options, "to", true)!,
      relationType: textOption(options, "relation", true)!,
      category: textOption(options, "category", true)!,
      effect: textOption(options, "effect"),
      justification: textOption(options, "justification"),
      materiality: textOption(options, "materiality"),
      id: textOption(options, "id"),
      actor
    });
  } else if (command === "trace") {
    const direction = (textOption(options, "direction") ?? "ancestors") as "ancestors" | "descendants";
    if (!new Set(["ancestors", "descendants"]).has(direction)) throw new Error("--direction deve ser ancestors ou descendants");
    result = await core.trace(investigationId ?? textOption(options, "investigation", true)!, textOption(options, "target", true)!, direction);
  } else if (command === "invalidate") {
    result = await core.invalidate({
      investigationId: investigationId ?? textOption(options, "investigation", true)!,
      id: textOption(options, "id", true)!,
      reason: textOption(options, "reason", true)!,
      actor
    });
  } else if (command === "reevaluate") {
    result = await core.reevaluate({
      investigationId: investigationId ?? textOption(options, "investigation", true)!,
      id: textOption(options, "id", true)!,
      justification: textOption(options, "justification"),
      actor
    });
  } else if (command === "conclusion" && subcommand === "close") {
    result = await core.closeConclusion({
      investigationId: investigationId ?? textOption(options, "investigation", true)!,
      id: textOption(options, "id", true)!,
      limitJustification: textOption(options, "limit-justification"),
      actor
    });
  } else if (command === "conclusion" && subcommand === "reopen") {
    result = await core.reopenConclusion({
      investigationId: investigationId ?? textOption(options, "investigation", true)!,
      id: textOption(options, "id", true)!,
      reason: textOption(options, "reason", true)!,
      actor
    });
  } else if (command === "validate") {
    result = await core.validate(investigationId ?? textOption(options, "investigation", true)!);
  } else if (command === "export") {
    const out = resolve(textOption(options, "out", true)!);
    result = await core.exportInvestigation(investigationId ?? textOption(options, "investigation", true)!, out);
    result = { outputPath: out, integrity: result.integrity, validation: result.validation };
  } else if (command === "import" && subcommand === "legacy") {
    const file = resolve(textOption(options, "file", true)!);
    const rawText = await readFile(file, "utf8");
    result = await core.importLegacy({ raw: JSON.parse(rawText), originalBytes: rawText, actor: { ...actor, type: "migration" } });
  } else if (command === "demo") {
    result = await runDemo(core, home);
  } else {
    throw new Error(`Comando desconhecido: ${positional.join(" ")}\n\n${help()}`);
  }

  if (command === "ask" && options.json !== true) {
    process.stdout.write(String(result.text ?? "") + "\n");
    return;
  }
  process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : prettyJson(result));
}
