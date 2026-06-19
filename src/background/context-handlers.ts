import { STORAGE_KEYS } from "../lib/constants";
import type {
  BackgroundResponse,
  ContextMatchPayload,
  PendingContextMatch,
} from "../lib/messaging";
import { formatMergedContextInjection } from "../lib/retrieval";
import {
  getKnowledgeNodeById,
  getKnowledgeNodes,
} from "../lib/knowledge-nodes";

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

async function resolveNodes(nodeIds: string[]) {
  const nodes = await getKnowledgeNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodeIds
    .map((id) => byId.get(id))
    .filter((n): n is NonNullable<typeof n> => !!n);
}

export async function handleContextMatchFound(
  payload: ContextMatchPayload,
  tabId: number
): Promise<BackgroundResponse> {
  const nodeIds =
    payload.nodeIds?.length > 0 ? payload.nodeIds : [payload.nodeId];
  const nodes = await resolveNodes(nodeIds);
  const primary = nodes[0] ?? (await getKnowledgeNodeById(payload.nodeId));
  if (!primary) return { ok: false, error: "Node not found" };

  const matches = await getPendingMatches();
  matches[tabId] = {
    tabId,
    node: primary,
    nodes: nodes.length ? nodes : [primary],
    score: payload.score,
    confidence: payload.confidence ?? "medium",
    reason: payload.reason ?? "keyword overlap",
  };
  await savePendingMatches(matches);

  await chrome.action.setBadgeText({ text: "!", tabId });
  await chrome.action.setBadgeBackgroundColor({ color: "#b85c38", tabId });

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "SHOW_CONTEXT_TOAST",
      node: primary,
      nodes: matches[tabId].nodes,
      confidence: payload.confidence,
      reason: payload.reason,
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
  const pending = await getPendingMatches();
  const match = pending[tabId];
  let nodes = match?.nodes ?? [];
  if (!nodes.length) {
    const one = await getKnowledgeNodeById(nodeId);
    if (one) nodes = [one];
  }

  if (!nodes.length) return { ok: false, error: "Node not found" };

  const block = formatMergedContextInjection(nodes);

  await chrome.tabs.sendMessage(tabId, {
    type: "INJECT_CONTEXT_NOW",
    node: nodes[0],
    nodes,
    text: block,
  });

  await chrome.action.setBadgeText({ text: "", tabId });
  delete pending[tabId];
  await savePendingMatches(pending);

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
