import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WalletList } from "@/components/wallets/wallet-list";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";
import type { WalletDTO } from "@/types";

export default async function WalletsPage({
  searchParams,
}: {
  searchParams: Promise<{ chainId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { chainId: chainIdParam } = await searchParams;
  const chainId = Number(chainIdParam ?? DEFAULT_CHAIN_ID);

  const wallets = await prisma.wallet.findMany({
    where: { userId, chainId },
    orderBy: { createdAt: "asc" },
  });

  // Serialize Date -> ISO string so the shape matches exactly what the
  // client's own fetch (via the API route) will return on refetch.
  const initialWallets = JSON.parse(JSON.stringify(wallets)) as WalletDTO[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Wallets</h1>
        <p className="text-sm text-muted-foreground">
          Operator pays gas and mint price. Receivers only need a public address — no key required.
        </p>
      </div>
      <WalletList chainId={chainId} initialWallets={initialWallets} />
    </div>
  );
}
