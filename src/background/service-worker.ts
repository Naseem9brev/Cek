import {
  DUPLICATE_LOOKBACK,
  getContextMax,
} from "../lib/constants";
import { checkNearDuplicate } from "../lib/duplicates";
import { buildObsidianBundle } from "../lib/obsidian-export";
import { syncNodesToVault } from "../lib/vault-sync";
import { embedText, generateSessionTitle, withRetry } from "../lib/groq";
import type {
  BackgroundMessage,
  BackgroundResponse,
  PromptCapturedPayload,
  PromptEntry,
} from "../lib/messaging";
import { topKBySimilarity } from "../lib/embeddings";
import {
  appendDebugLog,
  DEFAULT_SETTINGS,
  fallbackSessionTitle,
  generateId,
  getEmbeddings,
  getMessageCounts,
  getPrompts,
  getSessions,
  getSettings,
  loadAppState,
  prunePrompts,
  saveContextUsage,
  saveEmbeddings,
  saveMessageCounts,
  savePrompts,
  saveSessions,
} from "../lib/storage";
import { estimateTokens } from "../lib/tokens";
import {
  normalizeMessageCount,
  resetAllExpiredWindows,
} from "../lib/windows";
import type { ContextUpdatedPayload } from "../lib/messaging";
import type { Platform } from "../lib/constants";
import { getKnowledgeNodes } from "../lib/knowledge-nodes";
import {
  handleContextMatchFound,
  handleDismissContextMatch,
  handleGetKnowledgeNodes,
  handleInjectContext,
} from "./context-handlers";
import {
  handleTurnCaptured,
  initSummarisationListeners,
  recordPendingPrompt,
  resetIdleAlarm,
} from "./summarisation";

const lastExactPrompt = new Map<string, { text: string; at: number }>();

async function handlePromptCaptured(
  payload: PromptCapturedPayload,
  tabId: number
): Promise<BackgroundResponse> {
  const settings = await getSettings();
  if (!settings.platforms[payload.platform]?.enabled) {
    return { ok: true, skipped: true };
  }

  const text = payload.text.trim();
  if (!text) return { ok: true, skipped: true };

  const dedupeKey = `${tabId}:${payload.sessionId}`;
  const prev = lastExactPrompt.get(dedupeKey);
  if (
    prev &&
    prev.text === text &&
    Date.now() - prev.at < 2000
  ) {
    return { ok: true, skipped: true };
  }
  lastExactPrompt.set(dedupeKey, { text, at: Date.now() });

  let prompts = await getPrompts();
  let embeddings = await getEmbeddings();
  let sessions = await getSessions();
  let messageCounts = await getMessageCounts();

  messageCounts = resetAllExpiredWindows(settings, messageCounts);
  const normalized = normalizeMessageCount(
    payload.platform,
    settings,
    messageCounts[payload.platform]
  );
  normalized.count += 1;
  messageCounts[payload.platform] = normalized;

  const prompt: PromptEntry = {
    id: generateId(),
    platform: payload.platform,
    text,
    timestamp: Date.now(),
    sessionId: payload.sessionId,
    charCount: text.length,
    pinned: false,
    tabUrl: payload.tabUrl,
    embeddingPending: settings.groq.enabled,
  };

  let duplicateOf: string | undefined;
  let skipped = false;

  if (
    settings.groq.enabled &&
    settings.groq.apiKey &&
    settings.groq.features.nearDuplicateDetection
  ) {
    try {
      const vector = await withRetry(() =>
        embedText(settings.groq.apiKey, text)
      );
      embeddings[prompt.id] = vector;
      prompt.embeddingPending = false;

      const dup = checkNearDuplicate(
        vector,
        prompts,
        embeddings,
        payload.sessionId,
        settings.groq.duplicateThreshold,
        DUPLICATE_LOOKBACK
      );
      if (dup) {
        if (settings.groq.duplicateAction === "skip") {
          skipped = true;
          await saveMessageCounts(messageCounts);
          return { ok: true, skipped: true, duplicateOf: dup.id };
        }
        duplicateOf = dup.id;
        prompt.duplicateOf = dup.id;
      }
    } catch (e) {
      await appendDebugLog(`Near-dup embed failed: ${e}`);
    }
  }

  if (!skipped) {
    prompts.unshift(prompt);
    const pruned = prunePrompts(prompts, embeddings, sessions);
    prompts = pruned.prompts;
    embeddings = pruned.embeddings;
    sessions = pruned.sessions;
    await savePrompts(prompts);
    await saveEmbeddings(embeddings);
  }

  if (!sessions[payload.sessionId]) {
    sessions[payload.sessionId] = {
      title: fallbackSessionTitle(payload.sessionId, payload.tabUrl),
      platform: payload.platform,
      createdAt: Date.now(),
      firstPromptId: prompt.id,
      titlePending:
        settings.groq.enabled &&
        settings.groq.features.sessionTitles &&
        !!settings.groq.apiKey,
    };
    await saveSessions(sessions);

    if (
      settings.groq.enabled &&
      settings.groq.apiKey &&
      settings.groq.features.sessionTitles
    ) {
      void generateTitleAsync(
        payload.sessionId,
        text,
        settings.groq.apiKey
      );
    }
  } else if (
    settings.groq.enabled &&
    settings.groq.apiKey &&
    !settings.groq.features.nearDuplicateDetection
  ) {
    void embedOnlyAsync(prompt.id, text, settings.groq.apiKey);
  }

  await saveMessageCounts(messageCounts);
  void resetIdleAlarm(tabId);
  void recordPendingPrompt(
    tabId,
    payload.sessionId,
    payload.platform,
    payload.tabUrl,
    text,
    payload.turnIndex
  );
  return { ok: true, promptId: prompt.id, duplicateOf, skipped };
}

