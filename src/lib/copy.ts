import type { KnowledgeNode } from "./messaging";
import { PLATFORM_LABELS } from "./constants";

/** Human-friendly product copy — keep jargon out of the UI */

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function memoryInsight(node: KnowledgeNode): string {
  if (node.decisions.length) return node.decisions[0]!;
  if (node.entities.length) {
    return node.entities.slice(0, 4).join(" · ");
  }
  return node.topic;
}

export function contextMatchHeadline(node: KnowledgeNode): string {
  const platform = PLATFORM_LABELS[node.platform];
  return `Pick up where you left off with ${platform}`;
}

export function contextMatchPreview(node: KnowledgeNode): string {
  const when = relativeTime(node.date);
  return `You explored “${node.topic}” ${when}.`;
}

export function toastPreview(node: KnowledgeNode): string {
  const insight = memoryInsight(node);
  if (insight !== node.topic) {
    return insight.length > 120 ? `${insight.slice(0, 117)}…` : insight;
  }
  return "";
}
