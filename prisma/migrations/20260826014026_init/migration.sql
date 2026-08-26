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
    "phase" "MintPhase" NOT NULL DEFAULT 'PUBLIC',
    "priceWeiPerMint" TEXT NOT NULL DEFAULT '0',
    "maxPerWallet" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
