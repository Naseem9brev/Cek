#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  formatContextInjection,
  searchMemory,
  summarizeNode,
} from "./memory-search.js";
import { getNodes, resolveMemoryPath } from "./memory-store.js";
import type { KnowledgeNode, Platform } from "./types.js";

const server = new Server(
  { name: "cek", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

function filterNodes(
  nodes: KnowledgeNode[],
  workspace?: string,
  platform?: string
): KnowledgeNode[] {
  let result = nodes;
  if (workspace) {
    result = result.filter((n) => n.workspace === workspace);
  }
  if (platform) {
    result = result.filter((n) => n.platform === platform);
  }
  return result;
}

function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_memory",
      description:
        "Search Cek knowledge nodes by keyword scoring on topic, entities, and decisions.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          workspace: {
            type: "string",
            description: "Optional workspace filter",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_memory_node",
      description: "Get a full knowledge node by id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Node id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_memory_nodes",
      description: "List knowledge node summaries with optional filters.",
      inputSchema: {
        type: "object",
        properties: {
          workspace: { type: "string", description: "Filter by workspace" },
          platform: {
            type: "string",
            enum: ["claude", "chatgpt", "gemini"],
            description: "Filter by platform",
          },
        },
      },
    },
    {
      name: "format_context_for_injection",
      description:
        "Format a node (by id or search query) as a context injection block for the IDE.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Node id" },
          query: {
            type: "string",
            description: "Search query (uses best match if id omitted)",
          },
          workspace: {
            type: "string",
            description: "Optional workspace filter when using query",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const nodes = getNodes();
  const args = request.params.arguments ?? {};

  switch (request.params.name) {
    case "search_memory": {
      const query = String(args.query ?? "");
      const workspace =
        typeof args.workspace === "string" ? args.workspace : undefined;
      const matches = searchMemory(query, nodes, workspace);
      return textContent(
        JSON.stringify(
          matches.map((m) => ({
            id: m.node.id,
            topic: m.node.topic,
            score: m.score,
            platform: m.node.platform,
            workspace: m.node.workspace,
            date: m.node.date,
          })),
          null,
          2
        )
      );
    }

    case "get_memory_node": {
      const id = String(args.id ?? "");
      const node = nodes.find((n) => n.id === id);
      if (!node) {
        return textContent(JSON.stringify({ error: "Node not found" }));
      }
      return textContent(JSON.stringify(node, null, 2));
    }

    case "list_memory_nodes": {
      const workspace =
        typeof args.workspace === "string" ? args.workspace : undefined;
      const platform =
        typeof args.platform === "string"
          ? (args.platform as Platform)
          : undefined;
      const filtered = filterNodes(nodes, workspace, platform);
      return textContent(
        JSON.stringify(filtered.map(summarizeNode), null, 2)
      );
    }

    case "format_context_for_injection": {
      let node: KnowledgeNode | undefined;
      const id = typeof args.id === "string" ? args.id : undefined;
      if (id) {
        node = nodes.find((n) => n.id === id);
      } else if (typeof args.query === "string" && args.query) {
        const workspace =
          typeof args.workspace === "string" ? args.workspace : undefined;
        const matches = searchMemory(args.query, nodes, workspace);
        node = matches[0]?.node;
      }
      if (!node) {
        return textContent(
          JSON.stringify({ error: "No matching node found" })
        );
      }
      return textContent(formatContextInjection(node));
    }

    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const nodes = getNodes();
  return {
    resources: [
      {
        uri: "memory://nodes",
        name: "All knowledge nodes",
        description: `Summary list of ${nodes.length} Cek memory nodes`,
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri !== "memory://nodes") {
    throw new Error(`Unknown resource: ${request.params.uri}`);
  }
  const nodes = getNodes();
  return {
    contents: [
      {
        uri: "memory://nodes",
        mimeType: "application/json",
        text: JSON.stringify(nodes.map(summarizeNode), null, 2),
      },
    ],
  };
});

async function main(): Promise<void> {
  const path = resolveMemoryPath();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`cek MCP server reading memory from ${path}`);
}

main().catch((err) => {
  console.error("cek MCP server failed:", err);
  process.exit(1);
});
