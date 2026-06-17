import type { MessageCountEntry, Settings } from "./messaging";
import type { Platform, TierLimit, WindowType } from "./constants";
import { getTierLimit } from "./constants";

function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function isWindowExpired(
  entry: MessageCountEntry,
  tierLimit: TierLimit,
  now = Date.now()
): boolean {
  if (tierLimit.windowType === "daily") {
    return entry.windowStart < startOfUtcDay(now);
  }
  return now - entry.windowStart >= tierLimit.windowMs;
}

export function resetWindowStart(
  tierLimit: TierLimit,
  now = Date.now()
): number {
  if (tierLimit.windowType === "daily") {
    return startOfUtcDay(now);
  }
  return now;
}

export function normalizeMessageCount(
  platform: Platform,
  settings: Settings,
  existing: MessageCountEntry | undefined,
  now = Date.now()
): MessageCountEntry {
  const tier = settings.platforms[platform]?.tier ?? "free";
  const tierLimit = getTierLimit(platform, tier);
  if (!tierLimit) {
    return existing ?? {
      count: 0,
      windowStart: now,
      windowType: "daily",
    };
  }

  const entry: MessageCountEntry = existing ?? {
    count: 0,
    windowStart: resetWindowStart(tierLimit, now),
    windowType: tierLimit.windowType as WindowType,
  };

  if (isWindowExpired(entry, tierLimit, now)) {
    return {
      count: 0,
      windowStart: resetWindowStart(tierLimit, now),
      windowType: tierLimit.windowType as WindowType,
    };
  }

  return {
    ...entry,
    windowType: tierLimit.windowType as WindowType,
  };
}

export function remainingMessages(
  platform: Platform,
  settings: Settings,
  entry: MessageCountEntry | undefined
): number | null {
  if (!settings.platforms[platform]?.enabled) return null;
  const tier = settings.platforms[platform].tier;
  const tierLimit = getTierLimit(platform, tier);
  if (!tierLimit) return null;
  const normalized = normalizeMessageCount(platform, settings, entry);
  return Math.max(0, tierLimit.limit - normalized.count);
}

export function resetAllExpiredWindows(
  settings: Settings,
  counts: Partial<Record<Platform, MessageCountEntry>>,
  now = Date.now()
): Partial<Record<Platform, MessageCountEntry>> {
  const platforms: Platform[] = ["claude", "chatgpt"];
  const next = { ...counts };
  for (const platform of platforms) {
    next[platform] = normalizeMessageCount(platform, settings, next[platform], now);
  }
  return next;
}
