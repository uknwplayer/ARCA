import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ArcaCore, assertSafeId } from "../../core/src/index.ts";
import {
  AGENT_BUNDLE_VERSION,
  AgentProposalStore,
  HUMAN_REVIEW_VERSION,
  HumanReviewQueue,
  materializeMachineBridgeReviews
} from "../../agent/src/index.ts";

export const WORKBENCH_VERSION = "0.2.2";
export const DEFAULT_WORKBENCH_PORT = 4317;
export const MAX_REQUEST_BYTES = 1024 * 1024;

const PUBLIC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const AGENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../agent");
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/reviews.html": { file: "reviews.html", type: "text/html; charset=utf-8" },
  "/reviews.js": { file: "reviews.js", type: "text/javascript; charset=utf-8" }
};

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function isLoopback(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function requestHostname(hostHeader: string): string {
  try {
    return new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    throw new HttpError(400, "INVALID_HOST", "Cabeçalho Host inválido");
  }
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

function sendText(response: ServerResponse, status: number, body: string, contentType: string, filename?: string): void {
  response.statusCode = status;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");
  if (filename) response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<Record<string, any>> {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new HttpError(415, "JSON_REQUIRED", "Content-Type application/json é obrigatório");
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new HttpError(413, "BODY_TOO_LARGE", `Corpo excede ${MAX_REQUEST_BYTES} bytes`);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_REQUEST_BYTES) throw new HttpError(413, "BODY_TOO_LARGE", `Corpo excede ${MAX_REQUEST_BYTES} bytes`);
    chunks.push(buffer);
  }
  if (!total) throw new HttpError(400, "EMPTY_BODY", "Corpo JSON obrigatório");
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("O corpo deve ser um objeto JSON");
    }
    return value;
  } catch (error: any) {
    throw new HttpError(400, "INVALID_JSON", error?.message === "O corpo deve ser um objeto JSON" ? error.message : "JSON inválido");
  }
}

function decodeSegments(pathname: string): string[] {
  try {
    return pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    throw new HttpError(400, "INVALID_PATH", "Caminho contém codificação inválida");
  }
}

function actor(body: Record<string, any>): { id: string; type: "human"; method: string } {
  const id = typeof body.actorId === "string" && body.actorId.trim() ? body.actorId.trim().slice(0, 160) : "workbench-user";
  return { id, type: "human", method: `arca-workbench@${WORKBENCH_VERSION}` };
}

function expectedHead(body: Record<string, any>): string | null {
  if (!Object.hasOwn(body, "expectedEventHead")) {
    throw new HttpError(409, "EVENT_HEAD_REQUIRED", "expectedEventHead é obrigatório para alterações");
  }
  const value = body.expectedEventHead;
  if (value !== null && (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))) {
    throw new HttpError(400, "INVALID_EVENT_HEAD", "expectedEventHead inválido");
  }
  return value;
}

function errorStatus(error: any): number {
  if (error instanceof HttpError) return error.status;
  const message = String(error?.message ?? "");
  if (/não encontrada|não encontrado|inexistente|ENOENT/.test(message)) return 404;
  if (/Conflito de concorrência|obsoleta|já está|já existe|já invalidado|já encerrad|bloqueou|ocupad/.test(message)) return 409;
  return 400;
}

