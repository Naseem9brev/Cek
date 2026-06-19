import type { Platform } from "../lib/constants";
import { PLATFORM_LABELS } from "../lib/constants";
import {
  memoryInsight,
  relativeTime,
} from "../lib/copy";
import { iconHtml } from "../lib/icons";
import type {
  AppState,
  KnowledgeNode,
  PromptEntry,
  SessionEntry,
} from "../lib/messaging";
import { sendBackgroundMessage } from "../lib/messaging";
import {
  contextBarColor,
  formatTokenCount,
  formatTokenReadout,
} from "../lib/tokens";
import { fallbackSessionTitle, getSettings, saveSettings } from "../lib/storage";
import { remainingMessages } from "../lib/windows";

let state: AppState | null = null;
let filterPlatform: Platform | "all" = "all";
let searchQuery = "";
let semanticIds: string[] | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let expandedIds = new Set<string>();
let pinnedOpen = true;
let activeTab: "memory" | "prompts" = "memory";
let footerMenuOpen = false;
let sheetNode: KnowledgeNode | null = null;
let pendingDelete: { id: string; timer: ReturnType<typeof setTimeout> } | null =
  null;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

function initStaticIcons(): void {
  document.querySelector(".brand-mark")!.innerHTML = iconHtml("mark");
  $("settings-btn").innerHTML = iconHtml("settings");
  $("footer-menu-btn").innerHTML = iconHtml("more");
  $("memory-strip-icon").innerHTML = iconHtml("memory");
  document.querySelector(".footer-primary-icon")!.innerHTML = iconHtml("graph");
  $("memory-sheet-close").innerHTML = iconHtml("close");
  document.querySelector(".section-toggle-icon")!.innerHTML = iconHtml("chevron");
}

function hideLoading(): void {
  $("loading-skeleton").classList.add("hidden");
  $("app").classList.remove("hidden");
}

async function isActiveAiTab(): Promise<boolean> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url ?? "";
  return url.includes("claude.ai") || url.includes("chatgpt.com");
}

async function dismissPageToastIfOnAiTab(): Promise<void> {
  if (!(await isActiveAiTab())) return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "DISMISS_CONTEXT_TOAST" });
  } catch {
    // content script may be unavailable
  }
}

async function loadState(): Promise<void> {
  const res = await sendBackgroundMessage({ type: "GET_STATE" });
  if (res.ok && "state" in res && res.state) {
    state = res.state;
    hideLoading();
    pickDefaultTab();
    await dismissPageToastIfOnAiTab();
    render();
  }
}

function pickDefaultTab(): void {
  if (!state) return;
  const nodes = state.knowledgeNodes;
  const prompts = state.prompts;
  const hasMemory = nodes.length > 0;
  const hasPrompts = prompts.length > 0;

  if (!hasMemory && hasPrompts) {
    activeTab = "prompts";
    return;
  }
  if (hasMemory && !hasPrompts) {
    activeTab = "memory";
    return;
  }
  if (!hasMemory || !hasPrompts) {
    activeTab = hasMemory ? "memory" : "prompts";
    return;
  }

  const latestNode = Math.max(...nodes.map((n) => n.date));
  const latestPrompt = Math.max(...prompts.map((p) => p.timestamp));
  activeTab = latestNode >= latestPrompt ? "memory" : "prompts";
}

function render(): void {
  if (!state) return;
  renderSetupBanner();
  renderSmartPill();
  renderHeroMatch();
  renderMemoryStrip();
  renderGraphButton();
  renderTabs();
  renderMemoryList();
  renderPlatformStrip();
  renderWorkspaceSelector();
  void renderContext();
  renderPinned();
  renderHistory();
}

function memoryEnabled(): boolean {
  return (
    state!.settings.groq.enabled &&
    !!state!.settings.groq.apiKey &&
    state!.settings.groq.features.sessionSummarisation
  );
}

function canSmartSearch(): boolean {
  return (
    state!.settings.groq.enabled &&
    !!state!.settings.groq.apiKey &&
    state!.settings.groq.features.semanticSearch
  );
}

function renderSmartPill(): void {
  const el = $("smart-pill");
  const on = state!.settings.groq.enabled && !!state!.settings.groq.apiKey;
  el.classList.toggle("hidden", !on);
  if (on) {
    el.innerHTML = `${iconHtml("sparkles")} Smart`;
  }
}

