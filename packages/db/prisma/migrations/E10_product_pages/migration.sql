-- E10 — Product Pages & Page Builder: ProductPage, ProductPageVersion, PageMediaAsset.
-- Hand-written (not `prisma migrate dev`) because this database also carries
-- E13's raw-SQL-only `audit_chain_head` table, which has no Prisma model and
-- would otherwise show up as a spurious DROP in an auto-generated diff.

-- CreateEnum
CREATE TYPE "ProductPageStatus" AS ENUM ('draft', 'published', 'unpublished');

-- CreateTable
CREATE TABLE "ProductPage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ProductPageStatus" NOT NULL DEFAULT 'draft',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "draftTheme" JSONB NOT NULL,
    "draftBlocks" JSONB NOT NULL,
    "draftSeo" JSONB NOT NULL,
    "draftUpdatedAt" TIMESTAMP(3) NOT NULL,
    "publishedVersionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPageVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productPageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "theme" JSONB NOT NULL,
    "blocks" JSONB NOT NULL,
    "seo" JSONB NOT NULL,
    "changeNote" TEXT,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageMediaAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productPageId" TEXT,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "blurDataUrl" TEXT NOT NULL,
    "variants" JSONB NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductPage_productId_key" ON "ProductPage"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPage_publishedVersionId_key" ON "ProductPage"("publishedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPage_tenantId_slug_key" ON "ProductPage"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "ProductPage_tenantId_status_idx" ON "ProductPage"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPageVersion_productPageId_version_key" ON "ProductPageVersion"("productPageId", "version");

-- CreateIndex
CREATE INDEX "ProductPageVersion_tenantId_productPageId_publishedAt_idx" ON "ProductPageVersion"("tenantId", "productPageId", "publishedAt");

-- CreateIndex
CREATE INDEX "PageMediaAsset_tenantId_productPageId_idx" ON "PageMediaAsset"("tenantId", "productPageId");

-- AddForeignKey
ALTER TABLE "ProductPageVersion" ADD CONSTRAINT "ProductPageVersion_productPageId_fkey" FOREIGN KEY ("productPageId") REFERENCES "ProductPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
