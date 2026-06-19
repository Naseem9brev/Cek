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

function buildTranscript(turns: Turn[]): string {
  const lines: string[] = [];
  for (const t of turns) {
    lines.push(`User: ${t.prompt}`);
    lines.push(`Assistant: ${t.response}`);
  }
  return lines.join("\n\n").slice(0, SUMMARISE_TRANSCRIPT_MAX_CHARS);
}

export async function summariseSession(
  apiKey: string,
  turns: Turn[],
  platform: Platform
): Promise<SummariseResult> {
  const transcript = buildTranscript(turns);

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
        {
          role: "system",
          content: `Extract structured memory from an AI conversation on ${platform}. Return JSON only with keys: topic (string), entities (string[]), decisions (string[]), openQuestions (string[]). Be concise. entities = key nouns/concepts. decisions = conclusions or choices made. openQuestions = unresolved questions.`,
        },
        {
          role: "user",
          content: transcript,
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
