FROM node:22-alpine AS builder

WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV PRISMA_ENGINES_MIRROR=https://npmmirror.com/mirrors/prisma
RUN npm install --global pnpm@11.13.1 --registry=${NPM_REGISTRY}
COPY . .
RUN pnpm install --frozen-lockfile --registry=${NPM_REGISTRY}
RUN pnpm --filter @poker/game-server... build

FROM node:22-alpine AS runtime

WORKDIR /app
RUN addgroup --system poker && adduser --system --ingroup poker poker
ENV NODE_ENV=production
ENV APP_MODE=points
ENV PORT=3001
COPY --from=builder --chown=poker:poker /app /app
USER poker
EXPOSE 3001
CMD ["node", "apps/game-server/dist/apps/game-server/src/main.js"]