function renderMemoryStrip(): void {
  const nodes = state!.knowledgeNodes;
  const count = nodes.length;
  const latest = [...nodes].sort((a, b) => b.date - a.date)[0];
  const textEl = $("memory-strip-text");
  const pill = $("memory-status-pill");
  const on = memoryEnabled();

  if (!on) {
    textEl.textContent = "Remember my chats is off";
  } else if (count === 0) {
    textEl.textContent = "Ready to remember your chats";
  } else if (latest) {
    textEl.textContent = `${count} memor${count === 1 ? "y" : "ies"} · ${latest.topic}`;
  } else {
    textEl.textContent = `${count} memories`;
  }

  pill.textContent = on ? "On" : "Off";
  pill.className = `status-pill ${on ? "on" : "off"}`;
}

async function renderHeroMatch(): Promise<void> {
  const hero = $("hero-match");
  const match = state!.pendingContextMatch;
  if (!match || match.dismissed) {
    hero.classList.add("hidden");
    return;
  }

  const onAi = await isActiveAiTab();
  if (onAi) {
    hero.classList.add("hidden");
    return;
  }

  hero.classList.remove("hidden");
  $("hero-topic").textContent = match.node.topic;
  const extra =
    match.nodes?.length > 1 ? ` · +${match.nodes.length - 1} related` : "";
  const conf = match.confidence
    ? ` · ${match.confidence} confidence`
    : "";
  $("hero-preview").textContent =
    memoryInsight(match.node) + extra + conf;
}

function renderTabs(): void {
  const hasMemory = state!.knowledgeNodes.length > 0;
  const hasPrompts = state!.prompts.length > 0;
  const showTabs = hasMemory && hasPrompts;

  $("tab-bar").classList.toggle("hidden", !showTabs);
  $("tab-memory").classList.toggle("active", activeTab === "memory");
  $("tab-prompts").classList.toggle("active", activeTab === "prompts");
  $("tab-memory").setAttribute("aria-selected", String(activeTab === "memory"));
  $("tab-prompts").setAttribute("aria-selected", String(activeTab === "prompts"));

  if (!showTabs) {
    $("panel-memory").classList.toggle("hidden", !hasMemory);
    $("panel-prompts").classList.toggle("hidden", !hasPrompts);
    return;
  }

  $("panel-memory").classList.toggle("hidden", activeTab !== "memory");
  $("panel-prompts").classList.toggle("hidden", activeTab !== "prompts");
}

function renderMemoryList(): void {
  const list = $("memory-list");
  const emptyOn = $("memory-empty");
  const emptyOff = $("memory-empty-off");
  const on = memoryEnabled();
  const nodes = [...state!.knowledgeNodes]
    .sort((a, b) => b.date - a.date)
    .slice(0, 8);

  list.innerHTML = "";

  if (!on) {
    emptyOn.classList.add("hidden");
    emptyOff.classList.remove("hidden");
    return;
  }

  emptyOff.classList.add("hidden");
  emptyOn.classList.toggle("hidden", nodes.length > 0);

  nodes.forEach((node, i) => {
    list.appendChild(createMemoryRow(node, i));
  });
}

function createMemoryRow(node: KnowledgeNode, staggerIndex: number): HTMLElement {
  const row = document.createElement("div");
  row.className = `memory-row platform-${node.platform}`;
  row.style.setProperty("--stagger-index", String(staggerIndex));

  const body = document.createElement("div");
  body.className = "memory-row-body";

  const topic = document.createElement("div");
  topic.className = "memory-row-topic";
  topic.textContent = node.topic;

  const insight = document.createElement("div");
  insight.className = "memory-row-insight";
  const text = memoryInsight(node);
  insight.textContent = text !== node.topic ? text : "";

  const meta = document.createElement("div");
  meta.className = "memory-row-meta";
  meta.innerHTML = `<span>${PLATFORM_LABELS[node.platform]}</span><span>${relativeTime(node.date)}</span>`;
  if (node.workspace) {
    const ws = document.createElement("span");
    ws.textContent = node.workspace;
    meta.appendChild(ws);
  }

  body.append(topic);
  if (insight.textContent) body.append(insight);
  body.append(meta);

  const chevron = document.createElement("span");
  chevron.className = "memory-row-chevron";
  chevron.innerHTML = iconHtml("chevron");

  row.append(body, chevron);
  row.addEventListener("click", () => openMemorySheet(node));
  return row;
}

function openMemorySheet(node: KnowledgeNode): void {
  sheetNode = node;
  const content = $("memory-sheet-content");
  const decisions = node.decisions.length
    ? `<p><strong>Key points:</strong> ${escapeHtml(node.decisions.join(" · "))}</p>`
    : "";
  const questions = node.openQuestions.length
    ? `<p><strong>Open questions:</strong> ${escapeHtml(node.openQuestions.join(" · "))}</p>`
    : "";

  content.innerHTML = `
    <h3 class="memory-sheet-topic">${escapeHtml(node.topic)}</h3>
    <p class="memory-sheet-meta">${PLATFORM_LABELS[node.platform]} · ${relativeTime(node.date)}${node.workspace ? ` · ${escapeHtml(node.workspace)}` : ""}</p>
    <div class="memory-sheet-detail">
      <p>${escapeHtml(memoryInsight(node))}</p>
      ${decisions}
      ${questions}
    </div>
  `;
  $("memory-sheet").classList.remove("hidden");
}

