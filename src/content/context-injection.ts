import type { Platform } from "../lib/constants";
import type { KnowledgeNode } from "../lib/messaging";
import { sendBackgroundMessage } from "../lib/messaging";
import { formatContextInjection } from "../lib/context-match";
import {
  queryAll,
  queryFirst,
  readComposerText,
  type PlatformSelectors,
} from "./shared";

const TOAST_ID = "cek-context-toast";

function contextMatchKey(): string {
  return `contextMatchChecked:${location.pathname}`;
}

async function hasCheckedContextMatch(): Promise<boolean> {
  const key = contextMatchKey();
  const result = await chrome.storage.session.get(key);
  return !!(result[key] as boolean | undefined);
}

async function markContextMatchChecked(): Promise<void> {
  const key = contextMatchKey();
  await chrome.storage.session.set({ [key]: true });
}

export async function checkContextMatch(
  prompt: string,
  platform: Platform,
  messageSelectors: string[]
): Promise<void> {
  if (!isFreshChat(messageSelectors)) return;
  if (await hasCheckedContextMatch()) return;

  const res = await sendBackgroundMessage({
    type: "SCORE_CONTEXT_MATCH",
    prompt,
  });
  if (!res.ok || !("match" in res) || !res.match) return;

  const match = res.match;
  await markContextMatchChecked();

  await sendBackgroundMessage({
    type: "CONTEXT_MATCH_FOUND",
    payload: {
      tabId: 0,
      nodeId: match.node.id,
      score: match.score,
    },
  });
}

function isFreshChat(messageSelectors: string[]): boolean {
  const url = location.href.toLowerCase();
  if (url.includes("/new") || url.endsWith("/chat") || url.endsWith("/")) {
    const blocks = queryAll(messageSelectors);
    return blocks.length <= 1;
  }
  const blocks = queryAll(messageSelectors);
  return blocks.length <= 1;
}

export function showContextToast(node: KnowledgeNode, onInject: () => void): void {
  let toast = document.getElementById(TOAST_ID) as HTMLDivElement | null;
  if (toast) toast.remove();

  toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.style.cssText = `
    position: fixed; bottom: 56px; right: 16px; z-index: 99999;
    background: #FAF3E0; color: #1A3A1A; border: 1px solid #E0D8C0;
    padding: 12px 14px; border-radius: 12px; max-width: 320px;
    font: 13px Inter, sans-serif;
    box-shadow: 0 2px 8px rgba(26,58,26,0.12);
  `;

  const platform =
    node.platform.charAt(0).toUpperCase() + node.platform.slice(1);
  const date = new Date(node.date).toLocaleDateString(undefined, {
    weekday: "short",
  });

  toast.innerHTML = `
    <p style="margin:0 0 8px;line-height:1.4">
      You explored <strong>${escapeHtml(node.topic)}</strong> with ${platform} on ${date}.
    </p>
    <div style="display:flex;gap:8px">
      <button id="cek-inject-btn" style="flex:1;padding:6px 10px;border:none;border-radius:999px;background:linear-gradient(180deg,#d4896a,#b85c38);color:#fff;font:inherit;cursor:pointer;box-shadow:0 2px 8px rgba(184,92,56,0.28)">Inject context</button>
      <button id="cek-dismiss-btn" style="padding:6px 10px;border:1px solid #E0D8C0;border-radius:999px;background:#fff;color:#1A3A1A;font:inherit;cursor:pointer">Dismiss</button>
    </div>
  `;

  document.body.appendChild(toast);

  toast.querySelector("#cek-inject-btn")?.addEventListener("click", () => {
    onInject();
    toast?.remove();
  });
  toast.querySelector("#cek-dismiss-btn")?.addEventListener("click", () => {
    void sendBackgroundMessage({ type: "DISMISS_CONTEXT_MATCH", tabId: 0 });
    toast?.remove();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function injectContextIntoComposer(
  node: KnowledgeNode,
  selectors: PlatformSelectors
): void {
  const composer = queryFirst(selectors.composer);
  if (!composer) return;

  const prefix = formatContextInjection(node);
  const existing = readComposerText(composer);
  const text = existing ? `${prefix}\n${existing}` : prefix;

  if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
    composer.value = text;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    (composer as HTMLElement).innerText = text;
    composer.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
}

export function initContextInjectionListener(
  selectors: PlatformSelectors
): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SHOW_CONTEXT_TOAST" && message.node) {
      showContextToast(message.node as KnowledgeNode, () => {
        injectContextIntoComposer(message.node as KnowledgeNode, selectors);
      });
    }
    if (message?.type === "INJECT_CONTEXT_NOW" && message.node) {
      injectContextIntoComposer(message.node as KnowledgeNode, selectors);
    }
  });
}