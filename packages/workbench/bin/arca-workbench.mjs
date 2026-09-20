#!/usr/bin/env node

import { resolve } from "node:path";
import { createWorkbenchServer, DEFAULT_WORKBENCH_PORT } from "../src/server.ts";
import { ReviewContinuationWakeController } from "../../agent/src/index.ts";

function valueOf(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`${name} exige um valor`);
  return args[index + 1];
}

function help() {
  process.stdout.write(`ARCA Workbench 0.2.0\n\nUso:\n  arca-workbench [--home DIRETORIO] [--host HOST] [--port PORTA] [--allow-remote] [--no-review-wake]\n\nPor padrão, escuta somente em 127.0.0.1:4317 e mantém ativo o controller local\nde Review-Gated Continuation. O modo remoto não possui autenticação e deve ser usado\napenas atrás de uma camada de acesso confiável.\n`);
}

try {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    help();
    process.exit(0);
  }
  const home = resolve(valueOf(args, "--home", process.env.ARCA_HOME || ".arca-workbench"));
  const host = valueOf(args, "--host", "127.0.0.1");
  const rawPort = valueOf(args, "--port", String(DEFAULT_WORKBENCH_PORT));
  if (!/^\d+$/.test(rawPort)) throw new Error(`Porta inválida: ${rawPort}`);
  const instance = createWorkbenchServer({
    home,
    host,
    port: Number(rawPort),
    allowRemote: args.includes("--allow-remote")
  });
  const wakeController = args.includes("--no-review-wake") ? null : new ReviewContinuationWakeController(instance.reviews);
  const address = await instance.start();
  if (wakeController) await wakeController.start();
  process.stdout.write(`ARCA Workbench 0.2.0\n${address.url}\nARCA_HOME: ${home}\nReview wake: ${wakeController ? "active" : "disabled"}\n`);
  if (args.includes("--allow-remote")) {
    process.stderr.write("AVISO: modo remoto habilitado; o Workbench 0.2.0 não inclui autenticação.\n");
  }
  const shutdown = async () => {
    await wakeController?.stop();
    await instance.stop();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  process.stderr.write(`Erro: ${error?.message ?? error}\n`);
  process.exit(1);
}
