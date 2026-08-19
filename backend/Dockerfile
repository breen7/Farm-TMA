# Imagen portable: sirve tanto para un VPS (docker run / docker-compose) como
# para Railway/Render/Fly, que saben construir y correr un Dockerfile
# directamente sin config adicional.

FROM node:20-slim AS build
WORKDIR /app
# Prisma necesita libssl para detectar que motor de query engine descargar
# (node:20-slim no lo trae por defecto) - sin esto "prisma generate" falla
# en tiempo de build.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production

# Mismo motivo que en el stage de build: "prisma migrate deploy" y el
# @prisma/client corren en esta imagen en runtime, tambien necesitan libssl.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Railway/Render inyectan su propio $PORT en runtime; main.ts ya lo respeta
# (config.get('PORT') ?? 3000), asi que no hace falta tocar nada aca.
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