function csrfMatches(actual: string | undefined, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export interface WorkbenchOptions {
  home: string;
  host?: string;
  port?: number;
  allowRemote?: boolean;
}

export function createWorkbenchServer(options: WorkbenchOptions) {
  if (!options?.home) throw new Error("home é obrigatório");
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? DEFAULT_WORKBENCH_PORT;
  const allowRemote = Boolean(options.allowRemote);
  if (!isLoopback(host) && !allowRemote) {
    throw new Error("O Workbench recusa bind remoto sem --allow-remote explícito");
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Porta inválida: ${port}`);
  const home = resolve(options.home);
  const core = new ArcaCore(home);
  const proposals = new AgentProposalStore(home, core);
  const reviews = new HumanReviewQueue(home);
  const csrfToken = randomBytes(32).toString("hex");
  const startedAt = new Date().toISOString();

  const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      const hostHeader = String(request.headers.host ?? "");
      if (!hostHeader) throw new HttpError(400, "HOST_REQUIRED", "Cabeçalho Host obrigatório");
      const requestHost = requestHostname(hostHeader);
      if (!allowRemote && !isLoopback(requestHost)) throw new HttpError(403, "REMOTE_HOST_REJECTED", "Acesso remoto recusado");

      const origin = request.headers.origin;
      if (origin) {
        let originHost: string;
        let protocol: string;
        try {
          const parsed = new URL(origin);
          originHost = parsed.host.toLowerCase();
          protocol = parsed.protocol;
        } catch {
          throw new HttpError(403, "ORIGIN_REJECTED", "Origin inválida");
        }
        if (!["http:", "https:"].includes(protocol) || originHost !== hostHeader.toLowerCase()) {
          throw new HttpError(403, "ORIGIN_REJECTED", "Origin não autorizada");
        }
      }

      const method = request.method ?? "GET";
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const supplied = Array.isArray(request.headers["x-arca-csrf"])
          ? request.headers["x-arca-csrf"][0]
          : request.headers["x-arca-csrf"];
        if (!csrfMatches(supplied, csrfToken)) throw new HttpError(403, "CSRF_REJECTED", "Token CSRF ausente ou inválido");
      }

      const url = new URL(request.url ?? "/", `http://${hostHeader}`);
      const segments = decodeSegments(url.pathname);

      if (method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, service: "arca-workbench", version: WORKBENCH_VERSION, core: "1.0.0", startedAt });
        return;
      }
      if (method === "GET" && url.pathname === "/api/session") {
        sendJson(response, 200, {
          workbenchVersion: WORKBENCH_VERSION,
          agentBundleVersion: AGENT_BUNDLE_VERSION,
          humanReviewVersion: HUMAN_REVIEW_VERSION,
          csrfToken,
          localOnly: !allowRemote,
          bindHost: host
        });
        return;
      }
      if (method === "GET" && url.pathname === "/api/agent/contract") {
        sendJson(response, 200, {
          format: "arca-agent-contract-v1",
          version: AGENT_BUNDLE_VERSION,
          authority: "proposal-only",
          requiresHumanReview: true,
          oneOperationPerProposal: true,
          optimisticConcurrency: "expectedEventHead",
          prompt: "/api/agent/prompt",
          schema: "/api/agent/schema",
          operations: ["create_object", "update_object", "create_relation", "invalidate_object", "reevaluate_object", "close_conclusion", "reopen_conclusion"],
          principles: ["O Crivo não procura uma conclusão. Procura evidências.", "Investigação é grafo, não narrativa.", "Sem inferência automática."]
        });
        return;
      }
      if (method === "GET" && url.pathname === "/api/agent/prompt") {
        const content = await readFile(join(AGENT_ROOT, "ARCA_AGENT_SYSTEM_PROMPT_v0.2.0.md"), "utf8");
        sendText(response, 200, content, "text/markdown; charset=utf-8", "ARCA_AGENT_SYSTEM_PROMPT_v0.2.0.md");
        return;
      }
      if (method === "GET" && url.pathname === "/api/agent/schema") {
        const content = await readFile(join(AGENT_ROOT, "arca-agent-proposal-v1.schema.json"), "utf8");
        sendText(response, 200, content, "application/schema+json; charset=utf-8", "arca-agent-proposal-v1.schema.json");
        return;
      }

      if (method === "GET" && url.pathname === "/api/investigations") {
        const ids = await core.list();
        const investigations = await Promise.all(ids.map(async (id) => {
          const state = await core.get(id);
          const status = await core.status(id);
          return {
            id,
            question: state.objects.questions.find((item: any) => state.investigation.questionIds.includes(item.id))?.text ?? "",
            objective: state.investigation.objective,
            lifecycleStatus: state.investigation.lifecycleStatus,
            updatedAt: state.projection.updatedAt,
            sequence: state.projection.sequence,
            counts: status.counts
          };
        }));
        sendJson(response, 200, { investigations });
        return;
      }
      if (method === "POST" && url.pathname === "/api/investigations") {
        const body = await readJson(request);
        const state = await core.createInvestigation({
          id: body.id,
          question: body.question,
          objective: body.objective,
          scope: body.scope,
          limits: body.limits,
          simulation: Boolean(body.simulation),
          actor: actor(body)
        });
        sendJson(response, 201, state);
        return;
      }

      if (segments[0] === "api" && segments[1] === "investigations" && segments[2]) {
        const investigationId = segments[2];
        assertSafeId(investigationId, "INV");

        if (method === "GET" && segments.length === 3) {
          sendJson(response, 200, await core.get(investigationId));
          return;
        }
        if (method === "GET" && segments[3] === "status" && segments.length === 4) {
          sendJson(response, 200, await core.status(investigationId));
          return;
        }
        if (method === "GET" && segments[3] === "events" && segments.length === 4) {
          sendJson(response, 200, { events: await core.store.loadEvents(investigationId) });
          return;
        }
        if (method === "GET" && segments[3] === "validate" && segments.length === 4) {
          sendJson(response, 200, await core.validate(investigationId));
          return;
        }
        if (method === "GET" && segments[3] === "trace" && segments.length === 4) {
          const target = url.searchParams.get("target");
          if (!target) throw new HttpError(400, "TARGET_REQUIRED", "target é obrigatório");
          const direction = url.searchParams.get("direction") ?? "ancestors";
          if (!["ancestors", "descendants"].includes(direction)) throw new HttpError(400, "INVALID_DIRECTION", "direction inválida");
          sendJson(response, 200, await core.trace(investigationId, target, direction as "ancestors" | "descendants"));
          return;
        }
        if (method === "GET" && segments[3] === "export" && segments.length === 4) {
          const exported = await core.exportInvestigation(investigationId);
          sendText(response, 200, `${JSON.stringify(exported, null, 2)}\n`, "application/json; charset=utf-8", `${investigationId}.arca.json`);
          return;
        }
        if (method === "POST" && segments[3] === "objects" && segments.length === 4) {
          const body = await readJson(request);
          const object = await core.addObject({
            investigationId,
            type: body.type,
            id: body.id,
            data: body.data,
            actor: actor(body),
            expectedEventHead: expectedHead(body)
          });
          sendJson(response, 201, object);
          return;
        }
        if (method === "PATCH" && segments[3] === "objects" && segments[4] && segments.length === 5) {
          const body = await readJson(request);
          const objectId = segments[4];
          assertSafeId(objectId);
          const object = await core.updateObject({
            investigationId,
            id: objectId,
            patch: body.patch,
            actor: actor(body),
            expectedEventHead: expectedHead(body)
          });
          sendJson(response, 200, object);
          return;
        }
        if (method === "POST" && segments[3] === "relations" && segments.length === 4) {
          const body = await readJson(request);
          const relation = await core.relate({
            investigationId,
            id: body.id,
            from: body.from,
            to: body.to,
            relationType: body.relationType,
            category: body.category,
            effect: body.effect,
            justification: body.justification,
            materiality: body.materiality,
            extensions: body.extensions,
            actor: actor(body),
            expectedEventHead: expectedHead(body)
          });
          sendJson(response, 201, relation);
          return;
        }
        if (method === "POST" && segments[3] === "invalidate" && segments.length === 4) {
          const body = await readJson(request);
          sendJson(response, 200, await core.invalidate({
            investigationId,
            id: body.id,
            reason: body.reason,
            actor: actor(body),
            expectedEventHead: expectedHead(body)
          }));
          return;
        }
        if (method === "POST" && segments[3] === "reevaluate" && segments.length === 4) {
          const body = await readJson(request);
          sendJson(response, 200, await core.reevaluate({
            investigationId,
            id: body.id,
            justification: body.justification,
            actor: actor(body),
            expectedEventHead: expectedHead(body)
          }));
          return;
        }
        if (method === "POST" && segments[3] === "conclusions" && segments[4] && segments[5] === "close" && segments.length === 6) {
          const body = await readJson(request);
          sendJson(response, 200, await core.closeConclusion({
            investigationId,
            id: segments[4],
            limitJustification: body.limitJustification,
            actor: actor(body),
            expectedEventHead: expectedHead(body)
          }));
          return;
        }
        if (method === "POST" && segments[3] === "conclusions" && segments[4] && segments[5] === "reopen" && segments.length === 6) {
          const body = await readJson(request);
          sendJson(response, 200, await core.reopenConclusion({
            investigationId,
            id: segments[4],
            reason: body.reason,
            actor: actor(body),
            expectedEventHead: expectedHead(body)
          }));
          return;
        }
      }

      if (segments[0] === "api" && segments[1] === "agent" && segments[2] === "proposals") {
        if (method === "GET" && segments.length === 3) {
          const investigationId = url.searchParams.get("investigationId") ?? undefined;
          const statusFilter = url.searchParams.get("status") ?? undefined;
          sendJson(response, 200, { proposals: await proposals.list({ investigationId, status: statusFilter }) });
          return;
        }
        if (method === "POST" && segments.length === 3) {
          sendJson(response, 201, await proposals.create(await readJson(request)));
          return;
        }
        if (method === "GET" && segments[3] && segments.length === 4) {
          sendJson(response, 200, await proposals.get(segments[3]));
          return;
        }
        if (method === "POST" && segments[3] && segments[4] === "apply" && segments.length === 5) {
          const body = await readJson(request);
          sendJson(response, 200, await proposals.apply({
            proposalId: segments[3],
            reviewerId: body.reviewerId,
            confirmation: body.confirmation
          }));
          return;
        }
        if (method === "POST" && segments[3] && segments[4] === "reject" && segments.length === 5) {
          const body = await readJson(request);
          sendJson(response, 200, await proposals.reject({
            proposalId: segments[3],
            reviewerId: body.reviewerId,
            reason: body.reason
          }));
          return;
        }
      }

      if (segments[0] === "api" && segments[1] === "reviews") {
        if (method === "GET" && segments.length === 2) {
          const status = url.searchParams.get("status") ?? undefined;
          const kind = url.searchParams.get("kind") ?? undefined;
          const sourceSystem = url.searchParams.get("sourceSystem") ?? undefined;
          sendJson(response, 200, { reviews: await reviews.list({ status, kind, sourceSystem }) });
          return;
        }
        if (method === "POST" && segments.length === 2) {
          sendJson(response, 201, await reviews.submit(await readJson(request) as any));
          return;
        }
        if (method === "POST" && segments[2] === "import-machine-bridge" && segments.length === 3) {
          const result = await readJson(request);
          const created = await materializeMachineBridgeReviews(reviews, result);
          sendJson(response, 200, { created, count: created.length });
          return;
        }
        if (method === "GET" && segments[2] && segments.length === 3) {
          sendJson(response, 200, await reviews.get(segments[2]));
          return;
        }
        if (method === "POST" && segments[2] && segments[3] === "resolve" && segments.length === 4) {
          const body = await readJson(request);
          sendJson(response, 200, await reviews.resolve({
            reviewId: segments[2],
            reviewerId: body.reviewerId,
            decision: body.decision,
            reason: body.reason,
            expectedRecordHash: body.expectedRecordHash
          }));
          return;
        }
      }

      const staticEntry = STATIC_FILES[url.pathname];
      if ((method === "GET" || method === "HEAD") && staticEntry) {
        const path = join(PUBLIC_ROOT, staticEntry.file);
        const info = await stat(path);
        response.statusCode = 200;
        response.setHeader("Content-Type", staticEntry.type);
        response.setHeader("Cache-Control", staticEntry.file.endsWith(".html") ? "no-store" : "public, max-age=300");
        response.setHeader("Content-Length", info.size);
        if (method === "HEAD") response.end();
        else createReadStream(path).pipe(response);
        return;
      }

      throw new HttpError(404, "NOT_FOUND", "Rota não encontrada");
    } catch (error: any) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      sendJson(response, errorStatus(error), {
        error: {
          code: error instanceof HttpError ? error.code : "ARCA_ERROR",
          message: error?.message ?? "Erro interno"
        }
      });
    }
  });

  return {
    server,
    core,
    proposals,
    reviews,
    async start(): Promise<{ host: string; port: number; url: string }> {
      await core.init();
      await proposals.init();
      await reviews.init();
      await new Promise<void>((resolvePromise, reject) => {
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolvePromise();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      const displayHost = host.includes(":") ? `[${host}]` : host;
      return { host, port: actualPort, url: `http://${displayHost}:${actualPort}` };
    },
    async stop(): Promise<void> {
      if (!server.listening) return;
      await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
    }
  };
}