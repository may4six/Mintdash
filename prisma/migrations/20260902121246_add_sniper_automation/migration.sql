-- CreateEnum
CREATE TYPE "WalletRole" AS ENUM ('OPERATOR', 'RECEIVER');

-- CreateEnum
CREATE TYPE "MintPhase" AS ENUM ('PUBLIC', 'WHITELIST');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('DRAFT', 'PREFLIGHT', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('UNKNOWN', 'ELIGIBLE', 'INELIGIBLE');

-- CreateEnum
CREATE TYPE "SniperType" AS ENUM ('NFT', 'TOKEN');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('NONE', 'ARMED', 'FIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('OBSERVED', 'ARMED', 'EXECUTED', 'SKIPPED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AutomationMode" AS ENUM ('SHADOW', 'MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "CopyKind" AS ENUM ('MINT', 'BUY');

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "role" "WalletRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "abi" JSONB NOT NULL,
    "mintFunctionName" TEXT NOT NULL,
    "recipientParam" TEXT,
    "staticArgValues" JSONB DEFAULT '{}',
    "phase" "MintPhase" NOT NULL DEFAULT 'PUBLIC',
    "priceWeiPerMint" TEXT NOT NULL DEFAULT '0',
    "maxPerWallet" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "autoExecute" BOOLEAN NOT NULL DEFAULT false,
    "scheduleStatus" "ScheduleStatus" NOT NULL DEFAULT 'NONE',
    "scheduleMaxFeePerGasWei" TEXT,
    "scheduleMaxPriorityFeePerGasWei" TEXT,
    "scheduleOperatorWalletId" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignReceiver" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "eligibility" "EligibilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "eligibilityNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignReceiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MintRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "operatorWalletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'DRAFT',
    "maxFeePerGasWei" TEXT,
    "maxPriorityFeePerGasWei" TEXT,
    "estimatedTotalCostWei" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MintRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MintRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "receiverWalletId" TEXT NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "errorMessage" TEXT,
    "gasUsedWei" TEXT,
    "effectiveGasPriceWei" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MintRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SniperRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SniperType" NOT NULL,
    "chainId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoExecute" BOOLEAN NOT NULL DEFAULT false,
    "maxPriceWei" TEXT NOT NULL,
    "maxGasPriceWei" TEXT,
    "quantityPerWallet" INTEGER NOT NULL DEFAULT 1,
    "operatorWalletId" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SniperRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SniperRuleReceiver" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,

    CONSTRAINT "SniperRuleReceiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SniperMatch" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'OBSERVED',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "armedAt" TIMESTAMP(3),
    "executedRunId" TEXT,
    "skipReason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SniperMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationSettings" (
    "userId" TEXT NOT NULL,
    "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxSpendPerDayWei" TEXT,
    "maxGasPriceWei" TEXT,
    "maxConcurrentRuns" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CopyWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CopyKind" NOT NULL,
    "chainId" INTEGER NOT NULL,
    "sourceAddress" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mode" "AutomationMode" NOT NULL DEFAULT 'SHADOW',
    "operatorWalletId" TEXT,
    "gasStrategy" JSONB,
    "destinationWalletIds" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyObservation" (
    "id" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MatchStatus" NOT NULL DEFAULT 'OBSERVED',
    "executedRunId" TEXT,
    "skipReason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "CopyObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wallet_userId_role_idx" ON "Wallet"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_chainId_address_key" ON "Wallet"("userId", "chainId", "address");

-- CreateIndex
CREATE INDEX "Campaign_userId_idx" ON "Campaign"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignReceiver_campaignId_walletId_key" ON "CampaignReceiver"("campaignId", "walletId");

-- CreateIndex
CREATE INDEX "MintRun_userId_idx" ON "MintRun"("userId");

-- CreateIndex
CREATE INDEX "MintRun_campaignId_idx" ON "MintRun"("campaignId");

-- CreateIndex
CREATE INDEX "MintRunItem_runId_idx" ON "MintRunItem"("runId");

-- CreateIndex
CREATE INDEX "MintRunItem_receiverWalletId_idx" ON "MintRunItem"("receiverWalletId");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_createdAt_idx" ON "ActivityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SniperRule_userId_type_idx" ON "SniperRule"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SniperRuleReceiver_ruleId_walletId_key" ON "SniperRuleReceiver"("ruleId", "walletId");

-- CreateIndex
CREATE INDEX "SniperMatch_userId_status_idx" ON "SniperMatch"("userId", "status");

-- CreateIndex
CREATE INDEX "SniperMatch_ruleId_idx" ON "SniperMatch"("ruleId");

-- CreateIndex
CREATE INDEX "CopyWatch_userId_kind_idx" ON "CopyWatch"("userId", "kind");

-- CreateIndex
CREATE INDEX "CopyObservation_userId_status_idx" ON "CopyObservation"("userId", "status");

-- CreateIndex
CREATE INDEX "CopyObservation_watchId_idx" ON "CopyObservation"("watchId");

-- AddForeignKey
ALTER TABLE "CampaignReceiver" ADD CONSTRAINT "CampaignReceiver_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReceiver" ADD CONSTRAINT "CampaignReceiver_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MintRun" ADD CONSTRAINT "MintRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MintRun" ADD CONSTRAINT "MintRun_operatorWalletId_fkey" FOREIGN KEY ("operatorWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MintRunItem" ADD CONSTRAINT "MintRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MintRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MintRunItem" ADD CONSTRAINT "MintRunItem_receiverWalletId_fkey" FOREIGN KEY ("receiverWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SniperRule" ADD CONSTRAINT "SniperRule_operatorWalletId_fkey" FOREIGN KEY ("operatorWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SniperRuleReceiver" ADD CONSTRAINT "SniperRuleReceiver_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SniperRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SniperRuleReceiver" ADD CONSTRAINT "SniperRuleReceiver_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SniperMatch" ADD CONSTRAINT "SniperMatch_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SniperRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyObservation" ADD CONSTRAINT "CopyObservation_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "CopyWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

