#!/usr/bin/env bash
# Rebuilds the game from origin/main and swaps the container, rolling back if the new one is not healthy.
# Needs REQUESTS_ADMIN_EMAIL and WORKER_TOKEN in the environment (the worker passes its own).
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/apps/jogatina}"
INTERNAL_BIND="${INTERNAL_BIND:-127.0.0.1:3101}"
: "${REQUESTS_ADMIN_EMAIL:?}" "${WORKER_TOKEN:?}"

cd "$DEPLOY_DIR"
git fetch -q origin
git checkout -q --detach origin/main
commit=$(git rev-parse --short HEAD)
docker build -q -t jogatina:next . >/dev/null

docker rm -f jogatina-prev >/dev/null 2>&1 || true
docker image inspect jogatina:release >/dev/null 2>&1 && docker tag jogatina:release jogatina:prev-auto
docker stop jogatina >/dev/null
docker rename jogatina jogatina-prev

run_new() {
  docker run -d --name jogatina --network caddy_net --restart unless-stopped \
    -v jogatina-data:/data --env-file "$DEPLOY_DIR/.env" \
    -e LEDGER_DB_PATH=/data/ledger.db -e TRUST_PROXY_EMAIL=1 \
    -e REQUESTS_ADMIN_EMAIL -e WORKER_TOKEN \
    -p "$INTERNAL_BIND:3001" jogatina:next >/dev/null
}

healthy() {
  for _ in $(seq 1 45); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' jogatina 2>/dev/null)" = healthy ] && return 0
    sleep 2
  done
  return 1
}

if run_new && healthy; then
  docker tag jogatina:next jogatina:release
  docker image prune -f >/dev/null
  echo "deployed $commit"
else
  docker logs --tail 30 jogatina 2>&1 | sed 's/^/[new] /' >&2 || true
  docker rm -f jogatina >/dev/null 2>&1 || true
  docker rename jogatina-prev jogatina
  docker start jogatina >/dev/null
  echo "rolled back: $commit was not healthy" >&2
  exit 1
fi
