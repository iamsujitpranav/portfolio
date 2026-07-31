# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app

ARG NEXT_PUBLIC_SITE_URL=http://localhost:61991
ARG NEXT_PUBLIC_UMAMI_SRC
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
ARG NEXT_PUBLIC_AVATAR_URL
ARG NEXT_PUBLIC_ANIMATIONS_URL
ARG NEXT_PUBLIC_AVATAR_FALLBACK

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_UMAMI_SRC=${NEXT_PUBLIC_UMAMI_SRC} \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=${NEXT_PUBLIC_UMAMI_WEBSITE_ID} \
    NEXT_PUBLIC_AVATAR_URL=${NEXT_PUBLIC_AVATAR_URL} \
    NEXT_PUBLIC_ANIMATIONS_URL=${NEXT_PUBLIC_ANIMATIONS_URL} \
    NEXT_PUBLIC_AVATAR_FALLBACK=${NEXT_PUBLIC_AVATAR_FALLBACK}

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=61991

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 61991

CMD ["node", "server.js"]
