import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { CampaignList } from "@/components/campaigns/campaign-list";
import { Button } from "@/components/ui/button";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ chainId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { chainId: chainIdParam } = await searchParams;
  const chainId = Number(chainIdParam ?? DEFAULT_CHAIN_ID);

  const campaigns = await prisma.campaign.findMany({
    where: { userId, chainId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { receivers: true, runs: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Saved mint configurations for this chain.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/campaigns/new">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New campaign
          </Link>
        </Button>
      </div>
      <CampaignList campaigns={JSON.parse(JSON.stringify(campaigns))} />
    </div>
  );
}
