import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Rocket, Wallet } from "lucide-react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { FlowBanner } from "@/components/mint/flow-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ chainId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { chainId: chainIdParam } = await searchParams;
  const chainId = Number(chainIdParam ?? DEFAULT_CHAIN_ID);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Everything running through this chain&apos;s wallets.</p>
      </div>

      <StatsCards userId={userId} chainId={chainId} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>How delegated minting works</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 py-6">
            <FlowBanner />
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link href="/dashboard/campaigns/new">
                  <Rocket className="h-3.5 w-3.5" aria-hidden="true" /> New campaign
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/wallets">
                  <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Manage wallets
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <ActivityFeed />
      </div>
    </div>
  );
}
