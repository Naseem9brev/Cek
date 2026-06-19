import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

export function loadMemoryExport(path?: string): McpExportPayload {
  const filePath = path ?? resolveMemoryPath();
  if (!existsSync(filePath)) {
    return { version: 1, exportedAt: "", nodes: [] };
  }
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as McpExportPayload | KnowledgeNode[];
  if (Array.isArray(parsed)) {
    return { version: 1, exportedAt: "", nodes: parsed };
  }
  return {
    version: parsed.version ?? 1,
    exportedAt: parsed.exportedAt ?? "",
    nodes: parsed.nodes ?? [],
    nodeEmbeddings: parsed.nodeEmbeddings,
  };
}

export function getNodes(path?: string): KnowledgeNode[] {
  return loadMemoryExport(path).nodes;
}
