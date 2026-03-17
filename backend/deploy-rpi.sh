#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.rpi.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is not installed. Install Docker first."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[ERROR] Docker Compose plugin is missing. Install docker-compose-plugin."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[INFO] Created .env from .env.example"
  echo "[ACTION REQUIRED] Update backend/.env with a secure DJANGO_SECRET_KEY and GEMINI_API_KEY, then re-run."
  exit 1
fi

echo "[1/5] Building backend image..."
docker compose -f "$COMPOSE_FILE" build

echo "[2/5] Running database migrations..."
docker compose -f "$COMPOSE_FILE" run --rm backend python manage.py migrate

echo "[3/5] Running Django system checks..."
docker compose -f "$COMPOSE_FILE" run --rm backend python manage.py check

echo "[4/5] Starting backend service..."
docker compose -f "$COMPOSE_FILE" up -d

echo "[5/5] Current service status"
docker compose -f "$COMPOSE_FILE" ps

echo
echo "Backend deployed on port ${BACKEND_PORT:-8000}."
echo "Open: http://<raspberry-pi-ip>:${BACKEND_PORT:-8000}/api/v1/dashboard/today/"
echo
echo "Optional: create admin user"
echo "docker compose -f $COMPOSE_FILE run --rm backend python manage.py createsuperuser"
