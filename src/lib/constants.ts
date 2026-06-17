export type Platform = "claude" | "chatgpt" | "gemini";

export type ClaudeTier = "free" | "pro";
export type ChatGptTier = "free" | "plus";
export type GeminiTier = "free" | "advanced";

export type WindowType = "daily" | "3h" | "5h";

export interface TierLimit {
  label: string;
  limit: number;
  windowType: WindowType;
  windowMs: number;
}

export const TIER_LIMITS: Record<
  Platform,
  Record<string, TierLimit> | null
> = {
  chatgpt: {
    free: {
      label: "GPT-4o",
      limit: 10,
      windowType: "daily",
      windowMs: 24 * 60 * 60 * 1000,
    },
    plus: {
      label: "GPT-4o",
      limit: 80,
      windowType: "3h",
      windowMs: 3 * 60 * 60 * 1000,
    },
  },
  claude: {
    free: {
      label: "Sonnet",
      limit: 20,
      windowType: "daily",
      windowMs: 24 * 60 * 60 * 1000,
    },
    pro: {
      label: "Sonnet",
      limit: 45,
      windowType: "5h",
      windowMs: 5 * 60 * 60 * 1000,
    },
  },
  gemini: null,
};

export const CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "claude-sonnet": 200_000,
  "claude-opus": 200_000,
  default: 128_000,
};

export const GROQ = {
  baseUrl: "https://api.groq.com/openai/v1",
  embedModel: "nomic-embed-text-v1.5",
  chatModel: "llama-3.1-8b-instant",
} as const;

export const STORAGE_KEYS = {
  settings: "settings",
  prompts: "prompts",
  promptEmbeddings: "promptEmbeddings",
  sessions: "sessions",
  messageCounts: "messageCounts",
  contextUsage: "contextUsage",
  debugLog: "debugLog",
  knowledgeNodes: "knowledgeNodes",
} as const;

export const MAX_PROMPTS = 500;
export const MAX_KNOWLEDGE_NODES = 200;
export const SESSION_IDLE_MS = 600_000;
export const STREAM_SETTLE_MS = 1500;
export const STREAM_HARD_TIMEOUT_MS = 120_000;
export const SUMMARISE_TRANSCRIPT_MAX_CHARS = 6000;
export const CONTEXT_MATCH_THRESHOLD = 3;
export const DUPLICATE_LOOKBACK = 30;
export const DEFAULT_DUPLICATE_THRESHOLD = 0.92;
export const EXACT_DEDUPE_MS = 2000;
export const CONTEXT_THROTTLE_MS = 2000;

export const PLATFORM_LABELS: Record<Platform, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
};

export function getContextMax(modelLabel: string, platform: Platform): number {
  const lower = modelLabel.toLowerCase();
  if (lower.includes("sonnet") || lower.includes("opus")) {
    return CONTEXT_WINDOWS["claude-sonnet"];
  }
  if (lower.includes("4o")) {
    return CONTEXT_WINDOWS["gpt-4o"];
  }
  if (platform === "claude") return CONTEXT_WINDOWS["claude-sonnet"];
  return CONTEXT_WINDOWS.default;
}

export function getTierLimit(
  platform: Platform,
  tier: string
): TierLimit | null {
  const limits = TIER_LIMITS[platform];
  if (!limits) return null;
  return limits[tier] ?? null;
}
