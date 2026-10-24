# Request worker

Players suggest changes in the game's "Pedidos" window; the admin (`REQUESTS_ADMIN_EMAIL`) approves them. This worker
then runs Claude Code in a sandbox container to implement the request, verifies typecheck, tests and build in a
fresh sandbox, opens a draft PR and posts phone and desktop full-page screenshots back to the request. When the admin
approves the preview, it merges the PR and redeploys once nobody is playing, rolling back if the new container is not
healthy.

## Pieces

- `worker.mjs`: host process (needs Docker and an authenticated `gh`). Talks to the game's internal API on
  `127.0.0.1:3101`, which the game serves only when `WORKER_TOKEN` is set.
- `Dockerfile`: sandbox image (`jogatina-agent`) with Claude Code, pnpm and Playwright. Only the work clone is
  mounted; the agent gets nothing but its own `CLAUDE_CODE_OAUTH_TOKEN`.
- `shoot.mjs`: runs in the sandbox, starts the app in dev mode and saves the screenshots.
- `deploy.sh`: rebuilds the game from `origin/main` and swaps the container with rollback.

## Install on the VPS

```bash
docker build -t jogatina-agent:latest tools/request-worker
mkdir -p ~/apps/jogatina-worker/app && cp tools/request-worker/*.{mjs,sh} ~/apps/jogatina-worker/app/
# worker.env: WORKER_TOKEN=..., REQUESTS_ADMIN_EMAIL=...   (chmod 600)
# agent.env:  CLAUDE_CODE_OAUTH_TOKEN=... from `claude setup-token`   (chmod 600)
sudo cp tools/request-worker/jogatina-worker.service /etc/systemd/system/
sudo systemctl enable --now jogatina-worker
```

Model and effort: `AGENT_MODEL` (default `claude-sonnet-5-5`) and `AGENT_EFFORT` (default `medium`) in `worker.env`.
