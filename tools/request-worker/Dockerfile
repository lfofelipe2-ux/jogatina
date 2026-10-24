# Sandbox for the request worker: the coding agent and the preview screenshots run here, with only the
# work clone mounted. No game secrets, no Docker socket, no push credentials.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
RUN npm install -g @anthropic-ai/claude-code@2.1.307 pnpm@10.28.0 playwright@1.63.0 && npm cache clean --force
ENV NODE_PATH=/usr/lib/node_modules
COPY shoot.mjs /opt/worker/shoot.mjs
# pwuser has uid 1001, the same as the host user that owns the work clone.
USER pwuser
WORKDIR /repo
