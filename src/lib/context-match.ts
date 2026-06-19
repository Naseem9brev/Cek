/** Re-exports retrieval core for backward compatibility. */
export {
  CONTEXT_INJECT_TOP_K,
  PREFILTER_TOP_K,
  filterNodesByWorkspace,
  formatContextInjection,
  formatMergedContextInjection,
  nodeWorkspace,
  recencyBoost,
  scoreNodeKeyword,
  scorePromptHybridTopK,
  type MatchResult,
} from "./retrieval";

import {
  scoreNodeKeyword,
  scorePromptHybridTopK,
  type MatchResult,
} from "./retrieval";
import { CONTEXT_MATCH_THRESHOLD } from "./constants";
import type { KnowledgeNode } from "./messaging";

export function scorePromptAgainstNodes(
  prompt: string,
  nodes: KnowledgeNode[],
  workspaceFilter?: string | null
): MatchResult | null {
  return scorePromptHybridTopK(prompt, nodes, {
    workspaceFilter,
    topK: 1,
  })[0] ?? null;
}

export function scorePromptHybrid(
  prompt: string,
  nodes: KnowledgeNode[],
  options?: {
    queryEmbedding?: number[];
    nodeEmbeddings?: Record<string, number[]>;
    workspaceFilter?: string | null;
  }
): MatchResult | null {
  return scorePromptHybridTopK(prompt, nodes, { ...options, topK: 1 })[0] ?? null;
}

/** @deprecated Use scorePromptHybridTopK */
export function scorePromptAgainstNodesSemantic(
  prompt: string,
  nodes: KnowledgeNode[],
  queryEmbedding: number[],
  nodeEmbeddings: Record<string, number[]>,
  workspaceFilter?: string | null
): MatchResult | null {
  void prompt;
  return scorePromptHybridTopK(
    prompt,
    nodes,
    { queryEmbedding, nodeEmbeddings, workspaceFilter, topK: 1 }
  )[0] ?? null;
}

export function scorePromptAgainstNodesLegacy(
  prompt: string,
  nodes: KnowledgeNode[],
  workspaceFilter?: string | null
): { node: KnowledgeNode; score: number } | null {
  const m = scorePromptAgainstNodes(prompt, nodes, workspaceFilter);
  if (!m || m.keywordScore < CONTEXT_MATCH_THRESHOLD) return null;
  return { node: m.node, score: m.score };
}
