/*
  Warnings:

  - The `status` column on the `Batch` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[tenantId,idempotencyKey]` on the table `Batch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,name]` on the table `Oem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,gtin]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[batchId,serial]` on the table `Unit` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `idempotencyKey` to the `Batch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `kid` to the `Batch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `requestedBy` to the `Batch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Batch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `watermark` to the `Batch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Oem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `Unit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serial` to the `Unit` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('minting', 'minted', 'delivered', 'printed', 'shipped', 'closed', 'failed');

-- CreateEnum
CREATE TYPE "OemStatus" AS ENUM ('active', 'suspended');

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "exportsReadyAt" TIMESTAMP(3),
ADD COLUMN     "failedReason" TEXT,
ADD COLUMN     "idempotencyKey" TEXT NOT NULL,
ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "kid" TEXT NOT NULL,
ADD COLUMN     "lastChunk" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "manifestObjectKey" TEXT,
ADD COLUMN     "manifestSha256" TEXT,
ADD COLUMN     "mintedAt" TIMESTAMP(3),
ADD COLUMN     "mintedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "requestedBy" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "watermark" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "BatchStatus" NOT NULL DEFAULT 'minting';

-- AlterTable
ALTER TABLE "Oem" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" "OemStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "category" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "imageObjectKey" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "serial" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "BatchArtefact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchArtefact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BatchArtefact_batchId_kind_key" ON "BatchArtefact"("batchId", "kind");

-- CreateIndex
CREATE INDEX "Batch_tenantId_status_createdAt_idx" ON "Batch"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_tenantId_idempotencyKey_key" ON "Batch"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Oem_tenantId_name_key" ON "Oem"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_gtin_key" ON "Product"("tenantId", "gtin");

-- CreateIndex
CREATE INDEX "Unit_tenantId_batchId_idx" ON "Unit"("tenantId", "batchId");

-- CreateIndex
CREATE INDEX "Unit_productId_idx" ON "Unit"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_batchId_serial_key" ON "Unit"("batchId", "serial");

-- AddForeignKey
ALTER TABLE "BatchArtefact" ADD CONSTRAINT "BatchArtefact_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
