#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildBlindCorpusManifest,
  buildBlindProcurementRun,
  compareBlindProcurementRuns,
  createBlindAnswerKeyCommitment,
  scoreCommittedBlindProcurementRun
} from "../src/index.ts";

function parseArgs(argv) {
  const positional = [];
  const options = {};
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

function pathOption(options, key, required = true) {
  const value = options[key];
  if (required && (typeof value !== "string" || !value.trim())) throw new Error(`--${key} e obrigatorio`);
  return typeof value === "string" && value.trim() ? resolve(value) : null;
}

async function readJson(path, label) {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} nao contem JSON valido`);
  }
}

async function readNonce(path) {
  const value = (await readFile(path, "utf8")).trim();
  if (!value) throw new Error("arquivo de nonce esta vazio");
  return value;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function help() {
  return `ARCA AIE Blind Evaluation CLI — D1 / D2-prep\n\nUso:\n  arca-aie-blind manifest --corpus corpus.json --out manifest.json\n  arca-aie-blind run --corpus corpus.json --out run.json\n  arca-aie-blind commit-key --answer-key answer-key.json --nonce-file nonce.txt --out commitment.json\n  arca-aie-blind score --run run.json --commitment commitment.json --answer-key answer-key.json --nonce-file nonce.txt --out score.json\n  arca-aie-blind compare --left run-a.json --right run-b.json [--out comparison.json]\n\nSeguranca:\n  - o runner nao recebe answer key.\n  - nonce e lido de arquivo; nao passe o segredo na linha de comando.\n  - commitment nao contem answer key nem nonce.\n  - score comprometido exige abertura valida.\n  - nenhum comando acessa rede ou escreve no Core.\n`;
}

export async function main(argv) {
  const { positional, options } = parseArgs(argv);
  const command = positional[0];
  if (!command || command === "help" || options.help === true) {
    process.stdout.write(help());
    return;
  }

  let result;
  if (command === "manifest") {
    const corpus = await readJson(pathOption(options, "corpus"), "corpus");
    result = buildBlindCorpusManifest(corpus);
    await writeJson(pathOption(options, "out"), result);
  } else if (command === "run") {
    const corpus = await readJson(pathOption(options, "corpus"), "corpus");
    result = buildBlindProcurementRun(corpus);
    await writeJson(pathOption(options, "out"), result);
  } else if (command === "commit-key") {
    const answerKey = await readJson(pathOption(options, "answer-key"), "answer key");
    const nonce = await readNonce(pathOption(options, "nonce-file"));
    result = createBlindAnswerKeyCommitment(answerKey, nonce);
    await writeJson(pathOption(options, "out"), result);
  } else if (command === "score") {
    const run = await readJson(pathOption(options, "run"), "run");
    const commitment = await readJson(pathOption(options, "commitment"), "commitment");
    const answerKey = await readJson(pathOption(options, "answer-key"), "answer key");
    const nonce = await readNonce(pathOption(options, "nonce-file"));
    result = scoreCommittedBlindProcurementRun(run, commitment, answerKey, nonce);
    await writeJson(pathOption(options, "out"), result);
  } else if (command === "compare") {
    const left = await readJson(pathOption(options, "left"), "left run");
    const right = await readJson(pathOption(options, "right"), "right run");
    result = compareBlindProcurementRuns(left, right);
    const out = pathOption(options, "out", false);
    if (out) await writeJson(out, result);
  } else {
    throw new Error(`comando desconhecido: ${command}\n\n${help()}`);
  }

  if (options.json === true || command === "compare") process.stdout.write(`${JSON.stringify(result)}\n`);
  else process.stdout.write(`OK ${command}\n`);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`ARCA_AIE_BLIND_ERROR: ${error.message}\n`);
  if (process.env.ARCA_DEBUG === "1") process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
