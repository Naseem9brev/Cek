import type { Platform } from "../lib/constants";
import { PLATFORM_LABELS } from "../lib/constants";
import type {
  AppState,
  PromptEntry,
  SessionEntry,
} from "../lib/messaging";
import { sendBackgroundMessage } from "../lib/messaging";
import {
  contextBarColor,
  formatTokenCount,
  formatTokenReadout,
} from "../lib/tokens";
import { fallbackSessionTitle } from "../lib/storage";
import { remainingMessages } from "../lib/windows";

let state: AppState | null = null;
let filterPlatform: Platform | "all" = "all";
let searchQuery = "";
let semanticMode = false;
let semanticIds: string[] | null = null;
let expandedIds = new Set<string>();
let pinnedOpen = true;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

async function loadState(): Promise<void> {
  const res = await sendBackgroundMessage({ type: "GET_STATE" });
  if (res.ok && "state" in res && res.state) {
    state = res.state;
    render();
  }
}

function render(): void {
  if (!state) return;
  renderSetupBanner();
  renderGroqIndicator();
  renderContextMatchBanner();
  renderPlatformStrip();
  renderContext();
  renderSemanticButton();
  renderPinned();
  renderHistory();
}

function renderContextMatchBanner(): void {
  const banner = $("context-match-banner");
  const match = state!.pendingContextMatch;
  if (!match || match.dismissed) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  const platform = PLATFORM_LABELS[match.node.platform];
  const date = new Date(match.node.date).toLocaleDateString([], {
    weekday: "short",
  });
  $("context-match-text").textContent = `You explored "${match.node.topic}" with ${platform} on ${date} — inject context?`;
}

async function injectPendingContext(): Promise<void> {
  const match = state?.pendingContextMatch;
  if (!match) return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) return;
  await sendBackgroundMessage({
    type: "INJECT_CONTEXT",
    tabId,
    nodeId: match.node.id,
  });
  await loadState();
}

async function dismissContextMatch(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id ?? -1;
  await sendBackgroundMessage({ type: "DISMISS_CONTEXT_MATCH", tabId });
  await loadState();
}

function renderSetupBanner(): void {
  const banner = $("setup-banner");
  const complete = state!.settings.setupComplete === true;
  banner.classList.toggle("hidden", complete);
}

function renderGroqIndicator(): void {
  const el = $("groq-indicator");
  const on =
    state!.settings.groq.enabled && !!state!.settings.groq.apiKey;
  el.classList.toggle("hidden", !on);
}

function renderPlatformStrip(): void {
  const strip = $("platform-strip");
  strip.innerHTML = "";
  const platforms: Platform[] = ["chatgpt", "claude"];

  for (const platform of platforms) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `platform-pill${filterPlatform === platform ? " active" : ""}`;
    const remaining = remainingMessages(
      platform,
      state!.settings,
      state!.messageCounts[platform]
    );
    const label = PLATFORM_LABELS[platform];
    const countText =
      remaining === null
        ? "—"
        : `~${remaining} left`;
    btn.innerHTML = `${label} <span class="mono">${countText}</span>`;
    btn.addEventListener("click", () => {
      filterPlatform = filterPlatform === platform ? "all" : platform;
      render();
    });
    strip.appendChild(btn);
  }
}

async function renderContext(): Promise<void> {
  const section = $("context-section");
  const usage = state!.contextUsage;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTabId = tabs[0]?.id;
  const activeUrl = tabs[0]?.url ?? "";

  const isAiTab =
    activeUrl.includes("claude.ai") || activeUrl.includes("chatgpt.com");

  if (
    !usage ||
    !isAiTab ||
    usage.tabId !== activeTabId
  ) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  $("context-model").textContent = usage.modelLabel;
  $("context-counts").textContent = `${formatTokenCount(usage.estimatedTokens)} / ${formatTokenCount(usage.maxTokens)}`;

  const pct = usage.estimatedTokens / usage.maxTokens;
  const bar = $("context-bar");
  bar.style.width = `${Math.min(100, pct * 100)}%`;
  bar.className = "progress-fill";
  const color = contextBarColor(pct);
  if (color !== "ok") bar.classList.add(color);

  $("context-readout").textContent = formatTokenReadout(
    usage.estimatedTokens,
    usage.maxTokens
  );
}

function renderSemanticButton(): void {
  const btn = $("semantic-btn");
  const canSemantic =
    state!.settings.groq.enabled &&
    !!state!.settings.groq.apiKey &&
    state!.settings.groq.features.semanticSearch;
  btn.classList.toggle("hidden", !canSemantic);
  btn.classList.toggle("active", semanticMode);
}

function filterPrompts(prompts: PromptEntry[]): PromptEntry[] {
  let list = [...prompts];
  if (filterPlatform !== "all") {
    list = list.filter((p) => p.platform === filterPlatform);
  }
  if (searchQuery && !semanticIds) {
    const q = searchQuery.toLowerCase();
    list = list.filter((p) => p.text.toLowerCase().includes(q));
  }
  if (semanticIds) {
    const order = new Map(semanticIds.map((id, i) => [id, i]));
    list = list.filter((p) => order.has(p.id));
    list.sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
  }
  return list;
}

