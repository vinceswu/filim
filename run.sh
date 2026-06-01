#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-dev}"

case "$MODE" in
    prod|production)
        export ENVIRONMENT=production
        BACKEND_CMD="uvicorn app.main:app --workers 4 --host 0.0.0.0 --port 8000"
        FRONTEND_CMD="npm run build && npm run start"
        KILL_PORTS=true
        MODE_LABEL="production"
        ;;
    dev|development)
        export ENVIRONMENT=development
        BACKEND_CMD="uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
        FRONTEND_CMD="npm run dev"
        KILL_PORTS=false
        MODE_LABEL="development"
        ;;
    *)
        echo "Usage: $0 [dev|prod]" >&2
        exit 1
        ;;
esac

PIDS=()

cleanup() {
    echo "Shutting down..."
    for pid in "${PIDS[@]:-}"; do
        kill "$pid" 2>/dev/null || true
    done
}

trap cleanup INT TERM

if [ "$KILL_PORTS" = true ]; then
    echo "Terminating any existing processes on ports 3000 and 8000..."
    fuser -k 8000/tcp 2>/dev/null || true
    fuser -k 3000/tcp 2>/dev/null || true
fi

(cd backend && python3 -m app.db.init_db)

echo "Starting backend and frontend in $MODE_LABEL mode..."
(cd backend && $BACKEND_CMD) &
PIDS+=($!)

(cd frontend && eval "$FRONTEND_CMD") &
PIDS+=($!)

wait "${PIDS[@]}"
