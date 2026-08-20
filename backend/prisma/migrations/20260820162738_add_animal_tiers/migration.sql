-- AlterEnum
ALTER TYPE "TxType" ADD VALUE 'SINK_ANIMAL_UPGRADE';

-- AlterTable
ALTER TABLE "farms" ADD COLUMN     "animal_tiers" JSONB NOT NULL DEFAULT '{"eggs":1,"milk":1}';
