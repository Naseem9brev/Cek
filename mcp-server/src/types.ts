export type Platform = "claude" | "chatgpt" | "gemini";

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
  workspace?: string;
}

export interface McpExportPayload {
  version: number;
  exportedAt: string;
  nodes: KnowledgeNode[];
  nodeEmbeddings?: Record<string, number[]>;
}
