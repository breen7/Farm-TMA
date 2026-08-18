-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('AD_REWARD', 'REFERRAL_COMMISSION', 'TASK_REWARD', 'SINK_BOOST', 'SINK_STORAGE', 'SINK_ROULETTE', 'WITHDRAWAL', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TxCurrency" AS ENUM ('COINS', 'BUCKS');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'QUEUED', 'RISK_REVIEW', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CountryTier" AS ENUM ('T1', 'T2', 'T3');

-- CreateEnum
CREATE TYPE "ImpressionStatus" AS ENUM ('CONFIRMED', 'SUSPECT', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "language_code" TEXT,
    "country_tier" "CountryTier" NOT NULL DEFAULT 'T3',
    "ip_hash" TEXT,
    "device_fp_hash" TEXT,
    "referred_by" BIGINT,
    "ton_wallet" TEXT,
    "coins_balance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "bucks_balance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "storage_capacity" DECIMAL(20,4) NOT NULL DEFAULT 1000,
    "production_rate" JSONB NOT NULL DEFAULT '{"wheat":1,"eggs":0.5,"milk":0.2}',
    "boost_expires_at" TIMESTAMP(3),
    "last_collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "server_seed" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventories" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "resource" TEXT NOT NULL,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_impressions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "network" TEXT NOT NULL,
    "placement_id" TEXT,
    "ecpm_used_usd" DECIMAL(10,4) NOT NULL,
    "reward_bucks" DECIMAL(20,6) NOT NULL,
    "webhook_signature" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "ImpressionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "type" "TxType" NOT NULL,
    "currency" "TxCurrency" NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "balance_after" DECIMAL(20,6) NOT NULL,
    "ref_id" BIGINT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_tree" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "ancestor_id" BIGINT NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "referral_tree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "amount_bucks" DECIMAL(20,6) NOT NULL,
    "amount_usd" DECIMAL(20,6) NOT NULL,
    "asset" TEXT NOT NULL,
    "destination_wallet" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "risk_score_snapshot" INTEGER NOT NULL,
    "tx_hash" TEXT,
    "pool_balance_snapshot" DECIMAL(20,6),
    "processing_started_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecpm_rates" (
    "id" BIGSERIAL NOT NULL,
    "network" TEXT NOT NULL,
    "country_tier" "CountryTier" NOT NULL,
    "ecpm_usd" DECIMAL(10,4) NOT NULL,
    "alpha" DECIMAL(4,3) NOT NULL DEFAULT 0.65,
    "beta" DECIMAL(4,3) NOT NULL DEFAULT 0.90,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecpm_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_task_progress" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "task_code" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE INDEX "users_ip_hash_idx" ON "users"("ip_hash");

-- CreateIndex
CREATE UNIQUE INDEX "farms_user_id_key" ON "farms"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventories_user_id_resource_key" ON "inventories"("user_id", "resource");

-- CreateIndex
CREATE UNIQUE INDEX "ad_impressions_idempotency_key_key" ON "ad_impressions"("idempotency_key");

-- CreateIndex
CREATE INDEX "ad_impressions_user_id_created_at_idx" ON "ad_impressions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_created_at_idx" ON "transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "referral_tree_ancestor_id_depth_idx" ON "referral_tree"("ancestor_id", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "referral_tree_user_id_ancestor_id_key" ON "referral_tree"("user_id", "ancestor_id");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ecpm_rates_network_country_tier_key" ON "ecpm_rates"("network", "country_tier");

-- CreateIndex
CREATE UNIQUE INDEX "user_task_progress_user_id_task_code_key" ON "user_task_progress"("user_id", "task_code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_tree" ADD CONSTRAINT "referral_tree_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_tree" ADD CONSTRAINT "referral_tree_ancestor_id_fkey" FOREIGN KEY ("ancestor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_task_progress" ADD CONSTRAINT "user_task_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
