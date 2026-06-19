import type { KnowledgeNode } from "./messaging";

export const MCP_EXPORT_VERSION = 1;

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
  return {
    version: MCP_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    nodes,
    nodeEmbeddings,
  };
}

/** Sidecar path sibling to main export file */
export function mcpEmbeddingsSidecarPath(mainPath: string): string {
  return mainPath.replace(/\.json$/i, "") + ".embeddings.json";
}

export function serializeMcpExportBundle(
  payload: McpExportPayload,
  nodeEmbeddings?: Record<string, number[]>
): { main: string; sidecar?: string } {
  const { nodeEmbeddings: _omit, ...mainPayload } = payload;
  void _omit;
  const main = JSON.stringify(
    { ...mainPayload, hasEmbeddingsSidecar: !!nodeEmbeddings?.length },
    null,
    2
  );
  if (!nodeEmbeddings || !Object.keys(nodeEmbeddings).length) {
    return { main };
  }
  return {
    main,
    sidecar: JSON.stringify(
      {
        version: MCP_EXPORT_VERSION,
        exportedAt: payload.exportedAt,
        nodeEmbeddings,
      },
      null,
      2
    ),
  };
}

export function serializeMcpExport(payload: McpExportPayload): string {
  const bundle = serializeMcpExportBundle(payload, payload.nodeEmbeddings);
  return bundle.main;
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

export function downloadMcpExportBundle(bundle: {
  main: string;
  sidecar?: string | null;
}): void {
  downloadMcpExport(bundle.main);
  if (bundle.sidecar) {
    const blob = new Blob([bundle.sidecar], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "memory-export.embeddings.json";
    a.click();
    URL.revokeObjectURL(url);
  }
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
