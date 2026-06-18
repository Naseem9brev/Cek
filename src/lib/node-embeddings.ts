import { STORAGE_KEYS } from "./constants";
import { embedText } from "./groq";
import type { KnowledgeNode } from "./messaging";

export async function getNodeEmbeddings(): Promise<Record<string, number[]>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.nodeEmbeddings);
  return (result[STORAGE_KEYS.nodeEmbeddings] as Record<string, number[]>) ?? {};
}

export async function saveNodeEmbeddings(
  embeddings: Record<string, number[]>
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.nodeEmbeddings]: embeddings,
  });
}

export async function setNodeEmbedding(
  nodeId: string,
  vector: number[]
): Promise<void> {
  const embeddings = await getNodeEmbeddings();
  embeddings[nodeId] = vector;
  await saveNodeEmbeddings(embeddings);
}

export async function deleteNodeEmbedding(nodeId: string): Promise<void> {
  const embeddings = await getNodeEmbeddings();
  delete embeddings[nodeId];
  await saveNodeEmbeddings(embeddings);
}

export function buildNodeEmbedText(
  node: Pick<
    KnowledgeNode,
    "topic" | "entities" | "decisions" | "openQuestions"
  >
): string {
  return [node.topic, ...node.entities, ...node.decisions, ...node.openQuestions].join(
    " "
  );
}

export async function embedKnowledgeNode(
  apiKey: string,
  node: Pick<
    KnowledgeNode,
    "topic" | "entities" | "decisions" | "openQuestions"
  >
): Promise<number[]> {
  return embedText(apiKey, buildNodeEmbedText(node));
}
