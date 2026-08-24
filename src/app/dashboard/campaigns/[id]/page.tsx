import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";
import { RunCampaignPanel } from "@/components/campaigns/run-campaign-panel";
import { RunStatusBadge } from "@/components/dashboard/run-status-badge";
import { shortenAddress, formatWeiToEth, timeAgo } from "@/lib/utils";
import type { CampaignDTO } from "@/types";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId },
    include: {
      receivers: { include: { wallet: true }, orderBy: { createdAt: "asc" } },
      runs: {
        orderBy: { createdAt: "desc" },
        include: { operator: true, items: true },
      },
    },
  });

  if (!campaign) notFound();

  const campaignDto = JSON.parse(JSON.stringify(campaign)) as CampaignDTO;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{campaign.name}</h1>
        <p className="font-mono text-xs text-muted-foreground">
          {shortenAddress(campaign.contractAddress)} · {campaign.mintFunctionName}()
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant={campaign.phase === "WHITELIST" ? "warning" : "default"}>{campaign.phase}</Badge>
        <Badge variant="muted">{formatWeiToEth(campaign.priceWeiPerMint)} ETH / mint</Badge>
        <Badge variant="muted">{campaign.receivers.length} receivers attached</Badge>
        {campaign.recipientParam ? (
          <Badge variant="success">Operator can mint directly</Badge>
        ) : (
          <Badge variant="warning">Requires receiver signature</Badge>
        )}
      </div>

      <RunCampaignPanel campaign={campaignDto} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" aria-hidden="true" /> Run history
          </CardTitle>
          <CardDescription>Every execution of this campaign.</CardDescription>
        </CardHeader>
        <CardContent>
          {campaign.runs.length === 0 ? (
            <EmptyState icon={History} title="No runs yet" description="Start one above." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Results</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign.runs.map((run) => {
                  const confirmed = run.items.filter((i) => i.status === "CONFIRMED").length;
                  const failed = run.items.filter((i) => i.status === "FAILED").length;
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {run.startedAt ? timeAgo(run.startedAt) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{run.operator.label}</TableCell>
                      <TableCell>
                        <RunStatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {confirmed} confirmed, {failed} failed, {run.items.length} total
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
