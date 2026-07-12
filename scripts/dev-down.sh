#!/usr/bin/env bash
# Stops everything local dev started: the Vite dev server (if still running), the local Supabase
# stack, and Docker Desktop itself — so nothing keeps using RAM/CPU in the background.
# macOS-only (uses `osascript`/`open -a Docker`).
set -euo pipefail

# -i:5173 alone matches any socket on the port (e.g. a browser tab), not just the listener —
# -sTCP:LISTEN restricts to the real server. kill left unquoted so multiple PIDs pass as
# separate args, not one string `kill` would silently reject.
VITE_PID=$(lsof -ti tcp:5173 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$VITE_PID" ]; then
  echo "Stopping Vite dev server (port 5173)..."
  kill $VITE_PID 2>/dev/null || true
fi

echo "Stopping local Supabase stack..."
supabase stop

echo "Quitting Docker Desktop..."
osascript -e 'quit app "Docker"' 2>/dev/null || true

# `quit app` is a request, not a guarantee — verify Docker actually exited before continuing.
attempt=0
max_attempts=20
while pgrep -f "Docker Desktop.app/Contents/MacOS/Docker Desktop --" >/dev/null 2>&1 && [ "$attempt" -lt "$max_attempts" ]; do
  sleep 1
  attempt=$((attempt + 1))
done

if pgrep -f "Docker Desktop.app/Contents/MacOS/Docker Desktop --" >/dev/null 2>&1; then
  # Graceful quit is unreliable — force-kill everything under Docker's own app bundle. Leaves
  # com.docker.vmnetd (root-owned system helper) alone; that's meant to persist across restarts.
  echo "Docker Desktop didn't quit within ${max_attempts}s — force-quitting it..."
  pkill -9 -f "Docker.app/Contents" 2>/dev/null || true
  sleep 2
fi

if pgrep -f "Docker Desktop.app/Contents/MacOS/Docker Desktop --" >/dev/null 2>&1; then
  echo "Docker Desktop is still running even after a force-quit attempt — something unusual is going on; check Activity Monitor manually."
else
  echo "Docker Desktop stopped."
fi

echo "Done."
