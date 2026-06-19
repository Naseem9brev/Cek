import type { KnowledgeNode } from "./messaging";

export function sanitizeFilename(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "note"
  );
}

export function nodeFilename(node: KnowledgeNode): string {
  const topic = sanitizeFilename(node.topic);
  const idSlice = node.id.slice(0, 8);
  return `${topic}-${idSlice}.md`;
}

function noteStem(filename: string): string {
  return filename.replace(/\.md$/, "");
}

function yamlScalar(value: string | number | boolean): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (/[:#\n\r"'\\]|^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function yamlStringList(items: string[]): string {
  if (items.length === 0) return "[]";
  return items.map((item) => `  - ${yamlScalar(item)}`).join("\n");
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function findRelatedNodes(
  node: KnowledgeNode,
  allNodes: KnowledgeNode[]
): Array<{ node: KnowledgeNode; sharedEntities: string[] }> {
  const entitySet = new Set(node.entities.map((e) => e.toLowerCase()));
  const related: Array<{ node: KnowledgeNode; sharedEntities: string[] }> = [];

  for (const other of allNodes) {
    if (other.id === node.id) continue;
    const shared = other.entities.filter((e) => entitySet.has(e.toLowerCase()));
    if (shared.length > 0) {
      related.push({ node: other, sharedEntities: shared });
    }
  }

  return related.sort((a, b) => b.sharedEntities.length - a.sharedEntities.length);
}

function buildEntityLinkMap(nodes: KnowledgeNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    const stem = noteStem(nodeFilename(node));
    for (const entity of node.entities) {
      const key = entity.toLowerCase().trim();
      if (!key) continue;
      const topicHit = node.topic.toLowerCase().includes(key);
      if (!map.has(key) || topicHit) {
        map.set(key, stem);
      }
    }
  }
  return map;
}

function entityLink(entity: string, linkMap: Map<string, string>): string {
  const key = entity.toLowerCase().trim();
  const target = linkMap.get(key);
  if (target) return `[[${target}|${entity}]]`;
  return entity;
}

export function nodeToMarkdown(
  node: KnowledgeNode,
  allNodes: KnowledgeNode[] = []
): string {
  const linkMap = buildEntityLinkMap(allNodes);
  const lines: string[] = ["---"];
  lines.push(`id: ${yamlScalar(node.id)}`);
  lines.push(`topic: ${yamlScalar(node.topic)}`);
  lines.push(`platform: ${yamlScalar(node.platform)}`);
  lines.push(`date: ${yamlScalar(formatDate(node.date))}`);
  if (node.workspace) {
    lines.push(`workspace: ${yamlScalar(node.workspace)}`);
  }
  lines.push("entities:");
  lines.push(yamlStringList(node.entities));
  lines.push("decisions:");
  lines.push(yamlStringList(node.decisions));
  lines.push("openQuestions:");
  lines.push(yamlStringList(node.openQuestions));
  lines.push(`turnCount: ${node.turnCount}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${node.topic}`);
  lines.push("");

  if (node.decisions.length > 0) {
    lines.push("## Decisions");
    for (const decision of node.decisions) {
      lines.push(`- ${decision}`);
    }
    lines.push("");
  }

  if (node.openQuestions.length > 0) {
    lines.push("## Open Questions");
    for (const question of node.openQuestions) {
      lines.push(`- ${question}`);
    }
    lines.push("");
  }

  if (node.entities.length > 0) {
    lines.push("## Entities");
    for (const entity of node.entities) {
      lines.push(`- ${entityLink(entity, linkMap)}`);
    }
    lines.push("");
  }

  const related = findRelatedNodes(node, allNodes);
  if (related.length > 0) {
    lines.push("## Related");
    for (const { node: other, sharedEntities } of related) {
      const target = noteStem(nodeFilename(other));
      const via = sharedEntities
        .map((e) => entityLink(e, linkMap))
        .join(", ");
      lines.push(`- [[${target}]] (${via})`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function nodesToMarkdownFiles(
  nodes: KnowledgeNode[]
): Map<string, string> {
  const files = new Map<string, string>();
  for (const node of nodes) {
    files.set(nodeFilename(node), nodeToMarkdown(node, nodes));
  }
  return files;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildStoreZip(files: Map<string, string>): Blob {
  const encodedFiles = new Map<string, Uint8Array>();
  const encoder = new TextEncoder();
  for (const [name, content] of files) {
    encodedFiles.set(name, encoder.encode(content));
  }

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, data] of encodedFiles) {
    const nameBytes = encoder.encode(name);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc32(data), true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint32(18, crc32(data), true);
    cv.setUint32(22, data.length, true);
    cv.setUint32(26, data.length, true);
    cv.setUint16(30, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, encodedFiles.size, true);
  ev.setUint16(10, encodedFiles.size, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob(
    [...localParts, ...centralParts, endRecord] as BlobPart[],
    { type: "application/zip" }
  );
}

export async function buildObsidianZip(
  nodes: KnowledgeNode[]
): Promise<Blob> {
  const files = nodesToMarkdownFiles(nodes);
  return buildStoreZip(files);
}

export function buildObsidianBundle(nodes: KnowledgeNode[]): string {
  return [...nodesToMarkdownFiles(nodes).entries()]
    .map(([filename, content]) => `<!-- ${filename} -->\n${content}`)
    .join("\n---\n\n");
}
