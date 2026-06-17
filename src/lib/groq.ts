import { GROQ } from "./constants";

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
