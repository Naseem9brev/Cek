import type { KnowledgeNode } from "./types.js";
import {
  formatContextInjection,
  formatMergedContextInjection,
  scorePromptHybridTopK,
  type MatchResult,
} from "./retrieval.js";

export type SearchMatch = MatchResult;

export function searchMemory(
  query: string,
  nodes: KnowledgeNode[],
  options?: {
    workspace?: string;
    nodeEmbeddings?: Record<string, number[]>;
    queryEmbedding?: number[];
    topK?: number;
  }
): SearchMatch[] {
  return scorePromptHybridTopK(query, nodes, {
    workspaceFilter: options?.workspace ?? null,
    nodeEmbeddings: options?.nodeEmbeddings,
    queryEmbedding: options?.queryEmbedding,
    topK: options?.topK ?? 10,
  });
}

export { formatContextInjection, formatMergedContextInjection };

export interface NodeSummary {
  id: string;
  topic: string;
  platform: string;
  date: number;
  workspace?: string;
  entityCount: number;
  decisionCount: number;
}

export function summarizeNode(node: KnowledgeNode): NodeSummary {
  return {
    id: node.id,
    topic: node.topic,
    platform: node.platform,
    date: node.date,
    workspace: node.workspace,
    entityCount: node.entities.length,
    decisionCount: node.decisions.length,
  };
}
