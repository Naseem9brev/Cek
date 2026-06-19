import type { Settings } from "../lib/messaging";
import { iconHtml } from "../lib/icons";
import { downloadMcpExportBundle } from "../lib/mcp-export";
import { sendBackgroundMessage } from "../lib/messaging";
import { getKnowledgeNodes } from "../lib/knowledge-nodes";
import {
  connectVault,
  isVaultConnected,
  syncNodesToVault,
} from "../lib/vault-sync";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../lib/storage";

let settings: Settings = DEFAULT_SETTINGS;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let wizardStep = 0;

const WIZARD_STEPS = [
  {
    title: "Your thoughts, remembered",
    body: `<p>cek quietly captures your AI conversations and turns them into memory you can pick up anytime — everything stays on your device.</p>
      <ul class="wizard-checklist">
        <li>Turn on ChatGPT and Claude below</li>
        <li>Enable Remember my chats when you're ready</li>
      </ul>`,
  },
  {
    title: "Smart features (optional)",
    body: `<p>Add an API key to unlock smart search, auto titles, and richer memory. You can skip this and turn it on later.</p>`,
  },
  {
    title: "You're ready",
    body: `<p>Start a conversation on Claude or ChatGPT. cek handles the rest — open the popup anytime to browse memories or continue where you left off.</p>`,
  },
] as const;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

function showWizardIfNeeded(): void {
  if (settings.setupComplete) return;
  wizardStep = 0;
  renderWizardStep();
  $("setup-wizard").classList.remove("hidden");
}

function renderWizardStep(): void {
  const step = WIZARD_STEPS[wizardStep]!;
  $("wizard-step-label").textContent = `Step ${wizardStep + 1} of ${WIZARD_STEPS.length}`;
  $("wizard-title").textContent = step.title;
  $("wizard-body").innerHTML = step.body;
  $("wizard-next").textContent =
    wizardStep === WIZARD_STEPS.length - 1 ? "Get started" : "Continue";
}

async function finishWizard(): Promise<void> {
  $("setup-wizard").classList.add("hidden");
  settings.setupComplete = true;
  await saveSettings(settings);
}

async function load(): Promise<void> {
  settings = await getSettings();
  document.querySelector(".brand-mark")!.innerHTML = iconHtml("mark");
  bindToForm();
  renderWorkspaceList();
  renderDefaultWorkspaceSelect();
  void refreshObsidianStatus();
  showWizardIfNeeded();
}

async function refreshObsidianStatus(): Promise<void> {
  const connected = await isVaultConnected();
  const subfolder = settings.obsidian.subfolder || "cek";
  $("obsidian-status").textContent = connected
    ? `Vault connected · notes sync to /${subfolder}`
    : settings.obsidian.vaultConnected
      ? "Vault permission expired — connect again"
      : "No vault folder connected";
}

function renderDefaultWorkspaceSelect(): void {
  const select = $("default-workspace") as HTMLSelectElement;
  select.innerHTML = "";
  for (const name of settings.workspaces) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  const active = settings.activeWorkspace ?? settings.workspaces[0] ?? "General";
  select.value = settings.workspaces.includes(active)
    ? active
    : settings.workspaces[0] ?? "General";
}

