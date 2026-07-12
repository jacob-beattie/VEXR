#!/usr/bin/env bash
# Starts everything needed for local dev: Docker Desktop (if not already running), the local
# Supabase stack, then the Vite dev server. macOS-only (uses `open -a Docker`).
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running — launching Docker Desktop..."
  open -a Docker

  # `docker info` can hang forever if the backend VM is stuck, not just slow — bound each
  # attempt to 5s and give up after ~2 minutes instead of hanging silently.
  attempt=0
  max_attempts=24
  ready=false
  while [ "$attempt" -lt "$max_attempts" ]; do
    docker info >/dev/null 2>&1 &
    check_pid=$!
    for _ in 1 2 3 4 5; do
      kill -0 "$check_pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$check_pid" 2>/dev/null; then
      kill "$check_pid" 2>/dev/null
      wait "$check_pid" 2>/dev/null || true
    elif wait "$check_pid" 2>/dev/null; then
      ready=true
      break
    fi
    attempt=$((attempt + 1))
  done

  if [ "$ready" = true ]; then
    echo "Docker is ready."
  else
    echo "Docker Desktop hasn't responded after ~2 minutes — it's likely stuck, not just still starting."
    echo "Try force-quitting it (Activity Monitor, if there's no menu bar icon to use) and reopening it, then re-run this script."
    exit 1
  fi
else
  echo "Docker is already running."
fi

# A container left over from an interrupted stop can leave this in a confused state — clean up
# and retry once instead of failing outright.
if ! supabase start; then
  echo "supabase start failed — cleaning up and retrying once..."
  supabase stop >/dev/null 2>&1 || true
  supabase start
fi

echo "Starting Vite dev server — Ctrl+C stops just the dev server (Docker/Supabase keep running; run 'npm run dev:down' to stop those too)."
npm run dev
