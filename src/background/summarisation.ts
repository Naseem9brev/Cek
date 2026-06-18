import { SESSION_IDLE_MS } from "../lib/constants";
import type { Platform } from "../lib/constants";
import { summariseSession, withRetry } from "../lib/groq";
import type { KnowledgeNode, TurnCapturedPayload } from "../lib/messaging";
import { addKnowledgeNode, getKnowledgeNodes } from "../lib/knowledge-nodes";
import {
  buildMcpExportPayload,
  downloadMcpExportInBackground,
  serializeMcpExport,
} from "../lib/mcp-export";
import { embedKnowledgeNode, getNodeEmbeddings, setNodeEmbedding } from "../lib/node-embeddings";
import {
  appendTurn,
  clearAllBuffersForTab,
  clearSessionBuffer,
  getBuffersForTab,
  mergeTurnsForSummarisation,
  recordPendingPrompt as bufferRecordPendingPrompt,
  type SessionBufferEntry,
} from "../lib/session-buffer";
import { appendDebugLog, generateId, getSettings } from "../lib/storage";
import { isVaultConnected, syncNodesToVault } from "../lib/vault-sync";

function idleAlarmName(tabId: number): string {
  return `idle-${tabId}`;
}

async function afterNodeCreated(
  node: KnowledgeNode,
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<void> {
  if (settings.groq.enabled && settings.groq.apiKey) {
    void withRetry(() => embedKnowledgeNode(settings.groq.apiKey, node))
      .then((vector) => setNodeEmbedding(node.id, vector))
      .catch((e) => appendDebugLog(`Node embed failed: ${e}`));
  }

  if (settings.obsidian.autoSync && settings.obsidian.vaultConnected) {
    void (async () => {
      try {
        if (!(await isVaultConnected())) return;
        const { written, errors } = await syncNodesToVault(
          [node],
          settings.obsidian.subfolder
        );
        if (errors.length) {
          await appendDebugLog(`Obsidian sync errors: ${errors.join("; ")}`);
        } else {
          await appendDebugLog(`Obsidian synced ${written} note(s)`);
        }
      } catch (e) {
        await appendDebugLog(`Obsidian sync failed: ${e}`);
      }
    })();
  }

}

export async function resetIdleAlarm(tabId: number): Promise<void> {
  await chrome.alarms.clear(idleAlarmName(tabId));
  chrome.alarms.create(idleAlarmName(tabId), {
    delayInMinutes: SESSION_IDLE_MS / 60_000,
  });
}

export async function handleTurnCaptured(
  payload: TurnCapturedPayload,
  tabId: number,
  tabUrl: string
): Promise<void> {
  await appendTurn(tabId, payload.sessionId, payload.platform, tabUrl, {
    turnIndex: payload.turnIndex,
    prompt: payload.prompt,
    response: payload.response,
    timestamp: Date.now(),
    partial: payload.partial,
  });
  await resetIdleAlarm(tabId);
  await appendDebugLog(
    `Turn captured tab=${tabId} idx=${payload.turnIndex} partial=${!!payload.partial}`
  );
}

export async function recordPendingPrompt(
  tabId: number,
  sessionId: string,
  platform: Platform,
  tabUrl: string,
  prompt: string,
  turnIndex: number
): Promise<void> {
  await bufferRecordPendingPrompt(
    tabId,
    sessionId,
    platform,
    tabUrl,
    prompt,
    turnIndex
  );
  await resetIdleAlarm(tabId);
}

async function summariseBuffer(entry: SessionBufferEntry): Promise<void> {
  const turns = mergeTurnsForSummarisation(entry);
  if (turns.length === 0) return;

  const settings = await getSettings();
  if (
    !settings.groq.enabled ||
    !settings.groq.apiKey ||
    !settings.groq.features.sessionSummarisation
  ) {
    return;
  }

  try {
    const result = await withRetry(() =>
      summariseSession(settings.groq.apiKey, turns, entry.platform)
    );

    const node = await addKnowledgeNode({
      id: generateId(),
      sessionId: entry.sessionId,
      topic: result.topic,
      entities: result.entities,
      decisions: result.decisions,
      openQuestions: result.openQuestions,
      platform: entry.platform,
      date: Date.now(),
      turnCount: turns.length,
      ...(settings.activeWorkspace != null
        ? { workspace: settings.activeWorkspace }
        : {}),
    });

    await appendDebugLog(
      `Summarised session ${entry.sessionId}: ${result.topic}`
    );

    void afterNodeCreated(node, settings);
  } catch (e) {
    await appendDebugLog(`Summarise failed: ${e}`);
  }
}

export async function triggerSummarisationForTab(tabId: number): Promise<void> {
  const buffers = await getBuffersForTab(tabId);
  await chrome.alarms.clear(idleAlarmName(tabId));

  for (const entry of buffers) {
    await summariseBuffer(entry);
    await clearSessionBuffer(tabId, entry.sessionId);
  }
}

export async function handleTabRemoved(tabId: number): Promise<void> {
  await triggerSummarisationForTab(tabId);
  await clearAllBuffersForTab(tabId);
}

export async function handleIdleAlarm(tabId: number): Promise<void> {
  await triggerSummarisationForTab(tabId);
}

const AI_HOSTS = ["claude.ai", "chatgpt.com"];

export function isAiChatUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return AI_HOSTS.some((h) => u.hostname.endsWith(h));
  } catch {
    return false;
  }
}

export async function handleTabNavigatedAway(
  tabId: number,
  url: string
): Promise<void> {
  if (!isAiChatUrl(url)) {
    await triggerSummarisationForTab(tabId);
  }
}

export function initSummarisationListeners(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void handleTabRemoved(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      void handleTabNavigatedAway(tabId, changeInfo.url);
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm.name.startsWith("idle-")) return;
    const tabId = parseInt(alarm.name.slice(5), 10);
    if (!Number.isNaN(tabId)) {
      void handleIdleAlarm(tabId);
    }
  });
}