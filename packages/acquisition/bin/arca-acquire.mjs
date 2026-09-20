#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  captureFile,
  enqueueAcquisition,
  recordReview,
  recordTransformation,
  verifyCustody
} from "../src/index.ts";

function args(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key.startsWith("--")) throw new Error(`argumento inesperado: ${key}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`valor ausente para ${key}`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return { command, options };
}
const required = (options, key) => {
  if (!options[key]) throw new Error(`--${key} é obrigatório`);
  return options[key];
};
const actor = (options) => ({ id: required(options, "actor"), role: options.role ?? "operator" });
const accessDeclaration = (options) => ({ basis: required(options, "basis"), declaration: required(options, "declaration") });

async function main() {
  const { command, options } = args(process.argv.slice(2));
  let result;
  if (command === "capture") {
    result = await captureFile({
      format: "arca-acquisition-request-v1",
      acquisitionId: required(options, "acquisition"),
      investigationId: required(options, "investigation"),
      sourceId: required(options, "source-id"),
      title: required(options, "title"),
      sourcePath: required(options, "source"),
      locator: required(options, "locator"),
      accessedAt: required(options, "accessed-at"),
      acquisitionMethod: options.method ?? "local-file",
      access: accessDeclaration(options),
      expectedEventHead: options["event-head"] ?? null,
      mediaType: options["media-type"] ?? "application/octet-stream",
      actor: actor(options)
    }, { home: required(options, "home"), allowedRoot: options["allowed-root"] });
  } else if (command === "verify") {
    result = await verifyCustody({ home: required(options, "home"), investigationId: required(options, "investigation"), acquisitionId: required(options, "acquisition") });
  } else if (command === "transform") {
    const parameters = options.parameters ? JSON.parse(options.parameters) : {};
    result = await recordTransformation({
      home: required(options, "home"),
      investigationId: required(options, "investigation"),
      acquisitionId: required(options, "acquisition"),
      outputPath: required(options, "output"),
      allowedRoot: options["allowed-root"],
      inputSha256: required(options, "input-sha256"),
      tool: { name: required(options, "tool"), version: required(options, "tool-version"), parameters },
      performedAt: required(options, "performed-at"),
      actor: actor(options),
      mediaType: options["media-type"]
    });
  } else if (command === "review") {
    result = await recordReview({
      home: required(options, "home"),
      investigationId: required(options, "investigation"),
      acquisitionId: required(options, "acquisition"),
      outcome: required(options, "outcome"),
      notes: required(options, "notes"),
      reviewedAt: required(options, "reviewed-at"),
      actor: actor(options)
    });
  } else if (command === "enqueue") {
    result = await enqueueAcquisition(required(options, "home"), {
      queueId: required(options, "queue"),
      investigationId: required(options, "investigation"),
      acquisitionId: required(options, "acquisition"),
      locator: required(options, "locator"),
      accessedAt: required(options, "accessed-at"),
      acquisitionMethod: options.method ?? "authorized-download",
      access: accessDeclaration(options),
      requestedBy: actor(options)
    });
  } else if (command === "from-json") {
    const payload = JSON.parse(await readFile(required(options, "file"), "utf8"));
    result = await captureFile(payload, { home: required(options, "home"), allowedRoot: options["allowed-root"] });
  } else {
    throw new Error("uso: arca-acquire <capture|verify|transform|review|enqueue|from-json> [opções]");
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
