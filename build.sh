#!/usr/bin/env bash
# Build all MCP servers shipped by this marketplace.
# Run once after cloning, and again after pulling changes.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building dlpx-dc MCP server"
cd plugins/dlpx-dc/mcp-servers/dlpx-dc
npm install
npm run build
