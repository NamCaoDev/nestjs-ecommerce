# syntax=docker/dockerfile:1.7
#
# inventory-service image. Build from the repository root (the build context is the Nx workspace):
#   docker build -f apps/inventory-service/Dockerfile -t inventory-service .
#   docker build -f apps/inventory-service/Dockerfile --target migrate -t inventory-service-migrate .
#
# Stages:
#   build    installs the workspace, generates the Prisma client, bundles the app and prunes dependencies
#   migrate  runs `prisma migrate deploy` (one-off job before rolling out the app)
#   runtime  production image: bundle + production node_modules only, non-root user

ARG NODE_VERSION=24.19.0

FROM node:${NODE_VERSION}-slim AS build
# OpenSSL is required by the Prisma schema engine used by `prisma migrate deploy` (migrate stage).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
ENV NX_DAEMON=false \
    NX_NO_CLOUD=true \
    NX_SKIP_NX_CACHE=true \
    CI=true
COPY . .
RUN npm ci --no-audit --no-fund
# prune depends on build, which depends on prisma-generate.
RUN npx nx run inventory-service:prune --configuration=production

FROM build AS migrate
WORKDIR /workspace/apps/inventory-service
# DATABASE_URL is provided at run time.
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=3200
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/inventory-service/dist/package.json /workspace/apps/inventory-service/dist/package-lock.json ./
COPY --from=build --chown=node:node /workspace/apps/inventory-service/dist/workspace_modules ./workspace_modules
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# Bundle and its assets (proto, Lua scripts) resolved next to main.js.
COPY --from=build --chown=node:node /workspace/apps/inventory-service/dist/ ./
USER node
EXPOSE 3200
# gRPC (inventory.v1.InventoryService)
EXPOSE 50051
# Worker-only containers (HTTP_ENABLED=false) open no port and report healthy.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "if (process.env.HTTP_ENABLED === 'false') process.exit(0); fetch('http://localhost:3200/api/admin/test').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "main.js"]
