FROM node:22-alpine AS builder

WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV PRISMA_ENGINES_MIRROR=https://npmmirror.com/mirrors/prisma
RUN npm install --global pnpm@11.13.1 --registry=${NPM_REGISTRY}
COPY . .
RUN pnpm install --frozen-lockfile --registry=${NPM_REGISTRY}
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_MODE=points
RUN pnpm --filter @poker/web... build

FROM node:22-alpine AS runtime

WORKDIR /app
RUN addgroup --system poker && adduser --system --ingroup poker poker
ENV NODE_ENV=production
ENV APP_MODE=points
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder --chown=poker:poker /app /app
USER poker
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.mjs"]
