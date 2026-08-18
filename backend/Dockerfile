# Imagen portable: sirve tanto para un VPS (docker run / docker-compose) como
# para Railway/Render/Fly, que saben construir y correr un Dockerfile
# directamente sin config adicional.

FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production

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
