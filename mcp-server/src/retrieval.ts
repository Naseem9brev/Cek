/**
 * MCP retrieval — mirrors extension src/lib/retrieval.ts (keep in sync).
 */
import type { KnowledgeNode } from "./types.js";

export const PREFILTER_TOP_K = 20;
export const CONTEXT_INJECT_TOP_K = 3;
export const CONTEXT_MATCH_THRESHOLD = 3;
export const SEMANTIC_MATCH_THRESHOLD = 0.72;
export const RECENCY_WINDOW_DAYS = 90;

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "under",
  "again", "further", "then", "once", "here", "there", "when", "where",
  "why", "how", "all", "each", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
  "very", "just", "and", "but", "if", "or", "because", "until", "while",
  "about", "this", "that", "these", "those", "i", "me", "my", "we", "our",
  "you", "your", "it", "its", "they", "them", "their", "what", "which",
]);

export interface MatchResult {
  node: KnowledgeNode;
  score: number;
  keywordScore: number;
  semanticScore: number;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export function nodeWorkspace(node: KnowledgeNode): string {
  return node.workspace ?? "General";
}

export function filterNodesByWorkspace(
  nodes: KnowledgeNode[],
  workspaceFilter?: string | null
): KnowledgeNode[] {
  if (workspaceFilter == null || workspaceFilter === "") return nodes;
  return nodes.filter((n) => nodeWorkspace(n) === workspaceFilter);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function fuzzyIncludes(haystack: string, needle: string): boolean {
  if (haystack.includes(needle)) return true;
  if (needle.length < 4) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let mismatches = 0;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) mismatches++;
      if (mismatches > 1) break;
    }
    if (mismatches <= 1) return true;
  }
  return false;
}

export function scoreNodeKeyword(prompt: string, node: KnowledgeNode): number {
  const promptTokens = tokenize(prompt);
  if (promptTokens.length === 0) return 0;

  let score = 0;
  const topicLower = node.topic.toLowerCase();
  const entityLower = node.entities.map((e) => e.toLowerCase());
  const searchSet = new Set(node.searchTokens ?? []);

  for (const token of promptTokens) {
    if (searchSet.has(token)) score += 2;
    if (
      entityLower.some(
        (e) => fuzzyIncludes(e, token) || fuzzyIncludes(token, e)
      )
    ) {
      score += 2;
    }
    if (fuzzyIncludes(topicLower, token)) score += 3;
  }

  return score;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export function recencyBoost(node: KnowledgeNode, now = Date.now()): number {
  const days = (now - node.date) / 86_400_000;
  if (days <= 0) return 2;
  if (days >= RECENCY_WINDOW_DAYS) return 0;
  return 2 * (1 - days / RECENCY_WINDOW_DAYS);
}

function classifyConfidence(
  keywordScore: number,
  semanticScore: number
): "high" | "medium" | "low" {
  if (
    semanticScore >= 0.85 ||
    keywordScore >= CONTEXT_MATCH_THRESHOLD + 3
  ) {
    return "high";
  }
  if (
    semanticScore >= SEMANTIC_MATCH_THRESHOLD ||
    keywordScore >= CONTEXT_MATCH_THRESHOLD
  ) {
    return "medium";
  }
  return "low";
}

function matchReason(keywordScore: number, semanticScore: number): string {
  const parts: string[] = [];
  if (keywordScore >= CONTEXT_MATCH_THRESHOLD) parts.push("keyword overlap");
  if (semanticScore >= SEMANTIC_MATCH_THRESHOLD) parts.push("semantic similarity");
  return parts.length ? parts.join(" + ") : "weak signal";
}

export function scorePromptHybridTopK(
  prompt: string,
  nodes: KnowledgeNode[],
  options?: {
    queryEmbedding?: number[];
    nodeEmbeddings?: Record<string, number[]>;
    workspaceFilter?: string | null;
    topK?: number;
    now?: number;
  }
): MatchResult[] {
  const topK = options?.topK ?? CONTEXT_INJECT_TOP_K;
  const now = options?.now ?? Date.now();
  const filtered = filterNodesByWorkspace(nodes, options?.workspaceFilter);
  if (!filtered.length) return [];

  const keywordRanked = filtered
    .map((node) => ({ node, kw: scoreNodeKeyword(prompt, node) }))
    .sort((a, b) => b.kw - a.kw || b.node.date - a.node.date);

  const prefilterIds = new Set<string>();
  const candidates: KnowledgeNode[] = [];

  for (const { node } of keywordRanked.slice(0, PREFILTER_TOP_K)) {
    prefilterIds.add(node.id);
    candidates.push(node);
  }

  if (candidates.length < PREFILTER_TOP_K) {
    for (const node of [...filtered].sort((a, b) => b.date - a.date)) {
      if (prefilterIds.has(node.id)) continue;
      candidates.push(node);
      prefilterIds.add(node.id);
      if (candidates.length >= PREFILTER_TOP_K) break;
    }
  }

  const results: MatchResult[] = [];
  for (const node of candidates) {
    const keywordScore = scoreNodeKeyword(prompt, node);
    let semanticScore = 0;
    if (options?.queryEmbedding?.length && options?.nodeEmbeddings?.[node.id]?.length) {
      semanticScore = cosineSimilarity(
        options.queryEmbedding,
        options.nodeEmbeddings[node.id]!
      );
    }
    const matches =
      semanticScore >= SEMANTIC_MATCH_THRESHOLD ||
      keywordScore >= CONTEXT_MATCH_THRESHOLD;
    if (!matches) continue;

    results.push({
      node,
      score: keywordScore + semanticScore * 10 + recencyBoost(node, now),
      keywordScore,
      semanticScore,
      confidence: classifyConfidence(keywordScore, semanticScore),
      reason: matchReason(keywordScore, semanticScore),
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function formatContextInjection(node: KnowledgeNode): string {
  const date = new Date(node.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const platform =
    node.platform.charAt(0).toUpperCase() + node.platform.slice(1);
  const lines = [
    `[Context from Cek — explored with ${platform} on ${date}]`,
    `Topic: ${node.topic}`,
  ];
  if (node.decisions.length) {
    lines.push(`Key decisions: ${node.decisions.join("; ")}`);
  }
  if (node.openQuestions.length) {
    lines.push(`Open questions: ${node.openQuestions.join("; ")}`);
  }
  lines.push("---");
  return lines.join("\n");
}

export function formatMergedContextInjection(nodes: KnowledgeNode[]): string {
  if (nodes.length === 0) return "";
  if (nodes.length === 1) return formatContextInjection(nodes[0]!);

  const lines = [
    `[Context from Cek — ${nodes.length} related sessions]`,
    "",
  ];
  const decisions = new Set<string>();
  const questions = new Set<string>();

  for (const node of nodes) {
    lines.push(
      `### ${node.topic} (${node.platform}, ${new Date(node.date).toLocaleDateString()})`
    );
    for (const d of node.decisions) decisions.add(d);
    for (const q of node.openQuestions) questions.add(q);
    lines.push("");
  }

  if (decisions.size) {
    lines.push("Key decisions (merged):");
    for (const d of decisions) lines.push(`- ${d}`);
    lines.push("");
  }
  if (questions.size) {
    lines.push("Open questions (merged):");
    for (const q of questions) lines.push(`- ${q}`);
    lines.push("");
  }

  lines.push("---");
  return lines.join("\n");
}
