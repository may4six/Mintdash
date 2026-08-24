"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Skeleton, StatusDot } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";
import type { ActivityEventDTO } from "@/types";

async function fetchActivity(): Promise<ActivityEventDTO[]> {
  const res = await fetch("/api/activity?limit=15");
  if (!res.ok) throw new Error("Failed to load activity");
  const data = (await res.json()) as { events: ActivityEventDTO[] };
  return data.events;
}

const DOT_COLOR: Record<string, string> = {
  wallet_added: "bg-muted-foreground",
  wallet_removed: "bg-muted-foreground",
  campaign_created: "bg-primary",
  run_started: "bg-primary",
  item_submitted: "bg-warning",
  item_confirmed: "bg-success",
  item_failed: "bg-destructive",
  run_completed: "bg-success",
};

export function ActivityFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: fetchActivity,
    refetchInterval: 8_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          Live activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        )}
        {!isLoading && (!data || data.length === 0) && (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Actions across wallets, campaigns, and runs will show up here as they happen."
          />
        )}
        {data?.map((event) => (
          <div key={event.id} className="flex items-start gap-2.5 text-xs">
            <StatusDot className={cn("mt-1.5", DOT_COLOR[event.type] ?? "bg-muted-foreground")} />
            <div className="flex-1">
              <p className="text-foreground">{event.message}</p>
              <p className="text-muted-foreground">{timeAgo(event.createdAt)}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