async function embedOnlyAsync(
  promptId: string,
  text: string,
  apiKey: string
): Promise<void> {
  try {
    const vector = await withRetry(() => embedText(apiKey, text));
    const embeddings = await getEmbeddings();
    embeddings[promptId] = vector;
    await saveEmbeddings(embeddings);
    const prompts = await getPrompts();
    const idx = prompts.findIndex((p: PromptEntry) => p.id === promptId);
    if (idx >= 0) {
      prompts[idx].embeddingPending = false;
      await savePrompts(prompts);
    }
  } catch (e) {
    await appendDebugLog(`Embed failed: ${e}`);
  }
}

async function generateTitleAsync(
  sessionId: string,
  text: string,
  apiKey: string
): Promise<void> {
  try {
    const title = await withRetry(() => generateSessionTitle(apiKey, text));
    const sessions = await getSessions();
    if (sessions[sessionId]) {
      sessions[sessionId].title = title || sessions[sessionId].title;
      sessions[sessionId].titlePending = false;
      await saveSessions(sessions);
    }
  } catch (e) {
    const sessions = await getSessions();
    if (sessions[sessionId]) {
      sessions[sessionId].titlePending = false;
      await saveSessions(sessions);
    }
    await appendDebugLog(`Title failed: ${e}`);
  }
}

async function handleContextUpdated(
  payload: ContextUpdatedPayload,
  tabId: number
): Promise<void> {
  const maxTokens = getContextMax(payload.modelLabel, payload.platform);
  await saveContextUsage({
    tabId,
    platform: payload.platform,
    modelLabel: payload.modelLabel,
    estimatedTokens: estimateTokens(payload.charCount),
    maxTokens,
    updatedAt: Date.now(),
  });
}

