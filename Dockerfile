FROM node:22-alpine AS build
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @poker/web build

FROM node:22-alpine AS runtime
ENV COREPACK_HOME=/opt/corepack NODE_ENV=production PORT=3000
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000/health || exit 1
CMD ["pnpm", "--filter", "@poker/server", "start"]
