# --- deps: install node_modules in its own cached layer ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- builder: compile the Next.js production build ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# IMPORTANT: NEXT_PUBLIC_* vars are baked into the client bundle at BUILD
# time. This must be the URL the user's BROWSER can reach
# (http://localhost:8000), never the internal Docker network hostname
# (http://backend:8000) — the browser has no idea that hostname exists.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# --- runner: minimal image to actually serve the app ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000
# Railway injects $PORT; Next.js respects the PORT env var natively.
ENV PORT=3000
CMD ["npm", "run", "start"]
