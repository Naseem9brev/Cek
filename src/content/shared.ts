import { CONTEXT_THROTTLE_MS, EXACT_DEDUPE_MS } from "../lib/constants";
import type { Platform } from "../lib/constants";
import type { ContextUpdatedPayload } from "../lib/messaging";
import { sendBackgroundMessage } from "../lib/messaging";
import { sessionIdFromUrl } from "../lib/storage";

export interface PlatformSelectors {
  composer: string[];
  sendButton: string[];
  messageBlocks: string[];
  modelLabel: string[];
}

let lastSubmit = { text: "", at: 0 };

export function extractSessionId(url: string, platform: Platform): string {
  return sessionIdFromUrl(url, platform);
}

export function queryFirst(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export function queryAll(selectors: string[]): Element[] {
  const seen = new Set<Element>();
  const result: Element[] = [];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (!seen.has(el)) {
        seen.add(el);
        result.push(el);
      }
    }
  }
  return result;
}

export function readComposerText(composer: Element): string {
  if (composer instanceof HTMLTextAreaElement) {
    return composer.value.trim();
  }
  if (composer instanceof HTMLInputElement) {
    return composer.value.trim();
  }
  return (composer as HTMLElement).innerText?.trim() ?? "";
}

export function scrapeCharCount(messageSelectors: string[]): number {
  const blocks = queryAll(messageSelectors);
  return blocks.reduce(
    (sum, el) => sum + (el.textContent?.length ?? 0),
    0
  );
}

export function readModelLabel(selectors: string[], fallback: string): string {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return fallback;
}

async function capturePrompt(
  platform: Platform,
  text: string,
  modelLabel: string,
  messageSelectors: string[]
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (
    lastSubmit.text === trimmed &&
    Date.now() - lastSubmit.at < EXACT_DEDUPE_MS
  ) {
    return;
  }
  lastSubmit = { text: trimmed, at: Date.now() };

  const sessionId = extractSessionId(location.href, platform);

  await sendBackgroundMessage({
    type: "PROMPT_CAPTURED",
    payload: {
      platform,
      text: trimmed,
      sessionId,
      tabUrl: location.href,
    },
  });

  void updateContext(platform, modelLabel, messageSelectors);
}

async function updateContext(
  platform: Platform,
  modelLabel: string,
  messageSelectors: string[]
): Promise<void> {
  const charCount = scrapeCharCount(messageSelectors);

  const payload: ContextUpdatedPayload = {
    platform,
    modelLabel,
    charCount,
  };

  await sendBackgroundMessage({ type: "CONTEXT_UPDATED", payload });
}

let contextTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleContextUpdate(
  platform: Platform,
  modelLabel: string,
  messageSelectors: string[]
): void {
  if (contextTimer) clearTimeout(contextTimer);
  contextTimer = setTimeout(() => {
    void updateContext(platform, modelLabel, messageSelectors);
  }, CONTEXT_THROTTLE_MS);
}

export function initCapture(
  platform: Platform,
  selectors: PlatformSelectors,
  defaultModel: string
): void {
  const tryCapture = () => {
    const composer = queryFirst(selectors.composer);
    if (!composer) return;
    const text = readComposerText(composer);
    const modelLabel = readModelLabel(selectors.modelLabel, defaultModel);
    void capturePrompt(platform, text, modelLabel, selectors.messageBlocks);
  };

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const composer = queryFirst(selectors.composer);
      if (!composer) return;
      const target = e.target as Node;
      if (!composer.contains(target) && composer !== target) return;
      setTimeout(tryCapture, 50);
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      const btn = queryFirst(selectors.sendButton);
      if (!btn) return;
      if (e.target === btn || btn.contains(e.target as Node)) {
        setTimeout(tryCapture, 50);
      }
    },
    true
  );

  const observer = new MutationObserver(() => {
    const modelLabel = readModelLabel(selectors.modelLabel, defaultModel);
    scheduleContextUpdate(platform, modelLabel, selectors.messageBlocks);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const modelLabel = readModelLabel(selectors.modelLabel, defaultModel);
  scheduleContextUpdate(platform, modelLabel, selectors.messageBlocks);
}

export function injectOnPageBadge(
  enabled: boolean,
  getLabel: () => string
): void {
  const ID = "cek-context-badge";
  const existing = document.getElementById(ID);
  if (!enabled) {
    existing?.remove();
    return;
  }

  let badge = existing as HTMLDivElement | null;
  if (!badge) {
    badge = document.createElement("div");
    badge.id = ID;
    badge.style.cssText = `
      position: fixed; bottom: 16px; right: 16px; z-index: 99999;
      background: #FAF3E0; color: #1A3A1A; border: 1px solid #E0D8C0;
      padding: 6px 12px; border-radius: 999px; font: 12px Inter, sans-serif;
      box-shadow: 0 1px 4px rgba(26,58,26,0.08); pointer-events: none;
    `;
    document.body.appendChild(badge);
  }
  badge.textContent = getLabel();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
});