function closeMemorySheet(): void {
  sheetNode = null;
  $("memory-sheet").classList.add("hidden");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function openGraph(highlightId?: string): void {
  const workspace = state?.settings.activeWorkspace;
  const params = new URLSearchParams();
  if (workspace) params.set("workspace", workspace);
  if (highlightId) params.set("node", highlightId);
  const qs = params.toString();
  chrome.tabs.create({
    url: chrome.runtime.getURL(`src/graph/graph.html${qs ? `?${qs}` : ""}`),
  });
}

function renderGraphButton(): void {
  const count = state!.knowledgeNodes.length;
  $("graph-btn-label").textContent = count > 0 ? `Graph · ${count}` : "Graph";
}

async function injectNode(nodeId: string): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) return;
  await sendBackgroundMessage({ type: "INJECT_CONTEXT", tabId, nodeId });
  showFooterToast("Context added to your chat");
  await loadState();
}

async function injectPendingContext(): Promise<void> {
  const match = state?.pendingContextMatch;
  if (!match) return;
  await injectNode(match.node.id);
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

function renderWorkspaceSelector(): void {
  const row = $("workspace-row");
  const workspaces = state!.settings.workspaces;
  row.classList.toggle("hidden", workspaces.length <= 1);

  const select = $("workspace-select") as HTMLSelectElement;
  const active = state!.settings.activeWorkspace;
  select.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All workspaces";
  select.appendChild(allOpt);

  for (const name of workspaces) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }

  select.value = active ?? "";
}

async function setActiveWorkspace(workspace: string | null): Promise<void> {
  const settings = await getSettings();
  settings.activeWorkspace = workspace;
  await saveSettings(settings);
  if (state) state.settings.activeWorkspace = workspace;
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
    const countText = remaining === null ? "—" : `~${remaining} left`;
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

  if (!usage || !isAiTab || usage.tabId !== activeTabId) {
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
    list.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }
  return list;
}

