import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SEPOLIA_CHAIN_ID = 11155111;

async function main() {
  const userId = process.env.SEED_USER_ID;
  if (!userId) {
    console.warn(
      "\n[seed] SEED_USER_ID is not set — skipping.\n" +
        "Sign in once, copy your Clerk user ID from the Clerk dashboard (Users tab),\n" +
        "set SEED_USER_ID in .env, then re-run `npm run db:seed`.\n"
    );
    return;
  }

  console.log(`[seed] Seeding demo data for user ${userId} on Sepolia…`);

  const operator = await prisma.wallet.upsert({
    where: {
      userId_chainId_address: {
        userId,
        chainId: SEPOLIA_CHAIN_ID,
        address: "0x1111111111111111111111111111111111111a",
      },
    },
    update: {},
    create: {
      userId,
      chainId: SEPOLIA_CHAIN_ID,
      address: "0x1111111111111111111111111111111111111a",
      label: "Main Operator",
      role: "OPERATOR",
    },
  });

  const receiverSeeds = [
    { address: "0x2222222222222222222222222222222222222b", label: "Receiver #1" },
    { address: "0x3333333333333333333333333333333333333c", label: "Receiver #2" },
    { address: "0x4444444444444444444444444444444444444d", label: "Receiver #3" },
  ];

  const receivers = [];
  for (const r of receiverSeeds) {
    const wallet = await prisma.wallet.upsert({
      where: { userId_chainId_address: { userId, chainId: SEPOLIA_CHAIN_ID, address: r.address } },
      update: {},
      create: { userId, chainId: SEPOLIA_CHAIN_ID, address: r.address, label: r.label, role: "RECEIVER" },
    });
    receivers.push(wallet);
  }

  const exampleAbi = [
    {
      type: "function",
      name: "mint",
      stateMutability: "payable",
      inputs: [
        { name: "to", type: "address" },
        { name: "quantity", type: "uint256" },
      ],
      outputs: [],
    },
  ];

  const campaign = await prisma.campaign.upsert({
    where: { id: "seed-campaign-demo" },
    update: {},
    create: {
      id: "seed-campaign-demo",
      userId,
      chainId: SEPOLIA_CHAIN_ID,
      name: "Demo — Sepolia test mint",
      contractAddress: "0x5555555555555555555555555555555555555e",
      abi: exampleAbi,
      mintFunctionName: "mint",
      recipientParam: "to",
      phase: "PUBLIC",
      priceWeiPerMint: "0",
      receivers: {
        create: receivers.map((w) => ({ walletId: w.id })),
      },
    },
  });

  const run = await prisma.mintRun.upsert({
    where: { id: "seed-run-demo" },
    update: {},
    create: {
      id: "seed-run-demo",
      campaignId: campaign.id,
      operatorWalletId: operator.id,
      userId,
      status: "PARTIAL",
      startedAt: new Date(Date.now() - 1000 * 60 * 45),
      completedAt: new Date(Date.now() - 1000 * 60 * 44),
      items: {
        create: [
          {
            receiverWalletId: receivers[0]!.id,
            status: "CONFIRMED",
            txHash: "0xaaaa000000000000000000000000000000000000000000000000000000aa",
            gasUsedWei: "150000",
            effectiveGasPriceWei: "20000000000",
          },
          {
            receiverWalletId: receivers[1]!.id,
            status: "CONFIRMED",
            txHash: "0xbbbb000000000000000000000000000000000000000000000000000000bb",
            gasUsedWei: "148000",
            effectiveGasPriceWei: "20000000000",
          },
          {
            receiverWalletId: receivers[2]!.id,
            status: "FAILED",
            errorMessage: "Exceeds max per wallet",
          },
        ],
      },
    },
  });

  await prisma.activityEvent.createMany({
    data: [
      { userId, type: "wallet_added", message: 'Added Operator wallet "Main Operator"' },
      { userId, type: "campaign_created", message: 'Created campaign "Demo — Sepolia test mint"' },
      { userId, type: "run_started", message: 'Started a run of "Demo — Sepolia test mint" across 3 wallet(s)' },
      { userId, type: "item_confirmed", message: "Mint confirmed for Receiver #1" },
      { userId, type: "item_confirmed", message: "Mint confirmed for Receiver #2" },
      { userId, type: "item_failed", message: "Mint failed for Receiver #3" },
    ],
  });

  console.log(
    `[seed] Done — Operator: ${operator.label}, ${receivers.length} receivers, campaign "${campaign.name}", run ${run.id}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
