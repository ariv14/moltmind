#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeDb } from "./db.js";

const server = new McpServer({
  name: "moltmind",
  version: "0.1.0",
});

server.tool(
  "mm_status",
  "Check if MoltMind is running and get basic server info.",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "MoltMind is running",
            version: "0.1.0",
          }),
        },
      ],
    };
  }
);

function shutdown(): void {
  console.error("MoltMind shutting down");
  closeDb();
  process.exit(0);
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.error("MoltMind MCP server started");
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
