# Poker

A multiplayer Texas Hold'em game for the browser. Create a table, share the secret link with friends, and play.

**Play money only.** There are no real stakes, accounts or payments.

## Features

- No login: each table has a secret link. Anyone with the link can join.
- Pick a name, sit down, and play No-Limit Texas Hold'em.
- Scoreboard with each player's stack, net result, hands played and won, and biggest pot.
- Server-authoritative: the server owns the deck and validates every action. Hole cards are only sent to their owner.

## Stack

- TypeScript throughout, pnpm workspaces (`packages/engine`, `apps/server`, `apps/web`)
- Rules engine in `packages/engine` (pure functions, shared by server and web)
- Server: Node 22, Express, Socket.IO
- Web: React, Vite, Tailwind CSS, Socket.IO client
- Tests: Vitest

## Development

Requires Node 22 and pnpm 10 (`corepack enable` provides it).

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the game server (port 3000, with watch mode) and Vite (port 5173). Open http://localhost:5173. Vite proxies `/socket.io` to the server.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` compiles the web app into `apps/web/dist`. The server serves that folder, so run it before `pnpm start`:

```sh
pnpm build
pnpm start
```

Then open http://localhost:3000.

## Docker

```sh
docker build -t poker .
docker run --rm -p 3000:3000 poker
```

Then open http://localhost:3000. The container listens on port 3000 and exposes a `/health` endpoint.

## Hosting

The image serves the app and the game API on port 3000, so one tunnel is enough. With [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```sh
cloudflared tunnel --url http://localhost:3000
```

This prints a temporary `*.trycloudflare.com` URL for quick tests. For a permanent address, create a named tunnel in Cloudflare Zero Trust and point its public hostname at `http://localhost:3000`.
