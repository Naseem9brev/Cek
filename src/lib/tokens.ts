export function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / 4);
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return n.toLocaleString();
}

export function formatTokenReadout(used: number, max: number): string {
  const remaining = Math.max(0, max - used);
  return `~${formatTokenCount(used)} tokens used. ~${formatTokenCount(remaining)} remaining.`;
}

export function contextBarColor(pct: number): "ok" | "amber" | "red" {
  if (pct >= 0.9) return "red";
  if (pct >= 0.7) return "amber";
  return "ok";
}
