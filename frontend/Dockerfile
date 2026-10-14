# ایمیج تولیدی فرانت (Next.js standalone).
#
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://partmachine.example/api/v1 -t partmachine-frontend .
#
# NEXT_PUBLIC_API_URL هنگام build در کد مرورگر جاسازی می‌شود و الزامی است. نشست کوکی‌دار
# فقط وقتی کار می‌کند که فرانت و API هم‌سایت باشند (مثلاً app. و api. زیر یک دامنه).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "ERROR: build arg NEXT_PUBLIC_API_URL is required" >&2 && exit 1)
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
