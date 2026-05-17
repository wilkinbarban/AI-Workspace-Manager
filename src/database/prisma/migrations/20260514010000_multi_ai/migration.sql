-- Redefine AIProvider with multi-provider configuration fields.
ALTER TABLE "AIProvider" ADD COLUMN "authType" TEXT NOT NULL DEFAULT 'bearer';
ALTER TABLE "AIProvider" ADD COLUMN "maskedSecret" TEXT;
ALTER TABLE "AIProvider" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AIProvider" ADD COLUMN "monthlyTokenLimit" INTEGER;
ALTER TABLE "AIProvider" ADD COLUMN "taskDefaultsJson" TEXT;
ALTER TABLE "AIProvider" ADD COLUMN "metadataJson" TEXT;

-- CreateTable
CREATE TABLE "AIUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT,
    "providerName" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" REAL,
    "remainingTokens" INTEGER,
    "isEstimate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIUsageLog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AIProvider_type_idx" ON "AIProvider"("type");

-- CreateIndex
CREATE INDEX "AIProvider_isDefault_idx" ON "AIProvider"("isDefault");

-- CreateIndex
CREATE INDEX "AIUsageLog_providerId_createdAt_idx" ON "AIUsageLog"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageLog_providerType_model_idx" ON "AIUsageLog"("providerType", "model");

-- CreateIndex
CREATE INDEX "AIUsageLog_taskType_createdAt_idx" ON "AIUsageLog"("taskType", "createdAt");
