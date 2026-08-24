import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { History as HistoryIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";
import { RunStatusBadge } from "@/components/dashboard/run-status-badge";
import { timeAgo } from "@/lib/utils";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ chainId?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { chainId: chainIdParam } = await searchParams;
  const chainId = Number(chainIdParam ?? DEFAULT_CHAIN_ID);

  const runs = await prisma.mintRun.findMany({
    where: { userId, campaign: { chainId } },
    orderBy: { createdAt: "desc" },
    include: { campaign: true, operator: true, items: true },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">Every run across every campaign on this chain.</p>
      </div>

      <Card>
        <CardContent className="py-4">
          {runs.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title="No runs yet"
              description="Runs will show up here once you execute a campaign."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Results</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const confirmed = run.items.filter((i) => i.status === "CONFIRMED").length;
                  const failed = run.items.filter((i) => i.status === "FAILED").length;
                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Link href={`/dashboard/campaigns/${run.campaignId}`} className="text-primary hover:underline">
                          {run.campaign.name}
                        </Link>
                      </TableCell>
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
