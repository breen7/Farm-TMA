# Farm TMA

Telegram Mini App de granja idle con economía Ad-Pool (recompensas por ver anuncios, referidos multinivel) y retiros en TON/USDT.

- `backend/` — NestJS + Prisma + PostgreSQL + Redis/BullMQ
- `frontend/` — Vite + React + TypeScript + Tailwind, `@telegram-apps/sdk-react` + `@tonconnect/ui-react`

## Requisitos previos

- Node.js 20+ y npm
- Docker Desktop (para PostgreSQL y Redis locales) **o**, si no querés instalar Docker, cuentas gratis en [Supabase](https://supabase.com) (Postgres) y [Upstash](https://upstash.com) (Redis) — ver [alternativa sin Docker](#alternativa-sin-docker-postgresredis-en-la-nube) más abajo.

## Arranque rápido

### 1. Levantar PostgreSQL y Redis

```bash
docker compose up -d
```

Esto levanta Postgres en `localhost:5432` (usuario/clave/DB: `farm`/`farm`/`farm_tma`) y Redis en `localhost:6379`, con volúmenes persistentes. Verificá que ambos estén sanos:

```bash
docker compose ps
```

Si no tenés Docker instalado, saltá directo a la [alternativa sin Docker](#alternativa-sin-docker-postgresredis-en-la-nube) y volvé al paso 2 con tu `.env` ya armado.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

`prisma migrate dev` crea la primera migración real contra la base recién levantada (hasta ahora el schema solo se había validado con `prisma generate`, nunca contra una Postgres viva). El backend queda escuchando en `http://localhost:3000`.

Revisá `backend/.env` antes de arrancar: los valores de Ads/TON/Admin vienen con placeholders (`change-me`, `EQ...`, etc.) que alcanzan para levantar el servidor y probar todo lo que no dependa de la red TON real (ver [Limitaciones](#limitaciones) al final).

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Abre en `http://localhost:5173` (o el siguiente puerto libre que informe Vite). Fuera de Telegram, la firma de `initData` que genera el SDK en modo mock **no es válida** — el backend la va a rechazar. Para probar el flujo real desde el navegador necesitás abrir la app dentro de Telegram (bot en modo Mini App) o usar el script de la siguiente sección para probar el backend directamente.

Al montar, la app llama a `POST /auth/telegram` automáticamente (login/registro real, reenviando el `start_param` si se abrió vía un link de referido) — sin esto ningún endpoint autenticado funcionaría para un usuario nuevo. Para que la tarjeta "Invitá amigos" (pestaña Tareas) genere un link real, configurá `VITE_BOT_USERNAME` y `VITE_MINI_APP_SHORT_NAME` en `frontend/.env` con el username del bot y el short name de la Mini App dados de alta en BotFather.

## Alternativa sin Docker: Postgres/Redis en la nube

Si no querés instalar Docker, podés usar una Postgres de [Supabase](https://supabase.com) y un Redis de [Upstash](https://upstash.com), ambos con tier gratuito. Reemplazá el paso 1 del arranque rápido por esto, y seguí con el paso 2 (backend) normalmente.

### Postgres (Supabase)

1. Creá un proyecto nuevo en Supabase (elegí cualquier región, ej. `sa-east-1`).
2. Andá a **Project Settings → Database → Connection string**. Supabase te muestra el connection string con un placeholder `[YOUR-PASSWORD]` — tenés que **reemplazar todo eso, corchetes incluidos**, por tu contraseña real. Dejar los corchetes puestos (`:[tupassword]@`) es un error común y hace que falle la autenticación.
3. Copiá dos variantes del connection string para `backend/.env`:
   - **Transaction pooler** (puerto `6543`, con `?pgbouncer=true` al final) → pegalo en `DATABASE_URL`.
   - **Session pooler** (puerto `5432`) → pegalo en `DIRECT_URL`.

   Las dos usan la **misma contraseña** — si te quedan distintas, hay un error de tipeo en alguna. `DIRECT_URL` es la que usa `prisma migrate`; sin ella (o con el pooler de transacciones en su lugar) las migraciones fallan o se cuelgan porque PgBouncer en modo transacción no soporta el tipo de conexión que necesita Prisma Migrate.
4. Si tu contraseña tiene caracteres especiales (`@`, `/`, `#`, `%`, `?`, etc.), codificalos como percent-encoding en la URL (por ejemplo `*` → `%2A`) o vas a tener errores de parseo/autenticación. Si podés, generá la contraseña sin caracteres especiales para evitarte el problema directamente.
5. Si te da `P1000: Authentication failed` después de todo esto, no sigas probando variantes a mano — reseteá la contraseña desde **Reset database password** en esa misma pantalla y copiá los connection strings de nuevo (no los retipees).

### Redis (Upstash)

1. Creá una base Redis nueva en Upstash (cualquier región).
2. En la pantalla de la base, copiá la URL de conexión en formato `rediss://default:<token>@<host>:6379` (la da lista para usar, con TLS).
3. Pegala tal cual en `REDIS_URL` en `backend/.env`. No dupliques el nombre de la variable dentro del valor (es decir, `REDIS_URL=rediss://...`, **no** `REDIS_URL=REDIS_URL="rediss://..."` — un error fácil de cometer al copiar y pegar la línea completa desde otro lado).

### Si el puerto 3000 ya está ocupado

Si `npm run start:dev`/`node dist/main.js` no levanta porque otro proceso ya usa el `3000` (pasa seguido si tenés otros proyectos Node corriendo), no hace falta matarlo a ciegas — cambiá el puerto de nuestro backend:

1. En `backend/.env`, `PORT=3001` (o el que esté libre).
2. En `frontend/.env` (copiá `frontend/.env.example` si no existe), `VITE_API_URL=http://localhost:3001`.
3. **Reiniciá el `npm run dev` del frontend** si ya estaba corriendo — Vite solo lee `.env` al arrancar, un cambio en caliente no lo toma.
4. Ajustá el puerto en los ejemplos de `curl` de la sección siguiente.

### Gotcha de Windows: `EPERM` al correr `prisma generate`

Si ves `EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp...' -> '...query_engine-windows.dll.node'`, es porque hay un proceso de Node corriendo que ya cargó el motor de Prisma en memoria (típicamente `nest start --watch` de una corrida anterior) — Windows no deja reemplazar una DLL mientras un proceso la tiene cargada. Parate ese proceso (`Ctrl+C` en su terminal, o identificalo con `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId, CommandLine` en PowerShell y `Stop-Process -Id <pid>`) y volvé a correr `npx prisma generate`.

## Probar el flujo completo

### Generar un `initData` válido para pruebas

`TelegramAuthGuard` exige una firma HMAC-SHA256 hecha con tu `BOT_TOKEN` real — ni el mock del frontend ni un `initData` inventado a mano la pasan. Usá este script (reproduce el mismo algoritmo que valida el backend):

```bash
cd backend
node scripts/generate-test-init-data.js 111111
```

Imprime un `initData` firmado para el usuario de Telegram `111111`. Guardalo en una variable:

```bash
export INIT_DATA=$(node scripts/generate-test-init-data.js 111111)
```

### Auth, granja, tareas, retiros

```bash
# Login / registro
curl -s -X POST "http://localhost:3000/auth/telegram" \
  -H "X-Telegram-Init-Data: $INIT_DATA" | jq

# Estado de la granja (produccion pendiente)
curl -s "http://localhost:3000/farm" -H "X-Telegram-Init-Data: $INIT_DATA" | jq

# Cosechar
curl -s -X POST "http://localhost:3000/farm/collect" -H "X-Telegram-Init-Data: $INIT_DATA" | jq

# Ver inventario
curl -s "http://localhost:3000/farm/inventory" -H "X-Telegram-Init-Data: $INIT_DATA" | jq

# Vender recursos por Coins (nunca Bucks, ver seccion de Limitaciones/diseno abajo)
curl -s -X POST "http://localhost:3000/farm/sell" \
  -H "X-Telegram-Init-Data: $INIT_DATA" -H "Content-Type: application/json" \
  -d '{"resource": "wheat", "quantity": 1}' | jq

# Mejorar capacidad del silo (+500, costo en Coins creciente)
curl -s -X POST "http://localhost:3000/farm/upgrade-storage" -H "X-Telegram-Init-Data: $INIT_DATA" | jq

# Tareas
curl -s "http://localhost:3000/tasks" -H "X-Telegram-Init-Data: $INIT_DATA" | jq

# Solicitar un retiro (USDT)
curl -s -X POST "http://localhost:3000/withdrawals" \
  -H "X-Telegram-Init-Data: $INIT_DATA" \
  -H "Content-Type: application/json" \
  -d '{"amountBucks": 5, "asset": "USDT", "destinationWallet": "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"}' | jq
```

Para simular un segundo usuario que se registra con tu link de referido (y así ver progresar la tarea "Invita a un amigo"):

```bash
export INIT_DATA_2=$(node scripts/generate-test-init-data.js 222222)
curl -s -X POST "http://localhost:3000/auth/telegram?startapp=ref_111111" \
  -H "X-Telegram-Init-Data: $INIT_DATA_2" | jq
```

### Depósitos TON (boost pagado con dinero real)

`POST /deposits/intent` crea una intención `PENDING` con una referencia única y el monto exacto a pagar — nunca se acredita nada solo porque el cliente "dice" que pagó, el backend verifica la transacción real en la wallet de tesorería (comentario + monto, con margen para el forward fee de red) antes de otorgar el efecto:

```bash
curl -s -X POST "http://localhost:3000/deposits/intent" \
  -H "X-Telegram-Init-Data: $INIT_DATA" -H "Content-Type: application/json" \
  -d '{"network": "TON", "purpose": "FARM_BOOST"}' | jq

# Pollear el estado (el frontend hace esto automáticamente tras enviar la tx via TonConnect)
curl -s "http://localhost:3000/deposits/<id>" -H "X-Telegram-Init-Data: $INIT_DATA" | jq
```

En el frontend, el botón "Boost con TON" (pestaña Granja) arma la transacción con `@ton/core` (monto + comentario con la referencia) y se la pide a la wallet conectada via TonConnect. Diseñado para soportar más redes a futuro (`network: 'TON' | 'BSC' | 'TRON'`, campo `String` no enum en `DepositRequest` — agregar una red nueva no debería pedir una migración) — hoy solo TON está implementado.

### Webhook de ads (integración real)

Pensado para que lo llame el **servidor** de la red de anuncios (Adsgram/Monetag), nunca el navegador del usuario — requiere el secreto por red configurado en `.env` (`ADSGRAM_WEBHOOK_SECRET` / `MONETAG_WEBHOOK_SECRET`):

```bash
curl -s -X POST "http://localhost:3000/ads/webhook" \
  -H "X-Webhook-Secret: change-me" \
  -H "Content-Type: application/json" \
  -d '{"telegramUserId": 111111, "eventId": "evt-1", "ecpm": 5, "network": "adsgram", "timestamp": '$(date +%s000)'}' | jq
```

### Simulador de ads (frontend, solo dev)

Mientras no hay cuentas reales de Adsgram/Monetag, el frontend simula la reproducción del anuncio (botón "Ver anuncio" en la vista Granja, cuenta regresiva de 5s) y llama a `POST /ads/simulate`, autenticado como el usuario actual con `X-Telegram-Init-Data` — **no** con el secreto del webhook, que nunca debe llegar al navegador. Se deshabilita solo con `NODE_ENV=production` (`ForbiddenException` si se intenta). El eCPM simulado es configurable con `AD_SIMULATOR_ECPM_USD` (5 USD por defecto).

```bash
curl -s -X POST "http://localhost:3000/ads/simulate" \
  -H "X-Telegram-Init-Data: $INIT_DATA" \
  -H "Content-Type: application/json" \
  -d '{"network": "adsgram"}' | jq
```

Cuando se conecten redes reales, el flujo correcto es: el SDK de la red se encarga de mostrar el anuncio real en el frontend, y **la red llama a `/ads/webhook` desde su propio servidor** para confirmar la vista — el frontend no debe (ni puede, sin el secreto) acreditarse la recompensa a sí mismo.

### Admin (backoffice interno)

Requiere `ADMIN_API_SECRET` de `.env` — **no** usa `X-Telegram-Init-Data`:

```bash
# Salud del pool
curl -s "http://localhost:3000/admin/pool-health" -H "X-Admin-Secret: change-me" | jq

# Retiros pendientes de revision
curl -s "http://localhost:3000/admin/withdrawals?status=RISK_REVIEW" -H "X-Admin-Secret: change-me" | jq

# Aprobar / rechazar (reemplazar :id por el id real)
curl -s -X POST "http://localhost:3000/admin/withdrawals/:id/approve" -H "X-Admin-Secret: change-me" | jq
curl -s -X POST "http://localhost:3000/admin/withdrawals/:id/reject" -H "X-Admin-Secret: change-me" \
  -H "Content-Type: application/json" -d '{"reason": "direccion sospechosa"}' | jq

# Usuarios con riesgo por encima del umbral, o baneados
curl -s "http://localhost:3000/admin/users/suspicious" -H "X-Admin-Secret: change-me" | jq
```

### Verificar el worker de retiros y el sweep de reconciliación

Con `npm run start:dev` corriendo, los logs de Nest muestran `WithdrawalsProcessor` tomando jobs de la cola `withdrawals` a medida que se aprueban/auto-aprueban retiros, y una línea `Reconciliation sweep scheduled every N minute(s)` al arrancar. El sweep (`RECONCILE_SWEEP_INTERVAL_MINUTES`, cada 5 min por defecto) solo actúa sobre retiros en `PROCESSING` hace más de `RECONCILE_STUCK_PROCESSING_MINUTES` (15 min por defecto) — para verlo actuar en desarrollo sin esperar, bajá esas variables en `.env` (por ejemplo a `1`) antes de levantar el backend.

## TODO

- [x] **Devolver `WITHDRAWAL_MIN_USD` a un valor real en producción** — quedó en `2` USD en Railway y en `.env.example` (antes `0.01`, solo para probar un retiro chico contra TON testnet sin acumular 1000 bucks vía el simulador de ads). `backend/.env` local sigue en `0.01` a propósito, para seguir probando cómodo contra testnet.
- [x] Probar el flujo de retiros con `asset: USDT` contra un jetton en testnet — no existe un jetton USDT real en testnet (Tether solo lo desplegó en mainnet), así que se desplegó uno propio de prueba (6 decimales, `backend/scripts/deploy-test-usdt-jetton.js`, vía `@ton-community/assets-sdk`) preminteado a la wallet de tesorería. Encontró un bug real (ver Limitaciones).
- [x] `TonService.sendUsdt`/`sendTon` podían devolver un `txHash` que no correspondía a la transacción de transferencia real (ver Limitaciones) — `confirmAndGetHash` ahora reusa la misma decodificación de `findRecentPayment` para identificar la transacción exacta en vez de asumir "la última transacción de la wallet".
- [x] Controles de seguridad previos al cutover a mainnet: tope diario acumulado por usuario (`WITHDRAWAL_DAILY_LIMIT_USD_PER_USER`, ventana móvil de 24h), interruptor de emergencia (`WITHDRAWALS_PAUSED`) y allow-list de assets habilitados (`WITHDRAWAL_ENABLED_ASSETS`) — los tres implementados en `WithdrawalsService.requestWithdrawal` y verificados con casos reales contra la API (retiro rechazado por asset deshabilitado, por tope diario superado, y por pausa activa). Mainnet debe arrancar con `WITHDRAWAL_ENABLED_ASSETS=USDT` únicamente (`TON_USD_RATE` sigue sin oráculo real, ver Limitaciones).

## Limitaciones

- **TON real (mainnet)**: `TON_HOT_WALLET_MNEMONIC`, `TON_RPC_API_KEY` y `TON_USD_RATE` en `.env.example` son placeholders para producción. El flujo de retiros en TON nativo **sí se probó de punta a punta contra TON testnet** (wallet de tesorería generada localmente con `@ton/crypto`, fondeada vía `@testgiver_ton_bot`, `TON_RPC_API_KEY` de `@tonapibot`) — la transferencia real se confirmó en cadena y se verificó el balance de la wallet destino de forma independiente.
- **USDT/jetton**: probado de punta a punta contra un jetton de prueba desplegado en testnet (ver TODO arriba). **Bug real encontrado y arreglado (1/2)**: `JETTON_GAS_AMOUNT` estaba en `0.05` TON, justo en el límite de lo que exige el chequeo estándar TEP-74 del jetton wallet destino (`msg_value > forward_ton_amount + fwd_count*fwd_fee + 2*gas_consumption() + min_tons_for_storage()`) — el primer intento real abortó con exit code `709` (fondos insuficientes) y la transacción **bounceó sin mover jettons**, pero `WithdrawalsService` la marcó `COMPLETED` igual (bucks debitados, nada entregado) porque `confirmAndGetHash` solo confirmaba que la wallet propia avanzó de seqno, no que la transferencia interna en la jetton wallet haya tenido éxito. Subido a `0.15` TON con margen; reintentado y verificado con balances on-chain reales (tesorería −0.05, destino +0.05 tUSDT exactos). **Bug real encontrado y arreglado (2/2)**: el `txHash` que quedaba guardado en el retiro completado no siempre era el de la transacción de transferencia real — el `confirmAndGetHash` original tomaba "la última transacción de la wallet" tras el envío, y un jetton wallet devuelve el TON de gas sobrante en un mensaje de "excess" que llega *después* y puede ganarle la carrera al polling, quedando ese hash del vuelto (no el de la transferencia) como el registrado — se confirmó reproduciéndolo con una transacción real. Arreglado: `confirmAndGetHash` ahora reusa `TonService.findRecentPayment` (misma decodificación TEP-74 que ya usa el sweep de reconciliación) para identificar la transacción exacta del pago, tanto para TON como para USDT; reintentado y verificado que el hash guardado corresponde a la transacción con el `outMessage` real del transfer, no a la de excess.
- **TonConnect**: `frontend/public/tonconnect-manifest.json` tiene URLs placeholder. Los wallets no pueden alcanzar `localhost`, así que probar la conexión real de wallet requiere un túnel HTTPS (ngrok, cloudflared) y reemplazar esas URLs por el dominio del túnel.
- **Tareas**: son de una sola vez, no se reinician a diario (ver comentario en `backend/src/tasks/tasks.constants.ts`).
- **Reconciliación de retiros**: el sweep busca el pago en las últimas 50 transacciones de la hot wallet (sin paginar) — con mucho volumen de retiros podría no encontrar un pago que sí ocurrió y reembolsar de más (ver comentario en `TonService.findRecentPayment`).
- **Depósitos TON**: misma limitación de las últimas 50 transacciones sin paginar en `findIncomingDeposit`. El flujo completo de verificación **se probó contra testnet real** (transacción real con el comentario correcto, detectada y confirmada automáticamente, boost otorgado) — lo único no probado en este entorno es la conexión real de una wallet vía TonConnect UI (no hay wallet externa disponible en esta máquina para probar ese paso especifico).
- **Controles de seguridad de retiros, alcance de lo implementado**: `WITHDRAWALS_PAUSED` solo bloquea solicitudes NUEVAS (`POST /withdrawals`) — no afecta retiros que ya estaban `QUEUED`/`PROCESSING` antes de activarlo, hay que confirmar la cola vacía aparte. `riskScore` sigue sin calcularse en ningún lado (siempre `0`), así que `WITHDRAWAL_AUTO_APPROVE_MAX_RISK_SCORE` sigue siendo un no-op en la práctica. Tampoco existe todavía un endpoint para banear usuarios (`isBanned` se respeta al pedir un retiro pero nada lo setea vía API) ni un tope agregado diario de la plataforma (solo por-usuario). Ninguno de estos bloquea un lanzamiento de bajo volumen, pero quedan pendientes.
