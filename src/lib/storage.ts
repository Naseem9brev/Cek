import {
  DEFAULT_DUPLICATE_THRESHOLD,
  MAX_PROMPTS,
  STORAGE_KEYS,
} from "./constants";
import type {
  ContextUsage,
  MessageCountEntry,
  PendingContextMatch,
  PromptEntry,
  SessionEntry,
  Settings,
} from "./messaging";
import type { Platform } from "./constants";

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 2,
  platforms: {
    claude: { enabled: true, tier: "pro" },
    chatgpt: { enabled: true, tier: "plus" },
    gemini: { enabled: false, tier: "free" },
  },
  groq: {
    apiKey: "",
    enabled: false,
    features: {
      semanticSearch: true,
      sessionTitles: true,
      nearDuplicateDetection: true,
      sessionSummarisation: false,
    },
    duplicateThreshold: DEFAULT_DUPLICATE_THRESHOLD,
    duplicateAction: "flag",
  },
  showOnPageBadge: false,
  debugMode: false,
  setupComplete: false,
};

function migrate(raw: Partial<Settings>): Settings {
  const base = { ...DEFAULT_SETTINGS, ...raw };
  if (!raw.groq) {
    base.groq = DEFAULT_SETTINGS.groq;
  } else {
    base.groq = {
      ...DEFAULT_SETTINGS.groq,
      ...raw.groq,
      features: {
        ...DEFAULT_SETTINGS.groq.features,
        ...raw.groq.features,
        sessionSummarisation:
          raw.groq.features?.sessionSummarisation ?? false,
      },
    };
  }
  base.schemaVersion = 3;
  return base;
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const raw = result[STORAGE_KEYS.settings] as Partial<Settings> | undefined;
  if (!raw) return DEFAULT_SETTINGS;
  return migrate(raw);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function getPrompts(): Promise<PromptEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.prompts);
  return (result[STORAGE_KEYS.prompts] as PromptEntry[]) ?? [];
}

export async function savePrompts(prompts: PromptEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.prompts]: prompts });
}

export async function getEmbeddings(): Promise<Record<string, number[]>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.promptEmbeddings);
  return (result[STORAGE_KEYS.promptEmbeddings] as Record<string, number[]>) ?? {};
}

export async function saveEmbeddings(
  embeddings: Record<string, number[]>
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.promptEmbeddings]: embeddings,
  });
}

export async function getSessions(): Promise<Record<string, SessionEntry>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.sessions);
  return (result[STORAGE_KEYS.sessions] as Record<string, SessionEntry>) ?? {};
}

export async function saveSessions(
  sessions: Record<string, SessionEntry>
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.sessions]: sessions });
}

export async function getMessageCounts(): Promise<
  Partial<Record<Platform, MessageCountEntry>>
> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.messageCounts);
  return (
    (result[STORAGE_KEYS.messageCounts] as Partial<
      Record<Platform, MessageCountEntry>
    >) ?? {}
  );
}

export async function saveMessageCounts(
  counts: Partial<Record<Platform, MessageCountEntry>>
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.messageCounts]: counts });
}

export async function getContextUsage(): Promise<ContextUsage | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.contextUsage);
  return (result[STORAGE_KEYS.contextUsage] as ContextUsage) ?? null;
}

export async function saveContextUsage(usage: ContextUsage): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.contextUsage]: usage });
}

export async function appendDebugLog(message: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.debugMode) return;
  const result = await chrome.storage.local.get(STORAGE_KEYS.debugLog);
  const log = (result[STORAGE_KEYS.debugLog] as string[]) ?? [];
  log.unshift(`${new Date().toISOString()} ${message}`);
  await chrome.storage.local.set({
    [STORAGE_KEYS.debugLog]: log.slice(0, 100),
  });
}

export function prunePrompts(
  prompts: PromptEntry[],
  embeddings: Record<string, number[]>,
  sessions: Record<string, SessionEntry>
): {
  prompts: PromptEntry[];
  embeddings: Record<string, number[]>;
  sessions: Record<string, SessionEntry>;
} {
  const pinned = prompts.filter((p) => p.pinned);
  const unpinned = prompts
    .filter((p) => !p.pinned)
    .sort((a, b) => b.timestamp - a.timestamp);

  const keepUnpinned = unpinned.slice(0, MAX_PROMPTS - pinned.length);
  const kept = [...pinned, ...keepUnpinned].sort(
    (a, b) => b.timestamp - a.timestamp
  );
  const keptIds = new Set(kept.map((p) => p.id));

  const nextEmbeddings: Record<string, number[]> = {};
  for (const id of keptIds) {
    if (embeddings[id]) nextEmbeddings[id] = embeddings[id];
  }

  const nextSessions: Record<string, SessionEntry> = {};
  for (const [id, session] of Object.entries(sessions)) {
    if (kept.some((p) => p.sessionId === id)) {
      nextSessions[id] = session;
    }
  }

  return {
    prompts: kept,
    embeddings: nextEmbeddings,
    sessions: nextSessions,
  };
}

export async function loadAppState() {
  const [settings, prompts, sessions, messageCounts, contextUsage, knowledgeNodes] =
    await Promise.all([
      getSettings(),
      getPrompts(),
      getSessions(),
      getMessageCounts(),
      getContextUsage(),
      import("./knowledge-nodes").then((m) => m.getKnowledgeNodes()),
    ]);

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTabId = tabs[0]?.id;
  let pendingContextMatch: PendingContextMatch | null = null;
  if (activeTabId !== undefined) {
    const sessionData = await chrome.storage.session.get(
      STORAGE_KEYS.pendingContextMatches
    );
    const matches =
      (sessionData[STORAGE_KEYS.pendingContextMatches] as Record<
        number,
        PendingContextMatch
      >) ?? {};
    const match = matches[activeTabId];
    if (match && !match.dismissed) pendingContextMatch = match;
  }

  return {
    settings,
    prompts,
    sessions,
    messageCounts,
    contextUsage,
    knowledgeNodes,
    pendingContextMatch,
  };
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function sessionIdFromUrl(url: string, platform: Platform): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (platform === "claude") {
      const chatIdx = parts.indexOf("chat");
      if (chatIdx >= 0 && parts[chatIdx + 1]) return parts[chatIdx + 1];
    }
    if (platform === "chatgpt") {
      const cIdx = parts.indexOf("c");
      if (cIdx >= 0 && parts[cIdx + 1]) return parts[cIdx + 1];
    }
    return u.pathname.replace(/\//g, "-") || "unknown";
  } catch {
    return "unknown";
  }
}

export function fallbackSessionTitle(sessionId: string, tabUrl: string): string {
  if (sessionId !== "unknown" && sessionId.length > 8) {
    return sessionId.slice(0, 8) + "…";
  }
  try {
    return new URL(tabUrl).pathname.slice(-24) || "Conversation";
  } catch {
    return "Conversation";
  }
}
