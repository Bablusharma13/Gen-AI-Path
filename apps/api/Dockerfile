# syntax=docker/dockerfile:1.7
# GenPath AI — API and background worker image (same image, different command).
#   docker build -f apps/api/Dockerfile -t genpath-api .
#   API:    docker run genpath-api
#   Worker: docker run genpath-api node dist/worker.js

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/ai-core/package.json packages/ai-core/
RUN pnpm install --frozen-lockfile --filter "@genpath/api..."
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @genpath/api build \
 && pnpm --filter @genpath/api deploy --prod /out

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    CONTENT_DIR=/app/content \
    OBJECT_STORAGE_LOCAL_DIR=/app/.data/uploads
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY content ./content
RUN mkdir -p /app/.data/uploads && chown -R node:node /app/.data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
