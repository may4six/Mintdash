"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Crosshair } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { KillSwitchBanner } from "@/components/sniper/kill-switch-banner";
import { NftRuleDialog } from "@/components/sniper/nft-rule-dialog";
import { RuleList } from "@/components/sniper/rule-list";
import { MatchFeed } from "@/components/sniper/match-feed";
import { useNftSniper } from "@/hooks/useNftSniper";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

export default function NftSniperPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <NftSniperPageContent />
    </Suspense>
  );
}

function NftSniperPageContent() {
  const searchParams = useSearchParams();
  const chainId = Number(searchParams.get("chainId") ?? DEFAULT_CHAIN_ID);
  const sniper = useNftSniper(chainId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Crosshair className="h-4 w-4" aria-hidden="true" /> NFT Sniper
        </h1>
        <p className="text-sm text-muted-foreground">
          Watches for SeaDrop-style drops matching your rules. Every match needs your explicit confirm — nothing
          fires on its own.
        </p>
      </div>

      <KillSwitchBanner />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Rules</CardTitle>
            <CardDescription>What counts as a match, and who mints it.</CardDescription>
          </div>
          <NftRuleDialog chainId={chainId} onCreated={sniper.invalidateRules} />
        </CardHeader>
        <CardContent>
          {sniper.isLoadingRules ? <Skeleton className="h-32" /> : <RuleList rules={sniper.rules} onChanged={sniper.invalidateRules} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live matches</CardTitle>
          <CardDescription>
            {sniper.isScanning ? "Scanning…" : "Updated automatically while automation is on."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sniper.isLoadingMatches ? (
            <Skeleton className="h-40" />
          ) : (
            <MatchFeed matches={sniper.matches} onChanged={sniper.invalidateMatches} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
