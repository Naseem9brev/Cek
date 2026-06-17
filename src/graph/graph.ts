import type { Platform } from "../lib/constants";
import { PLATFORM_LABELS } from "../lib/constants";
import type { KnowledgeNode } from "../lib/messaging";
import { sendBackgroundMessage } from "../lib/messaging";

declare const vis: {
  Network: new (
    container: HTMLElement,
    data: { nodes: unknown[]; edges: unknown[] },
    options: Record<string, unknown>
  ) => {
    on: (event: string, cb: (params: { nodes: string[] }) => void) => void;
    setData: (data: { nodes: unknown[]; edges: unknown[] }) => void;
  };
  DataSet: new (items: unknown[]) => unknown;
};

const PLATFORM_COLORS: Record<Platform, string> = {
  claude: "#d97757",
  chatgpt: "#10a37f",
  gemini: "#4285f4",
};

let allNodes: KnowledgeNode[] = [];
let filterPlatform: Platform | "all" = "all";
let filterDays: number | "all" = "all";
let network: InstanceType<typeof vis.Network> | null = null;
let selectedNodeId: string | null = null;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

function nodeSize(node: KnowledgeNode): number {
  return Math.sqrt(node.entities.length + node.turnCount) * 8 + 12;
}

function buildEdges(nodes: KnowledgeNode[]): Array<{ from: string; to: string; width: number }> {
  const edges: Array<{ from: string; to: string; width: number }> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const setA = new Set(a.entities.map((e) => e.toLowerCase()));
      const shared = b.entities.filter((e) => setA.has(e.toLowerCase())).length;
      if (shared >= 1) {
        edges.push({ from: a.id, to: b.id, width: Math.min(shared, 4) });
      }
    }
  }
  return edges;
}

function filteredNodes(): KnowledgeNode[] {
  let list = [...allNodes];
  if (filterPlatform !== "all") {
    list = list.filter((n) => n.platform === filterPlatform);
  }
  if (filterDays !== "all") {
    const cutoff = Date.now() - filterDays * 24 * 60 * 60 * 1000;
    list = list.filter((n) => n.date >= cutoff);
  }
  return list;
}

function visData(nodes: KnowledgeNode[]) {
  const visNodes = nodes.map((n) => ({
    id: n.id,
    label: n.topic.length > 30 ? n.topic.slice(0, 28) + "…" : n.topic,
    title: `${n.topic}\n${n.entities.join(", ")}`,
    color: {
      background: PLATFORM_COLORS[n.platform],
      border: "#1A3A1A",
      highlight: { background: PLATFORM_COLORS[n.platform], border: "#2d6a2d" },
    },
    size: nodeSize(n),
    font: { color: "#1A3A1A", size: 12, face: "Inter" },
  }));
  const edges = buildEdges(nodes).map((e, i) => ({
    id: `e${i}`,
    from: e.from,
    to: e.to,
    width: e.width,
    color: { color: "#E0D8C0", highlight: "#2d6a2d" },
  }));
  return { nodes: visNodes, edges };
}

function renderGraph(): void {
  const nodes = filteredNodes();
  $("empty-graph").classList.toggle("hidden", nodes.length > 0);

  const container = $("graph-network");
  const data = visData(nodes);

  const options = {
    physics: {
      stabilization: { iterations: 120 },
      barnesHut: { gravitationalConstant: -4000, springLength: 120 },
    },
    interaction: { hover: true, tooltipDelay: 100 },
    edges: { smooth: { type: "continuous" } },
  };

  if (!network) {
    network = new vis.Network(container, data, options);
    network.on("click", (params) => {
      if (params.nodes.length) {
        showDetail(params.nodes[0]!);
      }
    });
  } else {
    network.setData(data);
  }
}

function showDetail(id: string): void {
  selectedNodeId = id;
  const node = allNodes.find((n) => n.id === id);
  if (!node) return;

  const panel = $("detail-panel");
  panel.classList.remove("hidden");

  $("detail-topic").textContent = node.topic;
  $("detail-meta").textContent = `${PLATFORM_LABELS[node.platform]} · ${new Date(node.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${node.turnCount} turns`;

  renderListSection("detail-entities", "Entities", node.entities);
  renderListSection("detail-decisions", "Decisions", node.decisions);
  renderListSection("detail-questions", "Open questions", node.openQuestions);
}

function renderListSection(elId: string, title: string, items: string[]): void {
  const el = $(elId);
  if (!items.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `<h3>${title}</h3><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderFilters(): void {
  const container = $("platform-filters");
  container.innerHTML = "";

  const platforms: Array<Platform | "all"> = ["all", "claude", "chatgpt", "gemini"];
  for (const p of platforms) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pill${filterPlatform === p ? " active" : ""}`;
    btn.textContent = p === "all" ? "All" : PLATFORM_LABELS[p];
    btn.addEventListener("click", () => {
      filterPlatform = p;
      renderFilters();
      renderGraph();
    });
    container.appendChild(btn);
  }
}

async function loadNodes(): Promise<void> {
  const res = await sendBackgroundMessage({ type: "GET_KNOWLEDGE_NODES" });
  if (res.ok && "nodes" in res && res.nodes) {
    allNodes = res.nodes;
  }
  renderFilters();
  renderGraph();
}

$("settings-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

$("date-filter").addEventListener("change", (e) => {
  const val = (e.target as HTMLSelectElement).value;
  filterDays = val === "all" ? "all" : Number(val);
  renderGraph();
});

$("close-detail").addEventListener("click", () => {
  $("detail-panel").classList.add("hidden");
  selectedNodeId = null;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.knowledgeNodes) {
    void loadNodes();
  }
});

void loadNodes();
