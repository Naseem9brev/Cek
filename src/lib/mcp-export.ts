import type { KnowledgeNode } from "./messaging";

export const MCP_EXPORT_VERSION = 1;
/** Skip embeddings in export when serialized size exceeds this (bytes) */
const MAX_EMBEDDINGS_BYTES = 100_000;

export interface McpExportPayload {
  version: number;
  exportedAt: string;
  nodes: KnowledgeNode[];
  nodeEmbeddings?: Record<string, number[]>;
}

export function buildMcpExportPayload(
  nodes: KnowledgeNode[],
  nodeEmbeddings?: Record<string, number[]>
): McpExportPayload {
  const payload: McpExportPayload = {
    version: MCP_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    nodes,
  };

  if (nodeEmbeddings && Object.keys(nodeEmbeddings).length > 0) {
    const serialized = JSON.stringify(nodeEmbeddings);
    if (serialized.length <= MAX_EMBEDDINGS_BYTES) {
      payload.nodeEmbeddings = nodeEmbeddings;
    }
  }

  return payload;
}

export function serializeMcpExport(payload: McpExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** Download memory-export.json in a page context (settings, popup). */
export function downloadMcpExport(data: string): void {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "memory-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

/** Download from the service worker when auto-sync is enabled. */
export async function downloadMcpExportInBackground(data: string): Promise<void> {
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(
    data
  )}`;
  await chrome.downloads.download({
    url: dataUrl,
    filename: "memory-export.json",
    saveAs: false,
  });
}
