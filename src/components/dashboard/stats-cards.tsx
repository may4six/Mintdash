import { Wallet, Rocket, CheckCircle2, Fuel } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { formatWeiToEth } from "@/lib/utils";

export async function StatsCards({ userId, chainId }: { userId: string; chainId: number }) {
  const [operatorCount, receiverCount, campaignCount, items] = await Promise.all([
    prisma.wallet.count({ where: { userId, chainId, role: "OPERATOR" } }),
    prisma.wallet.count({ where: { userId, chainId, role: "RECEIVER" } }),
    prisma.campaign.count({ where: { userId, chainId } }),
    prisma.mintRunItem.findMany({
      where: { run: { userId, campaign: { chainId } } },
      select: { status: true, gasUsedWei: true, effectiveGasPriceWei: true },
    }),
  ]);

  const confirmed = items.filter((i) => i.status === "CONFIRMED").length;
  const successRate = items.length > 0 ? Math.round((confirmed / items.length) * 100) : null;
  const gasSpentWei = items.reduce((sum, i) => {
    if (i.status !== "CONFIRMED" || !i.gasUsedWei || !i.effectiveGasPriceWei) return sum;
    return sum + BigInt(i.gasUsedWei) * BigInt(i.effectiveGasPriceWei);
  }, 0n);

  const stats = [
    {
      label: "Wallets",
      value: `${operatorCount + receiverCount}`,
      hint: `${operatorCount} operator · ${receiverCount} receiver`,
      icon: Wallet,
    },
    {
      label: "Campaigns",
      value: `${campaignCount}`,
      hint: campaignCount === 0 ? "None yet" : "Saved configurations",
      icon: Rocket,
    },
    {
      label: "Success rate",
      value: successRate === null ? "—" : `${successRate}%`,
      hint: items.length === 0 ? "No mints run yet" : `${confirmed}/${items.length} mints confirmed`,
      icon: CheckCircle2,
    },
    {
      label: "Gas spent",
      value: `${formatWeiToEth(gasSpentWei)} ETH`,
      hint: "Confirmed mints only",
      icon: Fuel,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <stat.icon className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold">{stat.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{stat.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