function renderWorkspaceList(): void {
  const list = $("workspace-list");
  list.innerHTML = "";

  for (let i = 0; i < settings.workspaces.length; i++) {
    const name = settings.workspaces[i]!;
    const li = document.createElement("li");
    li.className = "workspace-item";

    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    input.dataset.index = String(i);
    input.addEventListener("change", () => {
      const idx = Number(input.dataset.index);
      const oldName = settings.workspaces[idx];
      const newName = input.value.trim();
      if (!newName || newName === oldName) {
        input.value = oldName ?? "";
        return;
      }
      if (settings.workspaces.includes(newName)) {
        input.value = oldName ?? "";
        return;
      }
      settings.workspaces[idx] = newName;
      if (settings.activeWorkspace === oldName) {
        settings.activeWorkspace = newName;
      }
      renderDefaultWorkspaceSelect();
      scheduleSave();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "workspace-delete";
    delBtn.title = "Remove workspace";
    delBtn.innerHTML = iconHtml("delete");
    delBtn.addEventListener("click", () => {
      if (settings.workspaces.length <= 1) return;
      const removed = settings.workspaces[i]!;
      settings.workspaces.splice(i, 1);
      if (settings.activeWorkspace === removed) {
        settings.activeWorkspace = settings.workspaces[0] ?? "General";
      }
      renderWorkspaceList();
      renderDefaultWorkspaceSelect();
      scheduleSave();
    });

    li.append(input, delBtn);
    list.appendChild(li);
  }
}

function bindToForm(): void {
  ($("chatgpt-enabled") as HTMLInputElement).checked =
    settings.platforms.chatgpt.enabled;
  ($("chatgpt-tier") as HTMLSelectElement).value =
    settings.platforms.chatgpt.tier;
  ($("claude-enabled") as HTMLInputElement).checked =
    settings.platforms.claude.enabled;
  ($("claude-tier") as HTMLSelectElement).value =
    settings.platforms.claude.tier;

  ($("groq-enabled") as HTMLInputElement).checked = settings.groq.enabled;
  ($("groq-api-key") as HTMLInputElement).value = settings.groq.apiKey;
  ($("feat-semantic") as HTMLInputElement).checked =
    settings.groq.features.semanticSearch;
  ($("feat-titles") as HTMLInputElement).checked =
    settings.groq.features.sessionTitles;
  ($("feat-dedupe") as HTMLInputElement).checked =
    settings.groq.features.nearDuplicateDetection;
  ($("feat-summarise") as HTMLInputElement).checked =
    settings.groq.features.sessionSummarisation;
  ($("dup-threshold") as HTMLInputElement).value = String(
    Math.round(settings.groq.duplicateThreshold * 100)
  );
  $("dup-threshold-val").textContent =
    settings.groq.duplicateThreshold.toFixed(2);
  ($("dup-action") as HTMLSelectElement).value =
    settings.groq.duplicateAction;

  ($("debug-mode") as HTMLInputElement).checked = !!settings.debugMode;
  ($("on-page-badge") as HTMLInputElement).checked =
    !!settings.showOnPageBadge;

  ($("mcp-sync-enabled") as HTMLInputElement).checked =
    settings.export.mcpSyncEnabled;

  ($("obsidian-subfolder") as HTMLInputElement).value =
    settings.obsidian.subfolder;
  ($("obsidian-auto-sync") as HTMLInputElement).checked =
    settings.obsidian.autoSync;
}

function readFromForm(): Settings {
  const defaultWorkspace = ($("default-workspace") as HTMLSelectElement).value;
  return {
    ...settings,
    schemaVersion: 2,
    platforms: {
      ...settings.platforms,
      chatgpt: {
        enabled: ($("chatgpt-enabled") as HTMLInputElement).checked,
        tier: ($("chatgpt-tier") as HTMLSelectElement).value,
      },
      claude: {
        enabled: ($("claude-enabled") as HTMLInputElement).checked,
        tier: ($("claude-tier") as HTMLSelectElement).value,
      },
    },
    groq: {
      ...settings.groq,
      enabled: ($("groq-enabled") as HTMLInputElement).checked,
      apiKey: ($("groq-api-key") as HTMLInputElement).value.trim(),
      features: {
        semanticSearch: ($("feat-semantic") as HTMLInputElement).checked,
        sessionTitles: ($("feat-titles") as HTMLInputElement).checked,
        nearDuplicateDetection: ($("feat-dedupe") as HTMLInputElement).checked,
        sessionSummarisation: ($("feat-summarise") as HTMLInputElement).checked,
      },
      duplicateThreshold:
        Number(($("dup-threshold") as HTMLInputElement).value) / 100,
      duplicateAction: ($("dup-action") as HTMLSelectElement).value as
        | "flag"
        | "skip",
    },
    workspaces: [...settings.workspaces],
    activeWorkspace: defaultWorkspace,
    debugMode: ($("debug-mode") as HTMLInputElement).checked,
    showOnPageBadge: ($("on-page-badge") as HTMLInputElement).checked,
    export: {
      ...settings.export,
      mcpSyncEnabled: ($("mcp-sync-enabled") as HTMLInputElement).checked,
    },
    obsidian: {
      ...settings.obsidian,
      subfolder:
        ($("obsidian-subfolder") as HTMLInputElement).value.trim() || "cek",
      autoSync: ($("obsidian-auto-sync") as HTMLInputElement).checked,
      vaultConnected: settings.obsidian.vaultConnected,
    },
    setupComplete: true,
  };
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    settings = readFromForm();
    await saveSettings(settings);
    $("save-status").textContent = "Saved";
    setTimeout(() => {
      $("save-status").textContent = "";
    }, 1500);
  }, 400);
}

