import type { Platform } from "../lib/constants";
import { PLATFORM_LABELS } from "../lib/constants";
import type { KnowledgeNode } from "../lib/messaging";
import { sendBackgroundMessage } from "../lib/messaging";

declare const vis: {
  Network: new (
    container: HTMLElement,
    data: { nodes: VisDataSet; edges: VisDataSet },
    options: Record<string, unknown>
  ) => GraphNetwork;
  DataSet: new (
    items?: GraphNode[] | GraphEdge[],
    options?: Record<string, unknown>
  ) => VisDataSet;
};

interface VisDataSet {
  add: (items: GraphNode[] | GraphEdge[]) => void;
  clear: () => void;
  get: (options?: { fields?: string[] }) => GraphNode[] | GraphEdge[];
  update: (items: Partial<GraphNode>[] | Partial<GraphEdge>[]) => void;
  length: number;
}

interface GraphNetwork {
  on: (event: string, cb: (params: ClickParams & { node?: string }) => void) => void;
  setData: (data: { nodes: VisDataSet; edges: VisDataSet }) => void;
  fit: (options?: { animation?: boolean }) => void;
  getConnectedNodes: (nodeId: string) => string[];
  getConnectedEdges: (nodeId: string) => string[];
  focus: (nodeId: string, options?: { scale?: number; animation?: boolean }) => void;
}

interface ClickParams {
  nodes: string[];
}

interface GraphNode {
  id: string;
  label: string;
  title?: string;
  size?: number;
  color?: NodeColor;
  font?: { color: string; size: number; face: string; strokeWidth?: number; strokeColor?: string };
  opacity?: number;
  group?: string;
  _kind?: "session" | "entity";
  _raw?: KnowledgeNode | EntityMeta;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  width?: number;
  color?: { color: string; opacity?: number; highlight?: string };
  opacity?: number;
}

interface NodeColor {
  background: string;
  border: string;
  highlight?: { background: string; border: string };
  hover?: { background: string; border: string };
}

interface EntityMeta {
  key: string;
  label: string;
  sessionIds: string[];
  linkCount: number;
}

type GraphView = "sessions" | "entities";

const PLATFORM_COLORS: Record<Platform, string> = {
  claude: "#d97757",
  chatgpt: "#10a37f",
  gemini: "#4285f4",
};

const CLUSTER_PALETTE = [
  "#e8b84a",
  "#e85a9a",
  "#5a9ae8",
  "#5ae8a0",
  "#c85ae8",
  "#e85a5a",
];

const NORMAL_OPACITY = 1;

let allNodes: KnowledgeNode[] = [];
let filterPlatform: Platform | "all" = "all";
let filterDays: number | "all" = "all";
let graphView: GraphView = "sessions";
let network: GraphNetwork | null = null;
let nodeDataset: VisDataSet | null = null;
let edgeDataset: VisDataSet | null = null;
let selectedId: string | null = null;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

function filteredKnowledgeNodes(): KnowledgeNode[] {
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

function sessionNodeSize(node: KnowledgeNode): number {
  return Math.min(40, Math.sqrt(node.entities.length + node.turnCount) * 5 + 10);
}

function buildSessionGraph(nodes: KnowledgeNode[]): {
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
} {
  const graphNodes: GraphNode[] = nodes.map((n) => ({
    id: n.id,
    label: truncate(n.topic, 28),
    title: `${n.topic}\n${n.entities.join(", ")}`,
    size: sessionNodeSize(n),
    color: {
      background: PLATFORM_COLORS[n.platform],
      border: "#555",
      highlight: { background: PLATFORM_COLORS[n.platform], border: "#fff" },
      hover: { background: PLATFORM_COLORS[n.platform], border: "#fff" },
    },
    font: { color: "#dcddde", size: 11, face: "Inter", strokeWidth: 0 },
    opacity: NORMAL_OPACITY,
    group: n.platform,
    _kind: "session",
    _raw: n,
  }));

  const graphEdges: GraphEdge[] = [];
  let edgeIdx = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const setA = new Set(a.entities.map((e) => e.toLowerCase()));
      const shared = b.entities.filter((e) => setA.has(e.toLowerCase())).length;
      if (shared >= 1) {
        graphEdges.push({
          id: `se${edgeIdx++}`,
          from: a.id,
          to: b.id,
          width: Math.min(shared * 0.8 + 0.5, 4),
          color: { color: "#555555", opacity: 0.6, highlight: "#aaaaaa" },
          opacity: NORMAL_OPACITY,
        });
      }
    }
  }
  return { graphNodes, graphEdges };
}

