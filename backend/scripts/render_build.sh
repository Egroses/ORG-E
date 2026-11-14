#!/usr/bin/env bash
# Render build step, run from the repository root (see backend/render.yaml).
set -euo pipefail

pip install --upgrade pip
pip install -r pipeline/requirements.lock.txt
pip install -r backend/requirements.txt

# The frontend is optional: if it exists and npm is available, build it so the backend serves it.
if [ -f frontend/package.json ] && command -v npm >/dev/null 2>&1; then
    (cd frontend && npm ci && npm run build)
else
    echo "frontend not built (no frontend/package.json or no npm); serving the API only"
fi
