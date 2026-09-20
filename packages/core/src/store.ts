import { appendFile, lstat, mkdir, open, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { atomicWriteJson, canonicalStringify } from "./canonical.ts";
import { PROTOCOL_VERSION } from "./constants.ts";
import { createEvent, verifyEventChain } from "./events.ts";
import { assertSafeId } from "./ids.ts";
import { normalizeActor, utcNow } from "./model.ts";
import type { Actor, ArcaEvent } from "./model.ts";
import { replayEvents } from "./reducer.ts";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export class ArcaStore {
  readonly home: string;
  readonly investigationsRoot: string;

  constructor(home: string) {
    if (!home || typeof home !== "string") throw new Error("ARCA_HOME é obrigatório");
    this.home = resolve(home);
    this.investigationsRoot = join(this.home, "investigations");
  }

  async init(): Promise<{ home: string; initialized: boolean }> {
    await mkdir(this.home, { recursive: true, mode: 0o700 });
    await mkdir(this.investigationsRoot, { recursive: true, mode: 0o700 });
    const configPath = join(this.home, "config.json");
    const initialized = !(await exists(configPath));
    if (initialized) {
      await atomicWriteJson(configPath, {
        format: "arca-home-v1",
        protocolVersion: PROTOCOL_VERSION,
        createdAt: utcNow(),
        storage: "ndjson-event-log",
        privacy: "private-by-default"
      });
    }
    return { home: this.home, initialized };
  }

  private async safeInvestigationDirectory(investigationId: string, create = false): Promise<string> {
    assertSafeId(investigationId, "INV");
    await this.init();
    const rootReal = await realpath(this.investigationsRoot);
    const candidate = join(rootReal, investigationId);
    if (!candidate.startsWith(`${rootReal}${sep}`)) throw new Error("Caminho de investigação fora do ARCA_HOME");
    if (await exists(candidate)) {
      const info = await lstat(candidate);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(`Diretório inseguro para ${investigationId}`);
      }
      const candidateReal = await realpath(candidate);
      if (!candidateReal.startsWith(`${rootReal}${sep}`)) throw new Error("Escape por symlink detectado");
      return candidateReal;
    }
    if (!create) throw new Error(`Investigação não encontrada: ${investigationId}`);
    await mkdir(candidate, { mode: 0o700 });
    return candidate;
  }

  async listInvestigations(): Promise<string[]> {
    await this.init();
    const entries = await readdir(this.investigationsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && /^INV-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  }

  async hasInvestigation(investigationId: string): Promise<boolean> {
    assertSafeId(investigationId, "INV");
    await this.init();
    return exists(join(this.investigationsRoot, investigationId, "events.ndjson"));
  }

  async loadEvents(investigationId: string): Promise<ArcaEvent[]> {
    const directory = await this.safeInvestigationDirectory(investigationId, false);
    const path = join(directory, "events.ndjson");
    const raw = await readFile(path, "utf8");
    const events = raw
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line) as ArcaEvent;
        } catch {
          throw new Error(`JSON inválido no event log, linha ${index + 1}`);
        }
      });
    verifyEventChain(events, investigationId);
    return events;
  }

  async loadState(investigationId: string): Promise<any> {
    return replayEvents(await this.loadEvents(investigationId));
  }

  private async acquireLock(directory: string, timeoutMs = 5000): Promise<any> {
    const lockPath = join(directory, "events.lock");
    const started = Date.now();
    while (true) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: utcNow() }), "utf8");
        await handle.sync();
        return { handle, lockPath };
      } catch (error: any) {
        if (error?.code !== "EEXIST") throw error;
        if (Date.now() - started >= timeoutMs) {
          throw new Error(`Event log ocupado por outra escrita: ${lockPath}`);
        }
        await delay(25);
      }
    }
  }

  async append(input: {
    investigationId: string;
    operation: string;
    payload: Record<string, unknown>;
    actor?: Partial<Actor>;
    timestamp?: string;
    allowCreate?: boolean;
    expectedEventHead?: string | null;
  }): Promise<ArcaEvent> {
    const directory = await this.safeInvestigationDirectory(input.investigationId, Boolean(input.allowCreate));
    const lock = await this.acquireLock(directory);
    try {
      const eventsPath = join(directory, "events.ndjson");
      const currentEvents = await exists(eventsPath) ? await this.loadEvents(input.investigationId) : [];
      if (input.expectedEventHead !== undefined) {
        const currentHead = currentEvents.at(-1)?.eventHash ?? null;
        if (currentHead !== input.expectedEventHead) {
          throw new Error(
            `Conflito de concorrência: eventHead atual ${currentHead ?? "null"}, esperado ${input.expectedEventHead ?? "null"}`
          );
        }
      }
      if (!currentEvents.length && !["INVESTIGATION_CREATE", "LEGACY_IMPORT"].includes(input.operation)) {
        throw new Error("O primeiro evento deve criar ou importar a investigação");
      }
      if (currentEvents.length && ["INVESTIGATION_CREATE", "LEGACY_IMPORT"].includes(input.operation)) {
        throw new Error(`Investigação já existe: ${input.investigationId}`);
      }
      const event = createEvent({
        investigationId: input.investigationId,
        sequence: currentEvents.length + 1,
        operation: input.operation,
        timestamp: input.timestamp ?? utcNow(),
        actor: normalizeActor(input.actor),
        payload: input.payload,
        previousEventHash: currentEvents.at(-1)?.eventHash ?? null
      });
      const handle = await open(eventsPath, "a", 0o600);
      try {
        await handle.writeFile(`${canonicalStringify(event)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return event;
    } finally {
      await lock.handle.close();
      await rm(lock.lockPath, { force: true });
    }
  }

  async writeExport(path: string, value: unknown): Promise<string> {
    const output = isAbsolute(path) ? path : resolve(path);
    await atomicWriteJson(output, value);
    return output;
  }
}
