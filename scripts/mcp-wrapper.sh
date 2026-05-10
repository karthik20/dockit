#!/usr/bin/env bash
# Dockit MCP Server Wrapper
# Usage: ./scripts/mcp-wrapper.sh
# This script ensures the correct Node.js version and environment are used
# when running the Dockit MCP server via stdio transport.

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Use fnm Node 24 if available, otherwise nvm, otherwise system node
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell bash)" >/dev/null 2>&1
  fnm use 24 >/dev/null 2>&1 || true
elif [ -d "$HOME/.nvm" ]; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm use 24 >/dev/null 2>&1 || true
fi

cd "$PROJECT_ROOT" || exit 1

# Run MCP server
# Set DOCKIT_MCP_HTTP_PORT=3456 to enable HTTP bridge instead of stdio
if [ -n "$DOCKIT_MCP_HTTP_PORT" ]; then
  exec npx tsx apps/server/src/mcp.ts "$DOCKIT_MCP_HTTP_PORT"
else
  exec npx tsx apps/server/src/mcp.ts
fi

# Ensure npx and node are in PATH
if [ -d "$HOME/.nvm/versions/node/v24.15.0/bin" ]; then
  export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
fi

cd "$PROJECT_ROOT" || exit 1

# Run MCP server
# Set DOCKIT_MCP_HTTP_PORT=3456 to enable HTTP bridge instead of stdio
if [ -n "$DOCKIT_MCP_HTTP_PORT" ]; then
  exec npx tsx apps/server/src/mcp-http.ts "$DOCKIT_MCP_HTTP_PORT"
else
  exec npx tsx apps/server/src/mcp.ts
fi
