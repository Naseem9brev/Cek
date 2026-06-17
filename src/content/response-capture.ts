import {
  STREAM_HARD_TIMEOUT_MS,
  STREAM_SETTLE_MS,
} from "../lib/constants";
import type { Platform } from "../lib/constants";
import type { TurnCapturedPayload } from "../lib/messaging";
import { sendBackgroundMessage } from "../lib/messaging";
import {
  extractSessionId,
  queryAll,
  queryFirst,
  type PlatformSelectors,
} from "./shared";

interface PendingTurn {
  turnIndex: number;
  prompt: string;
  startedAt: number;
}

let pendingTurn: PendingTurn | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let hardTimeout: ReturnType<typeof setTimeout> | null = null;
let responseObserver: MutationObserver | null = null;

function isStreaming(selectors: PlatformSelectors): boolean {
  for (const sel of selectors.streamingIndicator) {
    if (document.querySelector(sel)) return true;
  }
  return false;
}

function getConversationRoot(selectors: PlatformSelectors): Element {
  return queryFirst(selectors.conversationRoot) ?? document.body;
}

function getAssistantBlocks(selectors: PlatformSelectors): Element[] {
  return queryAll(selectors.assistantBlocks);
}

function extractAssistantText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'button, [data-testid="stop-button"], .thinking, [class*="thinking"]'
    )
    .forEach((n) => n.remove());
  return clone.textContent?.trim() ?? "";
}

function getLatestAssistantText(selectors: PlatformSelectors): string {
  const blocks = getAssistantBlocks(selectors);
  if (!blocks.length) return "";
  return extractAssistantText(blocks[blocks.length - 1]!);
}

function clearTimers(): void {
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  if (hardTimeout) {
    clearTimeout(hardTimeout);
    hardTimeout = null;
  }
}

function stopObserver(): void {
  responseObserver?.disconnect();
  responseObserver = null;
}

async function finalizeTurn(
  platform: Platform,
  selectors: PlatformSelectors,
  partial = false
): Promise<void> {
  if (!pendingTurn) return;

  const response = getLatestAssistantText(selectors);
  if (!response && !partial) return;

  const payload: TurnCapturedPayload = {
    platform,
    sessionId: extractSessionId(location.href, platform),
    turnIndex: pendingTurn.turnIndex,
    prompt: pendingTurn.prompt,
    response: response || "(partial capture)",
    partial,
  };

  await sendBackgroundMessage({ type: "TURN_CAPTURED", payload });

  clearTimers();
  stopObserver();
  pendingTurn = null;
}

function scheduleSettle(platform: Platform, selectors: PlatformSelectors): void {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    if (!pendingTurn) return;
    if (isStreaming(selectors)) {
      scheduleSettle(platform, selectors);
      return;
    }
    void finalizeTurn(platform, selectors, false);
  }, STREAM_SETTLE_MS);
}

function startWatching(
  platform: Platform,
  selectors: PlatformSelectors
): void {
  stopObserver();
  clearTimers();

  const root = getConversationRoot(selectors);
  responseObserver = new MutationObserver(() => {
    if (!pendingTurn) return;
    scheduleSettle(platform, selectors);
  });

  responseObserver.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  hardTimeout = setTimeout(() => {
    void finalizeTurn(platform, selectors, true);
  }, STREAM_HARD_TIMEOUT_MS);

  scheduleSettle(platform, selectors);
}

export function watchResponse(
  platform: Platform,
  selectors: PlatformSelectors,
  promptText: string,
  userMessageCount: number
): void {
  pendingTurn = {
    turnIndex: userMessageCount - 1,
    prompt: promptText,
    startedAt: Date.now(),
  };
  startWatching(platform, selectors);
}

export function initPartialCapture(
  platform: Platform,
  selectors: PlatformSelectors
): void {
  window.addEventListener("pagehide", () => {
    if (pendingTurn) {
      void finalizeTurn(platform, selectors, true);
    }
  });
}
