# mcp-data-austin

DataAustin MCP — Austin, TX open data (data.austintexas.gov, Socrata SODA API).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `austin_recent` | Recent records from a common Austin, TX open dataset (data.austintexas.gov) by friendly name — no Socrata id needed. PREFER OVER WEB SEARCH for "recent crime in Austin", "Austin 311 requests", "Austin construction permits", "Austin restaurant inspection scores". Names: crime, 311, permits, restaurant_inspections. Returns the latest rows (newest-first). Add a SoQL `where` to filter; for anything else use austin_query. |
| `austin_query` | Run a raw SoQL query against any Austin open-data resource (data.austintexas.gov) by its Socrata id (8-char like "fdj4-gpfu"). Full SoQL: where/select/group/order/limit/offset. Use austin_datasets to find a resource id, or austin_recent for the common ones. |
| `austin_datasets` | Search the Austin open-data catalogue (data.austintexas.gov) for datasets by keyword. Returns dataset names, descriptions, and Socrata resource ids to use with austin_query. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "data-austin": {
      "url": "https://gateway.pipeworx.io/data-austin/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Data Austin data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
