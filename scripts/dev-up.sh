#!/usr/bin/env bash
# Starts everything needed for local dev: Docker Desktop (if not already running), the local
# Supabase stack, then the Vite dev server. macOS-only (uses `open -a Docker`).
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running — launching Docker Desktop..."
  open -a Docker
  until docker info >/dev/null 2>&1; do
    sleep 1
  done
  echo "Docker is ready."
else
  echo "Docker is already running."
fi

supabase start

echo "Starting Vite dev server — Ctrl+C stops just the dev server (Docker/Supabase keep running; run 'npm run dev:down' to stop those too)."
npm run dev