function buildEntityGraph(nodes: KnowledgeNode[]): {
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  entityMeta: Map<string, EntityMeta>;
} {
  const entityMeta = new Map<string, EntityMeta>();
  const edgeCounts = new Map<string, number>();

  for (const session of nodes) {
    const ents = session.entities
      .map((e) => e.trim())
      .filter(Boolean)
      .map((e) => ({ key: e.toLowerCase(), label: e }));

    for (const { key, label } of ents) {
      const existing = entityMeta.get(key);
      if (existing) {
        existing.sessionIds.push(session.id);
        existing.linkCount = existing.sessionIds.length;
      } else {
        entityMeta.set(key, {
          key,
          label,
          sessionIds: [session.id],
          linkCount: 1,
        });
      }
    }

    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const pair = [ents[i]!.key, ents[j]!.key].sort().join("|");
        edgeCounts.set(pair, (edgeCounts.get(pair) ?? 0) + 1);
      }
    }
  }

  const components = computeComponents(entityMeta, edgeCounts);
  const graphNodes: GraphNode[] = [];

  for (const [key, meta] of entityMeta) {
    const cluster = components.get(key) ?? 0;
    const color = CLUSTER_PALETTE[cluster % CLUSTER_PALETTE.length]!;
    const degree = countDegree(key, edgeCounts);
    graphNodes.push({
      id: `entity:${key}`,
      label: truncate(meta.label, 22),
      title: `${meta.label}\n${meta.linkCount} session(s)`,
      size: Math.min(36, Math.sqrt(degree + meta.linkCount) * 4 + 8),
      color: {
        background: color,
        border: "#444",
        highlight: { background: color, border: "#fff" },
        hover: { background: color, border: "#fff" },
      },
      font: { color: "#dcddde", size: 10, face: "Inter", strokeWidth: 0 },
      opacity: NORMAL_OPACITY,
      group: `cluster-${cluster}`,
      _kind: "entity",
      _raw: meta,
    });
  }

  const graphEdges: GraphEdge[] = [];
  let edgeIdx = 0;
  for (const [pair, weight] of edgeCounts) {
    const [a, b] = pair.split("|");
    if (!a || !b) continue;
    graphEdges.push({
      id: `ee${edgeIdx++}`,
      from: `entity:${a}`,
      to: `entity:${b}`,
      width: Math.min(weight * 0.5 + 0.3, 3),
      color: { color: "#444444", opacity: 0.5, highlight: "#888888" },
      opacity: NORMAL_OPACITY,
    });
  }

  return { graphNodes, graphEdges, entityMeta };
}

function countDegree(entityKey: string, edgeCounts: Map<string, number>): number {
  let degree = 0;
  for (const pair of edgeCounts.keys()) {
    if (pair.includes(entityKey)) degree++;
  }
  return degree;
}

