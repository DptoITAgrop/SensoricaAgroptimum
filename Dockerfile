# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app

# Para compatibilidad con algunas dependencias nativas
RUN apk add --no-cache libc6-compat

# Copiamos manifests/locks primero para cache
COPY package.json ./
COPY pnpm-lock.yaml* package-lock.json* yarn.lock* ./

# Habilitar corepack (pnpm/yarn)
RUN corepack enable

# Instalar dependencias según lockfile disponible
RUN \
  if [ -f pnpm-lock.yaml ]; then pnpm i --frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build (Next.js)
RUN \
  if [ -f pnpm-lock.yaml ]; then pnpm run build; \
  elif [ -f yarn.lock ]; then yarn build; \
  else npm run build; \
  fi

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8099
ENV HOSTNAME=0.0.0.0

# Copiamos lo necesario para ejecutar
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8099

# Arranque
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "8099", "-H", "0.0.0.0"]
