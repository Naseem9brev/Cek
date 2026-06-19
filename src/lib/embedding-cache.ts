const CACHE_KEY = "promptEmbeddingCache";
const MAX_ENTRIES = 48;

interface CacheEntry {
  vector: number[];
  at: number;
}

function hashPrompt(text: string): string {
  let h = 0;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    h = (Math.imul(31, h) + normalized.charCodeAt(i)) | 0;
  }
  return `${normalized.length}:${h}`;
}

export async function getCachedPromptEmbedding(
  prompt: string
): Promise<number[] | null> {
  const key = hashPrompt(prompt);
  const result = await chrome.storage.session.get(CACHE_KEY);
  const cache =
    (result[CACHE_KEY] as Record<string, CacheEntry> | undefined) ?? {};
  return cache[key]?.vector ?? null;
}

export async function cachePromptEmbedding(
  prompt: string,
  vector: number[]
): Promise<void> {
  const key = hashPrompt(prompt);
  const result = await chrome.storage.session.get(CACHE_KEY);
  const cache =
    (result[CACHE_KEY] as Record<string, CacheEntry> | undefined) ?? {};

  cache[key] = { vector, at: Date.now() };

  const entries = Object.entries(cache).sort((a, b) => b[1].at - a[1].at);
  const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));

  await chrome.storage.session.set({ [CACHE_KEY]: trimmed });
}