function computeComponents(
  entityMeta: Map<string, EntityMeta>,
  edgeCounts: Map<string, number>
): Map<string, number> {
  const parent = new Map<string, string>();
  for (const key of entityMeta.keys()) parent.set(key, key);

  function find(x: string): string {
    const p = parent.get(x)!;
    if (p !== x) parent.set(x, find(p));
    return parent.get(x)!;
  }

  function union(a: string, b: string): void {
    parent.set(find(a), find(b));
  }

  for (const pair of edgeCounts.keys()) {
    const [a, b] = pair.split("|");
    if (a && b) union(a, b);
  }

  const roots = new Map<string, number>();
  let clusterId = 0;
  const result = new Map<string, number>();
  for (const key of entityMeta.keys()) {
    const root = find(key);
    if (!roots.has(root)) roots.set(root, clusterId++);
    result.set(key, roots.get(root)!);
  }
  return result;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function networkOptions(): Record<string, unknown> {
  return {
    nodes: {
      shape: "dot",
      scaling: { min: 8, max: 44 },
      borderWidth: 1,
      shadow: false,
    },
    edges: {
      smooth: { type: "continuous", roundness: 0.4 },
      selectionWidth: 2,
      hoverWidth: 1.5,
    },
    physics: {
      enabled: true,
      stabilization: { iterations: 180, fit: true },
      barnesHut: {
        gravitationalConstant: -8000,
        centralGravity: 0.15,
        springLength: 140,
        springConstant: 0.04,
        damping: 0.12,
        avoidOverlap: 0.2,
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 80,
      hideEdgesOnDrag: false,
      zoomView: true,
      dragView: true,
      navigationButtons: false,
      keyboard: { enabled: true },
    },
  };
}

function renderGraph(): void {
  const knowledge = filteredKnowledgeNodes();
  const isEmpty = knowledge.length === 0;

  $("empty-graph").classList.toggle("hidden", !isEmpty);
  $("graph-network").style.visibility = isEmpty ? "hidden" : "visible";

  if (isEmpty) {
    updateInsightPanel([], [], new Map());
    return;
  }

  let graphNodes: GraphNode[];
  let graphEdges: GraphEdge[];
  let entityMeta = new Map<string, EntityMeta>();

  if (graphView === "sessions") {
    ({ graphNodes, graphEdges } = buildSessionGraph(knowledge));
  } else {
    const built = buildEntityGraph(knowledge);
    graphNodes = built.graphNodes;
    graphEdges = built.graphEdges;
    entityMeta = built.entityMeta;
  }

  if (!nodeDataset || !edgeDataset) {
    nodeDataset = new vis.DataSet(graphNodes);
    edgeDataset = new vis.DataSet(graphEdges);
    network = new vis.Network(
      $("graph-network"),
      { nodes: nodeDataset, edges: edgeDataset },
      networkOptions()
    );
    bindNetworkEvents();
  } else {
    nodeDataset.clear();
    edgeDataset.clear();
    nodeDataset.add(graphNodes);
    edgeDataset.add(graphEdges);
  }

  updateInsightPanel(knowledge, graphNodes, entityMeta);
  updateFooter(graphNodes.length, graphEdges.length);

  setTimeout(() => network?.fit({ animation: true }), 300);
}

function bindNetworkEvents(): void {
  if (!network) return;

  network.on("click", (params) => {
    if (params.nodes.length) {
      selectedId = params.nodes[0]!;
      showSelection(selectedId);
    } else {
      selectedId = null;
      $("selection-section").classList.add("hidden");
    }
  });
}

function showSelection(nodeId: string): void {
  if (!nodeDataset) return;
  const nodes = nodeDataset.get() as GraphNode[];
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return;

  const section = $("selection-section");
  const detail = $("selection-detail");
  section.classList.remove("hidden");

  if (node._kind === "session" && node._raw && "topic" in node._raw) {
    const raw = node._raw as KnowledgeNode;
    detail.innerHTML = `
      <h3>${escapeHtml(raw.topic)}</h3>
      <p class="meta">${PLATFORM_LABELS[raw.platform]} · ${formatDate(raw.date)} · ${raw.turnCount} turns</p>
      ${listBlock("Entities", raw.entities)}
      ${listBlock("Decisions", raw.decisions)}
      ${listBlock("Open questions", raw.openQuestions)}
    `;
  } else if (node._kind === "entity" && node._raw && "label" in node._raw) {
    const raw = node._raw as EntityMeta;
    const sessions = raw.sessionIds
      .map((id) => allNodes.find((n) => n.id === id))
      .filter(Boolean) as KnowledgeNode[];
    detail.innerHTML = `
      <h3>${escapeHtml(raw.label)}</h3>
      <p class="meta">${raw.linkCount} session(s) · ${sessions.length} linked</p>
      ${listBlock(
        "Sessions",
        sessions.map((s) => truncate(s.topic, 40))
      )}
    `;
  }
}

function listBlock(title: string, items: string[]): string {
  if (!items.length) return "";
  return `<p class="meta" style="margin-top:8px">${title}</p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function updateInsightPanel(
  knowledge: KnowledgeNode[],
  graphNodes: GraphNode[],
  entityMeta: Map<string, EntityMeta>
): void {
  const edgeCount = edgeDataset?.length ?? 0;
  const sessionCount = knowledge.length;
  const entityCount =
    graphView === "entities" ? graphNodes.length : countUniqueEntities(knowledge);

  $("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-value">${sessionCount}</div><div class="stat-label">Sessions</div></div>
    <div class="stat-card"><div class="stat-value">${entityCount}</div><div class="stat-label">Concepts</div></div>
    <div class="stat-card"><div class="stat-value">${graphNodes.length}</div><div class="stat-label">Visible</div></div>
    <div class="stat-card"><div class="stat-value">${edgeCount}</div><div class="stat-label">Links</div></div>
  `;

  if (sessionCount === 0) {
    $("insight-text").textContent =
      "Start chatting with summarisation enabled to grow your graph.";
    $("top-list").innerHTML = "";
    return;
  }

  if (graphView === "sessions") {
    const clustered = edgeCount > sessionCount * 0.3;
    $("insight-text").textContent = clustered
      ? `Your sessions form a connected network — topics overlap across ${sessionCount} conversations. Hover a node to highlight its neighbours.`
      : `You have ${sessionCount} session${sessionCount === 1 ? "" : "s"} with limited overlap. Switch to Concepts for a denser entity map.`;
    renderTopSessions(knowledge);
  } else {
    const clusters = new Set(
      [...entityMeta.values()].map((_, i) => i)
    ).size;
    $("insight-text").textContent = `${entityMeta.size} concepts across ${sessionCount} sessions, grouped into coloured clusters by co-occurrence. Larger nodes appear in more sessions.`;
    renderTopEntities(entityMeta);
    void clusters;
  }
}

function countUniqueEntities(nodes: KnowledgeNode[]): number {
  const set = new Set<string>();
  for (const n of nodes) {
    for (const e of n.entities) {
      const k = e.trim().toLowerCase();
      if (k) set.add(k);
    }
  }
  return set.size;
}

function renderTopSessions(knowledge: KnowledgeNode[]): void {
  const sorted = [...knowledge]
    .sort((a, b) => b.entities.length + b.turnCount - (a.entities.length + a.turnCount))
    .slice(0, 6);
  $("top-list").innerHTML = sorted
    .map(
      (n) =>
        `<li data-id="${n.id}"><span>${escapeHtml(truncate(n.topic, 32))}</span><span class="count">${n.entities.length} ent</span></li>`
    )
    .join("");
  bindTopListClicks();
}

function renderTopEntities(entityMeta: Map<string, EntityMeta>): void {
  const sorted = [...entityMeta.values()]
    .sort((a, b) => b.linkCount - a.linkCount)
    .slice(0, 6);
  $("top-list").innerHTML = sorted
    .map(
      (e) =>
        `<li data-id="entity:${e.key}"><span>${escapeHtml(e.label)}</span><span class="count">${e.linkCount}</span></li>`
    )
    .join("");
  bindTopListClicks();
}

function bindTopListClicks(): void {
  $("top-list").querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      const id = li.getAttribute("data-id");
      if (id && network) {
        network.focus(id, { scale: 1.2, animation: true });
        selectedId = id;
        showSelection(id);
      }
    });
  });
}

