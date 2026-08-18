-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "deposit_requests" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "amount_usd" DECIMAL(20,6) NOT NULL,
    "purpose" TEXT NOT NULL,
    "purpose_metadata" JSONB,
    "deposit_reference" TEXT NOT NULL,
    "treasury_wallet" TEXT NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "tx_hash" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deposit_requests_deposit_reference_key" ON "deposit_requests"("deposit_reference");

-- CreateIndex
CREATE INDEX "deposit_requests_status_expires_at_idx" ON "deposit_requests"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