function createPromptRow(p: PromptEntry): HTMLElement {
  const row = document.createElement("div");
  row.className = `prompt-row${p.duplicateOf ? " duplicate" : ""}${expandedIds.has(p.id) ? " expanded" : ""}`;
  row.dataset.id = p.id;

  const icon = document.createElement("img");
  icon.className = "platform-icon";
  icon.src = chrome.runtime.getURL(
    `assets/platform-icons/${p.platform}.svg`
  );
  icon.alt = "";

  const body = document.createElement("div");
  body.className = "prompt-body";

  const text = document.createElement("div");
  text.className = "prompt-text";
  text.textContent = p.text;

  const meta = document.createElement("div");
  meta.className = "prompt-meta";
  meta.innerHTML = `<span>${formatTime(p.timestamp)}</span>`;
  if (p.duplicateOf) {
    const badge = document.createElement("span");
    badge.className = "similar-badge";
    badge.textContent = "Similar";
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      const el = document.querySelector(`[data-id="${p.duplicateOf}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    meta.appendChild(badge);
  }

  body.appendChild(text);
  body.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "prompt-actions";

  const pinBtn = document.createElement("button");
  pinBtn.className = `action-btn${p.pinned ? " pinned" : ""}`;
  pinBtn.title = "Pin";
  pinBtn.textContent = "📌";
  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void togglePin(p.id, !p.pinned);
  });

  const copyBtn = document.createElement("button");
  copyBtn.className = "action-btn";
  copyBtn.title = "Copy";
  copyBtn.textContent = "📋";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(p.text);
  });

  const delBtn = document.createElement("button");
  delBtn.className = "action-btn";
  delBtn.title = "Delete";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void deletePrompt(p.id);
  });

  actions.append(pinBtn, copyBtn, delBtn);
  row.append(icon, body, actions);

  row.addEventListener("click", () => {
    if (expandedIds.has(p.id)) expandedIds.delete(p.id);
    else expandedIds.add(p.id);
    render();
  });

  return row;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sessionTitle(sessionId: string, session?: SessionEntry): string {
  if (session?.titlePending) return "Naming…";
  if (session?.title) return session.title;
  return fallbackSessionTitle(sessionId, "");
}

function renderPinned(): void {
  const section = $("pinned-section");
  const pinned = filterPrompts(state!.prompts.filter((p) => p.pinned));
  $("pinned-count").textContent = String(pinned.length);
  section.classList.toggle("hidden", pinned.length === 0);

  const list = $("pinned-list");
  list.innerHTML = "";
  if (!pinnedOpen) {
    list.classList.add("hidden");
    return;
  }
  list.classList.remove("hidden");
  for (const p of pinned) {
    list.appendChild(createPromptRow(p));
  }
}

function renderHistory(): void {
  const list = $("history-list");
  const empty = $("empty-state");
  const unpinned = filterPrompts(state!.prompts.filter((p) => !p.pinned));

  list.innerHTML = "";
  empty.classList.toggle("hidden", unpinned.length > 0);

  const groups = new Map<string, PromptEntry[]>();
  for (const p of unpinned) {
    const arr = groups.get(p.sessionId) ?? [];
    arr.push(p);
    groups.set(p.sessionId, arr);
  }

  for (const [sessionId, prompts] of groups) {
    const group = document.createElement("div");
    group.className = "session-group";
    const header = document.createElement("div");
    header.className = "session-header";
    const session = state!.sessions[sessionId];
    const date = new Date(prompts[0].timestamp).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    header.textContent = `${date} · ${sessionTitle(sessionId, session)}`;
    group.appendChild(header);
    for (const p of prompts) {
      group.appendChild(createPromptRow(p));
    }
    list.appendChild(group);
  }
}

async function togglePin(id: string, pinned: boolean): Promise<void> {
  await sendBackgroundMessage({ type: "UPDATE_PROMPT", id, pinned });
  await loadState();
}

async function deletePrompt(id: string): Promise<void> {
  await sendBackgroundMessage({ type: "UPDATE_PROMPT", id, deleted: true });
  await loadState();
}

async function runSemanticSearch(): Promise<void> {
  if (!searchQuery.trim()) {
    semanticIds = null;
    render();
    return;
  }
  const btn = $("semantic-btn");
  btn.classList.add("loading");
  btn.textContent = "…";
  const res = await sendBackgroundMessage({
    type: "SEMANTIC_SEARCH",
    query: searchQuery,
  });
  btn.classList.remove("loading");
  btn.textContent = "Semantic";
  if (res.ok && "results" in res && res.results) {
    semanticIds = res.results.map((r: { id: string; score: number }) => r.id);
  } else {
    semanticIds = null;
  }
  render();
}

$("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("graph-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/graph/graph.html") });
});

$("context-inject-btn").addEventListener("click", () => {
  void injectPendingContext();
});

$("context-dismiss-btn").addEventListener("click", () => {
  void dismissContextMatch();
});

$("setup-link").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("pinned-toggle").addEventListener("click", () => {
  pinnedOpen = !pinnedOpen;
  render();
});

$("search-input").addEventListener("input", (e) => {
  searchQuery = (e.target as HTMLInputElement).value;
  if (!semanticMode) semanticIds = null;
  render();
});

$("semantic-btn").addEventListener("click", () => {
  semanticMode = !semanticMode;
  if (semanticMode) void runSemanticSearch();
  else {
    semanticIds = null;
    render();
  }
});

$("export-btn").addEventListener("click", async () => {
  const res = await sendBackgroundMessage({ type: "EXPORT_PINNED" });
  if (res.ok && "data" in res && res.data) {
    const blob = new Blob([res.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cek-pinned-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") void loadState();
});

void loadState();
