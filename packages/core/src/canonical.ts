import { createHash } from "node:crypto";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname } from "node:path";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function cleanJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("ARCA JSON rejeita números não finitos");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => item === undefined ? null : cleanJson(item));
  }
  if (typeof value === "object" && value !== null) {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      output[key] = cleanJson(item);
    }
    return output;
  }
  throw new TypeError(`Valor não serializável no protocolo ARCA: ${typeof value}`);
}

export function canonicalize(value: unknown): JsonValue {
  const clean = cleanJson(value);
  if (Array.isArray(clean)) return clean.map(canonicalize) as JsonValue[];
  if (clean && typeof clean === "object") {
    const sorted: Record<string, JsonValue> = {};
    for (const key of Object.keys(clean).sort()) {
      sorted[key] = canonicalize((clean as Record<string, JsonValue>)[key]);
    }
    return sorted;
  }
  return clean;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function prettyJson(value: unknown): string {
  return `${JSON.stringify(cleanJson(value), null, 2)}\n`;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export async function atomicWriteJson(path: string, value: unknown, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", mode);
  try {
    await handle.writeFile(prettyJson(value), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}
