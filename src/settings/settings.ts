import type { Settings } from "../lib/messaging";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../lib/storage";

let settings: Settings = DEFAULT_SETTINGS;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

async function load(): Promise<void> {
  settings = await getSettings();
  bindToForm();
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
}

function readFromForm(): Settings {
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
      },
      duplicateThreshold:
        Number(($("dup-threshold") as HTMLInputElement).value) / 100,
      duplicateAction: ($("dup-action") as HTMLSelectElement).value as
        | "flag"
        | "skip",
    },
    debugMode: ($("debug-mode") as HTMLInputElement).checked,
    showOnPageBadge: ($("on-page-badge") as HTMLInputElement).checked,
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

void load();
