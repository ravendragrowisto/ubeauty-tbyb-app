-- CreateTable
CREATE TABLE "TBYBConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sampleProductId" TEXT,
    "sampleVariantId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "depositAmount" TEXT NOT NULL DEFAULT '10.00',
    "maxSamplesPerProduct" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "shop" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CustomerSampleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sampleOrderId" TEXT,
    "deferredOrderId" TEXT,
    "contractId" TEXT,
    "trialStartDate" DATETIME,
    "trialEndDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SAMPLE_ORDERED',
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "finalPaymentDue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "shop" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TBYBPaymentTerm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentTermId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "amount" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "shop" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "TBYBConfig_shop_enabled_idx" ON "TBYBConfig"("shop", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "TBYBConfig_shop_productId_key" ON "TBYBConfig"("shop", "productId");

-- CreateIndex
CREATE INDEX "CustomerSampleHistory_shop_customerId_idx" ON "CustomerSampleHistory"("shop", "customerId");

-- CreateIndex
CREATE INDEX "CustomerSampleHistory_shop_status_idx" ON "CustomerSampleHistory"("shop", "status");

-- CreateIndex
CREATE INDEX "CustomerSampleHistory_trialEndDate_idx" ON "CustomerSampleHistory"("trialEndDate");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSampleHistory_shop_customerId_productId_sampleOrderId_key" ON "CustomerSampleHistory"("shop", "customerId", "productId", "sampleOrderId");

-- CreateIndex
CREATE INDEX "TBYBPaymentTerm_shop_dueAt_status_idx" ON "TBYBPaymentTerm"("shop", "dueAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TBYBPaymentTerm_shop_paymentTermId_key" ON "TBYBPaymentTerm"("shop", "paymentTermId");
