import { readFileSync, existsSync, watch } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { KnowledgeNode, McpExportPayload } from "./types.js";

function defaultMemoryPath(): string {
  return join(homedir(), ".cek", "memory-export.json");
}

export function resolveMemoryPath(): string {
  const envPath = process.env.CEK_MEMORY_PATH;
  if (envPath) {
    if (envPath.startsWith("~/")) {
      return join(homedir(), envPath.slice(2));
    }
    return envPath;
  }
  return defaultMemoryPath();
}

function embeddingsSidecarPath(mainPath: string): string {
  return mainPath.replace(/\.json$/i, "") + ".embeddings.json";
}

function loadEmbeddingsSidecar(mainPath: string): Record<string, number[]> | undefined {
  const sidecar = embeddingsSidecarPath(mainPath);
  if (!existsSync(sidecar)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(sidecar, "utf8")) as {
      nodeEmbeddings?: Record<string, number[]>;
    };
    return parsed.nodeEmbeddings;
  } catch {
    return undefined;
  }
}

export function loadMemoryExport(path?: string): McpExportPayload {
  const filePath = path ?? resolveMemoryPath();
  if (!existsSync(filePath)) {
    return { version: 1, exportedAt: "", nodes: [] };
  }
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as McpExportPayload | KnowledgeNode[];
  let payload: McpExportPayload;
  if (Array.isArray(parsed)) {
    payload = { version: 1, exportedAt: "", nodes: parsed };
  } else {
    payload = {
      version: parsed.version ?? 1,
      exportedAt: parsed.exportedAt ?? "",
      nodes: parsed.nodes ?? [],
      nodeEmbeddings: parsed.nodeEmbeddings,
    };
  }

  if (!payload.nodeEmbeddings) {
    payload.nodeEmbeddings = loadEmbeddingsSidecar(filePath);
  }

  return payload;
}

let cached: McpExportPayload = loadMemoryExport();
let watcherStarted = false;

export function getCachedExport(): McpExportPayload {
  return cached;
}

export function reloadMemoryExport(path?: string): McpExportPayload {
  cached = loadMemoryExport(path);
  return cached;
}

export function startMemoryWatcher(path?: string): void {
  if (watcherStarted) return;
  watcherStarted = true;
  const filePath = path ?? resolveMemoryPath();

  const watchTarget = existsSync(filePath) ? filePath : dirname(filePath);
  try {
    watch(watchTarget, { persistent: false }, () => {
      cached = loadMemoryExport(filePath);
    });
  } catch {
    // watcher optional
  }
}

export function getNodes(path?: string): KnowledgeNode[] {
  if (path) return loadMemoryExport(path).nodes;
  return cached.nodes;
}

export function getNodeEmbeddings(path?: string): Record<string, number[]> {
  if (path) return loadMemoryExport(path).nodeEmbeddings ?? {};
  return cached.nodeEmbeddings ?? {};
}
