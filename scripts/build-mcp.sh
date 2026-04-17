#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../mcp-servers/dlpx-dc"
npm install
npm run build