const inputs = document.querySelectorAll("input, select");
inputs.forEach((el) => {
  el.addEventListener("change", scheduleSave);
  el.addEventListener("input", scheduleSave);
});

$("dup-threshold").addEventListener("input", () => {
  $("dup-threshold-val").textContent = (
    Number(($("dup-threshold") as HTMLInputElement).value) / 100
  ).toFixed(2);
});

$("workspace-add-btn").addEventListener("click", () => {
  const input = $("workspace-input") as HTMLInputElement;
  const name = input.value.trim();
  if (!name || settings.workspaces.includes(name)) {
    input.value = "";
    return;
  }
  settings.workspaces.push(name);
  input.value = "";
  renderWorkspaceList();
  renderDefaultWorkspaceSelect();
  scheduleSave();
});

$("workspace-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("workspace-add-btn").click();
  }
});

$("mcp-export-btn").addEventListener("click", async () => {
  const res = await sendBackgroundMessage({ type: "SYNC_MCP_EXPORT" });
  if (res.ok && "data" in res && res.data) {
    try {
      const parsed = JSON.parse(res.data) as {
        main?: string;
        sidecar?: string | null;
      };
      if (parsed.main) {
        downloadMcpExportBundle({
          main: parsed.main,
          sidecar: parsed.sidecar,
        });
      } else {
        downloadMcpExportBundle({ main: res.data });
      }
    } catch {
      downloadMcpExportBundle({ main: res.data });
    }
    $("save-status").textContent = "MCP export downloaded";
    setTimeout(() => {
      $("save-status").textContent = "";
    }, 1500);
  } else {
    $("save-status").textContent = "Export failed";
  }
});

$("obsidian-connect-btn").addEventListener("click", async () => {
  try {
    const ok = await connectVault();
    settings = await getSettings();
    await refreshObsidianStatus();
    if (ok) {
      $("save-status").textContent = "Vault connected";
    } else {
      $("obsidian-status").textContent = "Vault connection cancelled or denied";
    }
    setTimeout(() => {
      $("save-status").textContent = "";
    }, 1500);
  } catch (e) {
    $("obsidian-status").textContent = `Connect failed: ${String(e)}`;
  }
});

$("obsidian-sync-btn").addEventListener("click", async () => {
  settings = readFromForm();
  await saveSettings(settings);
  const nodes = await getKnowledgeNodes();
  const { written, errors } = await syncNodesToVault(
    nodes,
    settings.obsidian.subfolder
  );
  if (errors.length) {
    $("obsidian-status").textContent = errors.join("; ");
  } else {
    $("obsidian-status").textContent = `Synced ${written} note(s)`;
    settings.obsidian.vaultConnected = true;
    await saveSettings(settings);
  }
});

$("export-pinned-btn").addEventListener("click", async () => {
  const res = await sendBackgroundMessage({ type: "EXPORT_PINNED" });
  if (res.ok && "data" in res && res.data) {
    const blob = new Blob([res.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cek-pinned-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    $("save-status").textContent = "Saved to Downloads";
    setTimeout(() => { $("save-status").textContent = ""; }, 1500);
  }
});

$("export-memory-btn").addEventListener("click", async () => {
  const res = await sendBackgroundMessage({ type: "EXPORT_KNOWLEDGE_NODES" });
  if (res.ok && "data" in res && res.data) {
    const blob = new Blob([res.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cek-memory-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    $("save-status").textContent = "Backup saved";
    setTimeout(() => { $("save-status").textContent = ""; }, 1500);
  }
});

$("wizard-next").addEventListener("click", () => {
  if (wizardStep < WIZARD_STEPS.length - 1) {
    wizardStep++;
    renderWizardStep();
  } else {
    void finishWizard();
  }
});

$("wizard-skip").addEventListener("click", () => {
  void finishWizard();
});

void load();
