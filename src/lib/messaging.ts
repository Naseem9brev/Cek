import type { Platform } from "./constants";

export interface PromptEntry {
  id: string;
  platform: Platform;
  text: string;
  timestamp: number;
  sessionId: string;
  charCount: number;
  pinned: boolean;
  tabUrl: string;
  duplicateOf?: string;
  embeddingPending?: boolean;
}

export interface SessionEntry {
  title: string;
  platform: Platform;
  createdAt: number;
  firstPromptId: string;
  titlePending?: boolean;
}

export interface MessageCountEntry {
  count: number;
  windowStart: number;
  windowType: "daily" | "3h" | "5h";
}

export interface ContextUsage {
  tabId: number;
  platform: Platform;
  modelLabel: string;
  estimatedTokens: number;
  maxTokens: number;
  updatedAt: number;
}

export interface GroqSettings {
  apiKey: string;
  enabled: boolean;
  features: {
    semanticSearch: boolean;
    sessionTitles: boolean;
    nearDuplicateDetection: boolean;
    sessionSummarisation: boolean;
  };
  duplicateThreshold: number;
  duplicateAction: "flag" | "skip";
}

export interface Turn {
  turnIndex: number;
  prompt: string;
  response: string;
  timestamp: number;
  partial?: boolean;
}

export interface KnowledgeNode {
  id: string;
  sessionId: string;
  topic: string;
  entities: string[];
  decisions: string[];
  openQuestions: string[];
  platform: Platform;
  date: number;
  turnCount: number;
  searchTokens: string[];
  /** Project/workspace tag for scoped context injection */
  workspace?: string;
}

export interface TurnCapturedPayload {
  platform: Platform;
  sessionId: string;
  turnIndex: number;
  prompt: string;
  response: string;
  partial?: boolean;
}

export interface ContextMatchPayload {
  tabId: number;
  nodeId: string;
  score: number;
}

export interface PendingContextMatch {
  tabId: number;
  node: KnowledgeNode;
  score: number;
  dismissed?: boolean;
}

export interface PlatformSettings {
  enabled: boolean;
  tier: string;
}

export interface Settings {
  schemaVersion: number;
  platforms: {
    claude: PlatformSettings;
    chatgpt: PlatformSettings;
    gemini: PlatformSettings;
  };
  groq: GroqSettings;
  workspaces: string[];
  activeWorkspace: string | null;
  showOnPageBadge?: boolean;
  debugMode?: boolean;
  setupComplete?: boolean;
}

export interface PromptCapturedPayload {
  platform: Platform;
  text: string;
  sessionId: string;
  tabUrl: string;
  turnIndex: number;
}

export interface ContextUpdatedPayload {
  platform: Platform;
  modelLabel: string;
  charCount: number;
}

export type BackgroundMessage =
  | { type: "PROMPT_CAPTURED"; payload: PromptCapturedPayload }
  | { type: "TURN_CAPTURED"; payload: TurnCapturedPayload }
  | { type: "CONTEXT_UPDATED"; payload: ContextUpdatedPayload }
  | { type: "CONTEXT_MATCH_FOUND"; payload: ContextMatchPayload }
  | { type: "DISMISS_CONTEXT_MATCH"; tabId: number }
  | { type: "INJECT_CONTEXT"; tabId: number; nodeId: string }
  | { type: "SEMANTIC_SEARCH"; query: string }
  | { type: "GET_STATE" }
  | { type: "GET_KNOWLEDGE_NODES" }
  | { type: "UPDATE_PROMPT"; id: string; pinned?: boolean; deleted?: boolean }
  | { type: "EXPORT_PINNED" }
  | { type: "EXPORT_KNOWLEDGE_NODES" }
  | { type: "SCORE_CONTEXT_MATCH"; prompt: string; workspace?: string | null };

export type BackgroundResponse =
  | { ok: true; promptId?: string; skipped?: boolean; duplicateOf?: string }
  | { ok: true; results?: Array<{ id: string; score: number }> }
  | { ok: true; state?: AppState }
  | { ok: true; nodes?: KnowledgeNode[] }
  | { ok: true; pendingMatch?: PendingContextMatch | null }
  | { ok: true; data?: string }
  | { ok: true; match?: { node: KnowledgeNode; score: number } | null }
  | { ok: false; error: string };

export interface AppState {
  settings: Settings;
  prompts: PromptEntry[];
  sessions: Record<string, SessionEntry>;
  messageCounts: Partial<Record<Platform, MessageCountEntry>>;
  contextUsage: ContextUsage | null;
  knowledgeNodes: KnowledgeNode[];
  pendingContextMatch: PendingContextMatch | null;
}

export function sendBackgroundMessage(
  message: BackgroundMessage
): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}