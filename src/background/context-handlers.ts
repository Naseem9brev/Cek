import { STORAGE_KEYS } from "../lib/constants";
import type {
  BackgroundResponse,
  ContextMatchPayload,
  PendingContextMatch,
} from "../lib/messaging";
import { getKnowledgeNodeById, getKnowledgeNodes } from "../lib/knowledge-nodes";

async function getPendingMatches(): Promise<
  Record<number, PendingContextMatch>
> {
  const result = await chrome.storage.session.get(
    STORAGE_KEYS.pendingContextMatches
  );
  return (
    (result[STORAGE_KEYS.pendingContextMatches] as Record<
      number,
      PendingContextMatch
    >) ?? {}
  );
}

async function savePendingMatches(
  matches: Record<number, PendingContextMatch>
): Promise<void> {
  await chrome.storage.session.set({
    [STORAGE_KEYS.pendingContextMatches]: matches,
  });
}

export async function handleContextMatchFound(
  payload: ContextMatchPayload,
  tabId: number
): Promise<BackgroundResponse> {
  const node = await getKnowledgeNodeById(payload.nodeId);
  if (!node) return { ok: false, error: "Node not found" };

  const matches = await getPendingMatches();
  matches[tabId] = { tabId, node, score: payload.score };
  await savePendingMatches(matches);

  await chrome.action.setBadgeText({ text: "!", tabId });
  await chrome.action.setBadgeBackgroundColor({ color: "#2D6A2D", tabId });

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "SHOW_CONTEXT_TOAST",
      node,
    });
  } catch {
    // Content script may not be ready
  }

  return { ok: true };
}

export async function handleDismissContextMatch(
  tabId: number
): Promise<BackgroundResponse> {
  const matches = await getPendingMatches();
  if (matches[tabId]) {
    matches[tabId].dismissed = true;
    await savePendingMatches(matches);
  }
  await chrome.action.setBadgeText({ text: "", tabId });
  return { ok: true };
}

export async function handleInjectContext(
  tabId: number,
  nodeId: string
): Promise<BackgroundResponse> {
  const node = await getKnowledgeNodeById(nodeId);
  if (!node) return { ok: false, error: "Node not found" };

  await chrome.tabs.sendMessage(tabId, {
    type: "INJECT_CONTEXT_NOW",
    node,
  });

  await chrome.action.setBadgeText({ text: "", tabId });
  const matches = await getPendingMatches();
  delete matches[tabId];
  await savePendingMatches(matches);

  return { ok: true };
}

export async function getPendingMatchForTab(
  tabId: number
): Promise<PendingContextMatch | null> {
  const matches = await getPendingMatches();
  const match = matches[tabId];
  if (!match || match.dismissed) return null;
  return match;
}

export async function handleGetKnowledgeNodes(): Promise<BackgroundResponse> {
  const nodes = await getKnowledgeNodes();
  return { ok: true, nodes };
}

export function initContextHandlers(): void {
  // listeners registered via service-worker message router
}
