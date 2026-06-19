import { MAX_KNOWLEDGE_NODES, STORAGE_KEYS } from "./constants";
import type { KnowledgeNode } from "./messaging";

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "under", "again", "further", "then", "once", "here",
  "there", "when", "where", "why", "how", "all", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "and", "but", "if", "or",
  "because", "until", "while", "about", "against", "this", "that",
  "these", "those", "i", "me", "my", "we", "our", "you", "your", "it",
  "its", "they", "them", "their", "what", "which", "who", "whom",
]);

export function buildSearchTokens(node: Omit<KnowledgeNode, "searchTokens">): string[] {
  const raw = [
    node.topic,
    ...node.entities,
    ...node.decisions,
    ...node.openQuestions,
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  return [...new Set(raw)];
}

export async function getKnowledgeNodes(): Promise<KnowledgeNode[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.knowledgeNodes);
  return (result[STORAGE_KEYS.knowledgeNodes] as KnowledgeNode[]) ?? [];
}

export async function saveKnowledgeNodes(nodes: KnowledgeNode[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.knowledgeNodes]: nodes });
}

export async function addKnowledgeNode(
  node: Omit<KnowledgeNode, "searchTokens">
): Promise<KnowledgeNode> {
  const full: KnowledgeNode = {
    ...node,
    searchTokens: buildSearchTokens(node),
  };
  let nodes = await getKnowledgeNodes();
  nodes.unshift(full);
  if (nodes.length > MAX_KNOWLEDGE_NODES) {
    nodes = nodes
      .sort((a, b) => b.date - a.date)
      .slice(0, MAX_KNOWLEDGE_NODES);
  }
  await saveKnowledgeNodes(nodes);
  return full;
}

export async function getKnowledgeNodeById(id: string): Promise<KnowledgeNode | null> {
  const nodes = await getKnowledgeNodes();
  return nodes.find((n) => n.id === id) ?? null;
}
