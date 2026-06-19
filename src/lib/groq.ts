import { GROQ, SUMMARISE_TRANSCRIPT_MAX_CHARS } from "./constants";
import type { Platform } from "../lib/constants";
import type { Turn } from "./messaging";

export async function embedText(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch(`${GROQ.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ.embedModel,
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq embed failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0]?.embedding ?? [];
}

export async function generateSessionTitle(
  apiKey: string,
  promptText: string
): Promise<string> {
  const res = await fetch(`${GROQ.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ.chatModel,
      temperature: 0.3,
      max_tokens: 20,
      messages: [
        {
          role: "system",
          content:
            "Return only a 4-7 word conversation title. No quotes, no punctuation at the end.",
        },
        {
          role: "user",
          content: `Title this conversation starter: ${promptText.slice(0, 200)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq title failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return (data.choices[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
}

export interface SummariseResult {
  topic: string;
  entities: string[];
  decisions: string[];
  openQuestions: string[];
}

function buildFullTranscript(turns: Turn[]): string {
  const lines: string[] = [];
  for (const t of turns) {
    lines.push(`User: ${t.prompt}`);
    lines.push(`Assistant: ${t.response}`);
  }
  return lines.join("\n\n");
}

function chunkTranscript(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const breakAt = text.lastIndexOf("\n\n", end);
      if (breakAt > start + maxChars * 0.5) end = breakAt;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

const EXTRACT_SYSTEM = (platform: Platform) =>
  `Extract structured memory from an AI conversation on ${platform}. Return JSON only with keys: topic (string), entities (string[]), decisions (string[]), openQuestions (string[]). Be concise. entities = key nouns/concepts. decisions = conclusions or choices made. openQuestions = unresolved questions.`;

async function extractMemoryJson(
  apiKey: string,
  content: string,
  platform: Platform,
  mergeHint?: string
): Promise<SummariseResult> {
  const res = await fetch(`${GROQ.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ.chatModel,
      temperature: 0.2,
      max_tokens: 512,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACT_SYSTEM(platform) },
        {
          role: "user",
          content: mergeHint
            ? `${mergeHint}\n\nTranscript:\n${content}`
            : content,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq summarise failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = data.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Partial<SummariseResult>;

  return {
    topic: String(parsed.topic ?? "Untitled session").slice(0, 120),
    entities: Array.isArray(parsed.entities) ? parsed.entities.map(String) : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(String) : [],
    openQuestions: Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions.map(String)
      : [],
  };
}

function mergeSummaries(parts: SummariseResult[]): SummariseResult {
  const uniq = (lists: string[][]) =>
    [...new Set(lists.flat().map((s) => s.trim()).filter(Boolean))];

  return {
    topic: parts[0]?.topic ?? "Untitled session",
    entities: uniq(parts.map((p) => p.entities)),
    decisions: uniq(parts.map((p) => p.decisions)),
    openQuestions: uniq(parts.map((p) => p.openQuestions)),
  };
}

export async function summariseSession(
  apiKey: string,
  turns: Turn[],
  platform: Platform
): Promise<SummariseResult> {
  const full = buildFullTranscript(turns);
  const chunks = chunkTranscript(full, SUMMARISE_TRANSCRIPT_MAX_CHARS);

  if (chunks.length === 1) {
    return extractMemoryJson(apiKey, chunks[0]!, platform);
  }

  const partials: SummariseResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const hint = `Part ${i + 1} of ${chunks.length} of a long conversation. Extract memory from this segment only.`;
    partials.push(await extractMemoryJson(apiKey, chunks[i]!, platform, hint));
  }

  const merged = mergeSummaries(partials);
  const consolidate = await extractMemoryJson(
    apiKey,
    JSON.stringify(merged, null, 2),
    platform,
    "Consolidate these partial extractions from one conversation into a single coherent memory object. Merge duplicates."
  );

  return consolidate;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError;
}
