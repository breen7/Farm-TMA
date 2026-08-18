#!/bin/sh
set -e

echo "Aplicando migraciones de Prisma (prisma migrate deploy)..."
npx prisma migrate deploy

echo "Iniciando backend..."
exec node dist/main
