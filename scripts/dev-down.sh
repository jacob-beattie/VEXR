#!/usr/bin/env bash
# Stops everything local dev started: the Vite dev server (if still running), the local Supabase
# stack, and Docker Desktop itself — so nothing keeps using RAM/CPU in the background.
# macOS-only (uses `osascript`/`open -a Docker`).
set -euo pipefail

VITE_PID=$(lsof -ti:5173 2>/dev/null || true)
if [ -n "$VITE_PID" ]; then
  echo "Stopping Vite dev server (port 5173)..."
  kill "$VITE_PID" 2>/dev/null || true
fi

echo "Stopping local Supabase stack..."
supabase stop

echo "Quitting Docker Desktop..."
osascript -e 'quit app "Docker"' 2>/dev/null || true

echo "Done — nothing local dev started should still be running."
