import { CONTEXT_MATCH_THRESHOLD } from "./constants";
import type { KnowledgeNode } from "./messaging";

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

export function filterNodesByWorkspace(
  nodes: KnowledgeNode[],
  workspaceFilter?: string | null
): KnowledgeNode[] {
  if (workspaceFilter == null) return nodes;
  return nodes.filter(
    (node) =>
      node.workspace === workspaceFilter || node.workspace === undefined
  );
}

function scoreNodeKeyword(prompt: string, node: KnowledgeNode): number {
  const promptTokens = tokenize(prompt);
  if (promptTokens.length === 0) return 0;

  let score = 0;
  const topicLower = node.topic.toLowerCase();
  const entityLower = node.entities.map((e) => e.toLowerCase());
  const searchSet = new Set(node.searchTokens);

  for (const token of promptTokens) {
    if (searchSet.has(token)) score += 2;
    if (entityLower.some((e) => fuzzyIncludes(e, token) || fuzzyIncludes(token, e))) {
      score += 2;
    }
    if (fuzzyIncludes(topicLower, token)) score += 3;
  }

  return score;
}

export function scorePromptAgainstNodes(
  prompt: string,
  nodes: KnowledgeNode[],
  workspaceFilter?: string | null
): MatchResult | null {
  if (tokenize(prompt).length === 0) return null;

  let best: MatchResult | null = null;

  for (const node of filterNodesByWorkspace(nodes, workspaceFilter)) {
    const score = scoreNodeKeyword(prompt, node);
    if (score >= CONTEXT_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { node, score };
    }
  }

  return best;
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