async function handleSemanticSearch(query: string): Promise<BackgroundResponse> {
  const settings = await getSettings();
  if (
    !settings.groq.enabled ||
    !settings.groq.apiKey ||
    !settings.groq.features.semanticSearch
  ) {
    return { ok: false, error: "Semantic search not enabled" };
  }

  try {
    const queryVector = await withRetry(() =>
      embedText(settings.groq.apiKey, query)
    );
    const embeddings = await getEmbeddings();
    const entries = Object.entries(embeddings).map(([id, vector]) => ({
      id,
      vector,
    }));
    const results = topKBySimilarity(queryVector, entries, 20).filter(
      (r: { id: string; score: number }) => r.score > 0.3
    );
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function handleUpdatePrompt(
  id: string,
  pinned?: boolean,
  deleted?: boolean
): Promise<BackgroundResponse> {
  let prompts = await getPrompts();
  let embeddings = await getEmbeddings();
  let sessions = await getSessions();

  if (deleted) {
    prompts = prompts.filter((p: PromptEntry) => p.id !== id);
    delete embeddings[id];
  } else if (pinned !== undefined) {
    const idx = prompts.findIndex((p: PromptEntry) => p.id === id);
    if (idx >= 0) prompts[idx].pinned = pinned;
  }

  const pruned = prunePrompts(prompts, embeddings, sessions);
  await savePrompts(pruned.prompts);
  await saveEmbeddings(pruned.embeddings);
  await saveSessions(pruned.sessions);
  return { ok: true };
}

async function handleExportPinned(): Promise<BackgroundResponse> {
  const prompts = await getPrompts();
  const pinned = prompts.filter((p: PromptEntry) => p.pinned);
  return {
    ok: true,
    data: JSON.stringify(pinned, null, 2),
  };
}

async function handleExportKnowledgeNodes(): Promise<BackgroundResponse> {
  const nodes = await getKnowledgeNodes();
  return { ok: true, data: JSON.stringify(nodes, null, 2) };
}

async function handleExportObsidianZip(): Promise<BackgroundResponse> {
  const nodes = await getKnowledgeNodes();
  if (nodes.length === 0) {
    return { ok: false, error: "No knowledge nodes to export" };
  }
  return { ok: true, data: buildObsidianBundle(nodes) };
}

async function handleSyncObsidianVault(): Promise<BackgroundResponse> {
  const settings = await getSettings();
  if (!settings.obsidian.vaultConnected) {
    return { ok: false, error: "Vault not connected" };
  }
  const nodes = await getKnowledgeNodes();
  const { written, errors } = await syncNodesToVault(
    nodes,
    settings.obsidian.subfolder
  );
  if (errors.length > 0) {
    return { ok: false, error: errors.join("; ") };
  }
  return { ok: true, data: JSON.stringify({ written }) };
}

async function resolveTargetTabId(
  senderTabId: number,
  messageTabId?: number
): Promise<number> {
  if (senderTabId >= 0) return senderTabId;
  if (messageTabId !== undefined && messageTabId >= 0) return messageTabId;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? -1;
}

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundMessage,
    sender,
    sendResponse: (r: BackgroundResponse) => void
  ) => {
    const tabId = sender.tab?.id ?? -1;
    void (async () => {
      try {
        switch (message.type) {
          case "PROMPT_CAPTURED":
            sendResponse(await handlePromptCaptured(message.payload, tabId));
            break;
          case "TURN_CAPTURED":
            await handleTurnCaptured(
              message.payload,
              tabId,
              sender.tab?.url ?? ""
            );
            sendResponse({ ok: true });
            break;
          case "CONTEXT_UPDATED":
            await handleContextUpdated(message.payload, tabId);
            sendResponse({ ok: true });
            break;
          case "SEMANTIC_SEARCH":
            sendResponse(await handleSemanticSearch(message.query));
            break;
          case "GET_STATE":
            sendResponse({ ok: true, state: await loadAppState() });
            break;
          case "GET_KNOWLEDGE_NODES":
            sendResponse(await handleGetKnowledgeNodes());
            break;
          case "CONTEXT_MATCH_FOUND":
            sendResponse(
              await handleContextMatchFound(message.payload, tabId)
            );
            break;
          case "DISMISS_CONTEXT_MATCH":
            sendResponse(
              await handleDismissContextMatch(
                await resolveTargetTabId(tabId, message.tabId)
              )
            );
            break;
          case "INJECT_CONTEXT":
            sendResponse(
              await handleInjectContext(
                await resolveTargetTabId(tabId, message.tabId),
                message.nodeId
              )
            );
            break;
          case "UPDATE_PROMPT":
            sendResponse(
              await handleUpdatePrompt(
                message.id,
                message.pinned,
                message.deleted
              )
            );
            break;
          case "EXPORT_PINNED":
            sendResponse(await handleExportPinned());
            break;
          case "EXPORT_KNOWLEDGE_NODES":
            sendResponse(await handleExportKnowledgeNodes());
            break;
          case "EXPORT_OBSIDIAN_ZIP":
            sendResponse(await handleExportObsidianZip());
            break;
          case "SYNC_OBSIDIAN_VAULT":
            sendResponse(await handleSyncObsidianVault());
            break;
          default:
            sendResponse({ ok: false, error: "Unknown message" });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
);

chrome.alarms.create("reset-windows", { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "reset-windows") return;
  const settings = await getSettings();
  const counts = await chrome.storage.local
    .get("messageCounts")
    .then((r) => r.messageCounts as Partial<Record<Platform, unknown>>);
  const reset = resetAllExpiredWindows(
    settings,
    counts as Parameters<typeof resetAllExpiredWindows>[1]
  );
  await saveMessageCounts(reset);
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("settings");
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

initSummarisationListeners();