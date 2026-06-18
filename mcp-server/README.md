# Cek MCP Server

MCP bridge that reads Cek's exported memory JSON so Cursor (and other MCP clients) can search session knowledge captured by the Chrome extension.

## Memory file

The extension exports `memory-export.json`. Copy it to the default path or set `CEK_MEMORY_PATH`:

- Default: `~/.cek/memory-export.json`
- Override: `CEK_MEMORY_PATH` environment variable

When **Auto-sync for MCP** is enabled in Cek settings, the extension downloads `memory-export.json` after each new knowledge node. Move or copy that file into `~/.cek/` (or your configured path).

## Build

From the repo root:

```bash
npm run build:mcp
```

Or from this directory:

```bash
npm install
npm run build
```

## Cursor setup

Add to `.cursor/mcp.json` (global or project):

```json
{
  "mcpServers": {
    "cek": {
      "command": "node",
      "args": ["/path/to/Cek/mcp-server/dist/index.js"],
      "env": {
        "CEK_MEMORY_PATH": "/Users/you/.cek/memory-export.json"
      }
    }
  }
}
```

Replace `/path/to/Cek` with your clone path and adjust `CEK_MEMORY_PATH` if needed.

Restart Cursor after saving. The server exposes:

| Tool | Description |
|------|-------------|
| `search_memory` | Keyword search with scoring on topic, entities, decisions |
| `get_memory_node` | Full node by id |
| `list_memory_nodes` | Summary list with optional workspace/platform filters |
| `format_context_for_injection` | Formatted injection block for IDE context |

Resource: `memory://nodes` — JSON summary of all nodes.

## Development

```bash
cd mcp-server
npm install
npm run build
node dist/index.js
```

The server uses stdio transport and logs the resolved memory path to stderr on startup.