function updateFooter(nodeCount: number, edgeCount: number): void {
  const view = graphView === "sessions" ? "Sessions" : "Concepts";
  $("footer-status").textContent = `${view} · ${nodeCount} nodes · ${edgeCount} edges`;
}

function renderFilters(): void {
  const container = $("platform-filters");
  container.innerHTML = "";
  const platforms: Array<Platform | "all"> = ["all", "claude", "chatgpt"];

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

function setGraphView(view: GraphView): void {
  graphView = view;
  $("view-sessions").classList.toggle("active", view === "sessions");
  $("view-entities").classList.toggle("active", view === "entities");
  $("view-sessions").setAttribute("aria-selected", String(view === "sessions"));
  $("view-entities").setAttribute("aria-selected", String(view === "entities"));
  selectedId = null;
  $("selection-section").classList.add("hidden");
  renderGraph();
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

$("view-sessions").addEventListener("click", () => setGraphView("sessions"));
$("view-entities").addEventListener("click", () => setGraphView("entities"));

$("date-filter").addEventListener("change", (e) => {
  const val = (e.target as HTMLSelectElement).value;
  filterDays = val === "all" ? "all" : Number(val);
  renderGraph();
});

$("graph-search").addEventListener("input", (e) => {
  searchQuery = (e.target as HTMLInputElement).value;
});

$("fit-btn").addEventListener("click", () => {
  network?.fit({ animation: true });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.knowledgeNodes) {
    void loadNodes();
  }
});

void loadNodes();