function createPromptRow(p: PromptEntry, staggerIndex = 0): HTMLElement {
  const row = document.createElement("div");
  row.className = `prompt-row${p.duplicateOf ? " duplicate" : ""}${expandedIds.has(p.id) ? " expanded" : ""}`;
  row.style.setProperty("--stagger-index", String(staggerIndex));
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
      document
        .querySelector(`[data-id="${p.duplicateOf}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    meta.appendChild(badge);
  }

  body.append(text, meta);

  const actions = document.createElement("div");
  actions.className = "prompt-actions";

  const pinBtn = document.createElement("button");
  pinBtn.className = `action-btn${p.pinned ? " pinned" : ""}`;
  pinBtn.title = "Pin";
  pinBtn.innerHTML = iconHtml("pin");
  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pinBtn.classList.add("pin-pop");
    void togglePin(p.id, !p.pinned);
  });

  const copyBtn = document.createElement("button");
  copyBtn.className = "action-btn";
  copyBtn.title = "Copy";
  copyBtn.innerHTML = iconHtml("copy");
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(p.text);
    copyBtn.innerHTML = iconHtml("check");
    copyBtn.classList.add("pinned");
    showFooterToast("Copied");
    setTimeout(() => {
      copyBtn.innerHTML = iconHtml("copy");
      copyBtn.classList.remove("pinned");
    }, 1200);
  });

  const delBtn = document.createElement("button");
  delBtn.className = "action-btn";
  delBtn.title = "Delete";
  delBtn.innerHTML = iconHtml("delete");
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    scheduleDelete(p.id, row);
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

function scheduleDelete(id: string, row: HTMLElement): void {
  if (pendingDelete) {
    clearTimeout(pendingDelete.timer);
    void deletePrompt(pendingDelete.id);
  }
  row.classList.add("removing");
  showFooterToast("Deleted · Undo");
  const timer = setTimeout(async () => {
    pendingDelete = null;
    await deletePrompt(id);
  }, 3000);
  pendingDelete = { id, timer };

  const toast = $("footer-toast");
  toast.onclick = () => {
    if (!pendingDelete || pendingDelete.id !== id) return;
    clearTimeout(pendingDelete.timer);
    pendingDelete = null;
    row.classList.remove("removing");
    toast.onclick = null;
    toast.classList.add("hidden");
    showFooterToast("Restored");
  };
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

  const toggle = $("pinned-toggle");
  toggle.setAttribute("aria-expanded", String(pinnedOpen));

  const list = $("pinned-list");
  list.innerHTML = "";
  if (!pinnedOpen) {
    list.classList.add("hidden");
    return;
  }
  list.classList.remove("hidden");
  pinned.forEach((p, i) => list.appendChild(createPromptRow(p, i)));
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
    prompts.forEach((p, i) => group.appendChild(createPromptRow(p, i)));
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

async function runSmartSearch(): Promise<void> {
  if (!canSmartSearch() || !searchQuery.trim()) {
    semanticIds = null;
    render();
    return;
  }
  const res = await sendBackgroundMessage({
    type: "SEMANTIC_SEARCH",
    query: searchQuery,
  });
  if (res.ok && "results" in res && res.results) {
    semanticIds = res.results.map((r: { id: string; score: number }) => r.id);
  } else {
    semanticIds = null;
  }
  render();
}

function showFooterToast(message: string, ms = 2200): void {
  const el = $("footer-toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout((el as HTMLParagraphElement & { _t?: number })._t);
  (el as HTMLParagraphElement & { _t?: number })._t = window.setTimeout(() => {
    if (!pendingDelete) el.classList.add("hidden");
  }, ms);
}

function toggleFooterMenu(open?: boolean): void {
  footerMenuOpen = open ?? !footerMenuOpen;
  $("footer-menu").classList.toggle("hidden", !footerMenuOpen);
  $("footer-menu-btn").setAttribute("aria-expanded", String(footerMenuOpen));
}

async function exportPinned(): Promise<void> {
  toggleFooterMenu(false);
  const res = await sendBackgroundMessage({ type: "EXPORT_PINNED" });
  if (res.ok && "data" in res && res.data) {
    downloadJson(res.data, `cek-pinned-${Date.now()}.json`);
    showFooterToast("Saved to Downloads");
  }
}

async function exportMemory(): Promise<void> {
  toggleFooterMenu(false);
  const res = await sendBackgroundMessage({ type: "EXPORT_KNOWLEDGE_NODES" });
  if (res.ok && "data" in res && res.data) {
    downloadJson(res.data, `cek-memory-${Date.now()}.json`);
    showFooterToast("Backup saved");
  }
}

function downloadJson(data: string, filename: string): void {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

initStaticIcons();

$("graph-btn").addEventListener("click", () => openGraph());

$("tab-memory").addEventListener("click", () => {
  activeTab = "memory";
  renderTabs();
});

$("tab-prompts").addEventListener("click", () => {
  activeTab = "prompts";
  renderTabs();
});

$("workspace-select").addEventListener("change", (e) => {
  const val = (e.target as HTMLSelectElement).value;
  void setActiveWorkspace(val ? val : null);
});

$("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("memory-setup-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("memory-status-pill").addEventListener("click", () => {
  if (!memoryEnabled()) chrome.runtime.openOptionsPage();
});

$("hero-continue-btn").addEventListener("click", () => {
  void injectPendingContext();
});

$("hero-dismiss-btn").addEventListener("click", () => {
  void dismissContextMatch();
});

$("setup-link").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("pinned-toggle").addEventListener("click", () => {
  pinnedOpen = !pinnedOpen;
  renderPinned();
});

$("search-input").addEventListener("input", (e) => {
  searchQuery = (e.target as HTMLInputElement).value;
  if (searchTimer) clearTimeout(searchTimer);
  if (!searchQuery.trim()) {
    semanticIds = null;
    render();
    return;
  }
  if (canSmartSearch()) {
    searchTimer = setTimeout(() => void runSmartSearch(), 350);
  } else {
    semanticIds = null;
    render();
  }
});

$("footer-menu-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFooterMenu();
});

$("export-btn").addEventListener("click", () => void exportPinned());
$("export-nodes-btn").addEventListener("click", () => void exportMemory());

$("memory-sheet-close").addEventListener("click", closeMemorySheet);
$("memory-sheet-backdrop").addEventListener("click", closeMemorySheet);

$("memory-sheet-continue").addEventListener("click", () => {
  if (!sheetNode) return;
  void injectNode(sheetNode.id);
  closeMemorySheet();
});

$("memory-sheet-graph").addEventListener("click", () => {
  if (!sheetNode) return;
  openGraph(sheetNode.id);
  closeMemorySheet();
});

document.addEventListener("click", () => {
  if (footerMenuOpen) toggleFooterMenu(false);
});

$("footer-menu").addEventListener("click", (e) => e.stopPropagation());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") void loadState();
});

void loadState();
