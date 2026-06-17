import type { Platform } from "./constants";
import type { Turn } from "./messaging";

export interface SessionBufferEntry {
  tabId: number;
  sessionId: string;
  platform: Platform;
  tabUrl: string;
  turns: Turn[];
  pendingPrompts: Array<{
    turnIndex: number;
    prompt: string;
    timestamp: number;
  }>;
  lastActivity: number;
}

const BUFFER_KEY = "sessionBuffers";

async function getAllBuffers(): Promise<Record<string, SessionBufferEntry>> {
  const result = await chrome.storage.session.get(BUFFER_KEY);
  return (result[BUFFER_KEY] as Record<string, SessionBufferEntry>) ?? {};
}

async function saveAllBuffers(
  buffers: Record<string, SessionBufferEntry>
): Promise<void> {
  await chrome.storage.session.set({ [BUFFER_KEY]: buffers });
}

function bufferKey(tabId: number, sessionId: string): string {
  return `${tabId}:${sessionId}`;
}

export async function getSessionBuffer(
  tabId: number,
  sessionId: string
): Promise<SessionBufferEntry | null> {
  const buffers = await getAllBuffers();
  return buffers[bufferKey(tabId, sessionId)] ?? null;
}

export async function getBuffersForTab(
  tabId: number
): Promise<SessionBufferEntry[]> {
  const buffers = await getAllBuffers();
  return Object.values(buffers).filter((b) => b.tabId === tabId);
}

export async function appendTurn(
  tabId: number,
  sessionId: string,
  platform: Platform,
  tabUrl: string,
  turn: Turn
): Promise<SessionBufferEntry> {
  const buffers = await getAllBuffers();
  const key = bufferKey(tabId, sessionId);
  const existing = buffers[key];

  const entry: SessionBufferEntry = existing ?? {
    tabId,
    sessionId,
    platform,
    tabUrl,
    turns: [],
    pendingPrompts: [],
    lastActivity: Date.now(),
  };

  entry.platform = platform;
  entry.tabUrl = tabUrl;
  entry.lastActivity = Date.now();

  const idx = entry.turns.findIndex((t) => t.turnIndex === turn.turnIndex);
  if (idx >= 0) {
    entry.turns[idx] = turn;
  } else {
    entry.turns.push(turn);
    entry.turns.sort((a, b) => a.turnIndex - b.turnIndex);
  }

  buffers[key] = entry;
  await saveAllBuffers(buffers);
  return entry;
}

export async function recordPendingPrompt(
  tabId: number,
  sessionId: string,
  platform: Platform,
  tabUrl: string,
  prompt: string,
  turnIndex: number
): Promise<void> {
  const buffers = await getAllBuffers();
  const key = bufferKey(tabId, sessionId);
  const entry: SessionBufferEntry = buffers[key] ?? {
    tabId,
    sessionId,
    platform,
    tabUrl,
    turns: [],
    pendingPrompts: [],
    lastActivity: Date.now(),
  };

  entry.platform = platform;
  entry.tabUrl = tabUrl;
  entry.lastActivity = Date.now();

  const existingIdx = entry.pendingPrompts.findIndex(
    (p) => p.turnIndex === turnIndex
  );
  const pending = { turnIndex, prompt, timestamp: Date.now() };
  if (existingIdx >= 0) {
    entry.pendingPrompts[existingIdx] = pending;
  } else {
    entry.pendingPrompts.push(pending);
  }

  buffers[key] = entry;
  await saveAllBuffers(buffers);
}

export function mergeTurnsForSummarisation(
  entry: SessionBufferEntry
): Turn[] {
  const turns = [...entry.turns];
  for (const pending of entry.pendingPrompts) {
    if (turns.some((t) => t.turnIndex === pending.turnIndex)) continue;
    turns.push({
      turnIndex: pending.turnIndex,
      prompt: pending.prompt,
      response: "(response not captured)",
      timestamp: pending.timestamp,
      partial: true,
    });
  }
  return turns.sort((a, b) => a.turnIndex - b.turnIndex);
}

export async function clearSessionBuffer(
  tabId: number,
  sessionId: string
): Promise<void> {
  const buffers = await getAllBuffers();
  delete buffers[bufferKey(tabId, sessionId)];
  await saveAllBuffers(buffers);
}

export async function clearAllBuffersForTab(tabId: number): Promise<void> {
  const buffers = await getAllBuffers();
  for (const key of Object.keys(buffers)) {
    if (buffers[key]?.tabId === tabId) {
      delete buffers[key];
    }
  }
  await saveAllBuffers(buffers);
}
