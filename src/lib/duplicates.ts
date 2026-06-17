import { findNearDuplicate } from "./embeddings";
import type { PromptEntry } from "./messaging";

export function getDuplicateCandidates(
  prompts: PromptEntry[],
  embeddings: Record<string, number[]>,
  sessionId: string,
  lookback: number
): Array<{ id: string; vector: number[] }> {
  const sessionPrompts = prompts
    .filter((p) => p.sessionId === sessionId)
    .slice(-lookback);
  return sessionPrompts
    .filter((p) => embeddings[p.id])
    .map((p) => ({ id: p.id, vector: embeddings[p.id] }));
}

export function checkNearDuplicate(
  vector: number[],
  prompts: PromptEntry[],
  embeddings: Record<string, number[]>,
  sessionId: string,
  threshold: number,
  lookback: number
): { id: string; score: number } | null {
  const candidates = getDuplicateCandidates(
    prompts,
    embeddings,
    sessionId,
    lookback
  );
  return findNearDuplicate(vector, candidates, threshold);
}
