import Link from "next/link";
import { Rocket, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { shortenAddress } from "@/lib/utils";
import type { CampaignDTO } from "@/types";

interface CampaignListItem extends CampaignDTO {
  _count?: { receivers: number; runs: number };
}

export function CampaignList({ campaigns }: { campaigns: CampaignListItem[] }) {
  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={Rocket}
        title="No campaigns yet"
        description="Create one to configure a contract, function, and receiver set for delegated minting."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {campaigns.map((campaign) => (
        <Link key={campaign.id} href={`/dashboard/campaigns/${campaign.id}`}>
          <Card className="h-full transition-colors hover:border-border-strong">
            <CardContent className="flex h-full flex-col gap-3 py-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{campaign.name}</p>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="font-mono text-xs text-muted-foreground">{shortenAddress(campaign.contractAddress)}</p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                <Badge variant={campaign.phase === "WHITELIST" ? "warning" : "default"}>{campaign.phase}</Badge>
                <Badge variant="muted">{campaign._count?.receivers ?? campaign.receivers?.length ?? 0} receivers</Badge>
                <Badge variant="muted">{campaign._count?.runs ?? campaign.runs?.length ?? 0} runs</Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
