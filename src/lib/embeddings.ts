export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function topKBySimilarity(
  query: number[],
  entries: Array<{ id: string; vector: number[] }>,
  k = 20
): Array<{ id: string; score: number }> {
  return entries
    .map(({ id, vector }) => ({ id, score: cosineSimilarity(query, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function findNearDuplicate(
  vector: number[],
  candidates: Array<{ id: string; vector: number[] }>,
  threshold: number
): { id: string; score: number } | null {
  let best: { id: string; score: number } | null = null;
  for (const c of candidates) {
    const score = cosineSimilarity(vector, c.vector);
    if (score >= threshold && (!best || score > best.score)) {
      best = { id: c.id, score };
    }
  }
  return best;
}
