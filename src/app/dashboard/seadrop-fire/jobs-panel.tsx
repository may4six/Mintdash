"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type SeaDropJob = {
  id: string;
  name: string;
  scheduleStatus: "NONE" | "ARMED" | "FIRED" | "CANCELLED" | "FAILED";
  scheduledAt: string | null;
  chainId: number;
  staticArgValues: {
    slug?: string;
    minter?: string;
    quantity?: number;
    prePollSeconds?: number;
  } | null;
  scheduleMaxFeePerGasWei: string | null;
  scheduleMaxPriorityFeePerGasWei: string | null;
  updatedAt: string;
};

function statusLabel(status: SeaDropJob["scheduleStatus"]) {
  switch (status) {
    case "ARMED":
      return "Armed — waiting";
    case "FIRED":
      return "Fired / completed";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

function statusClass(status: SeaDropJob["scheduleStatus"]) {
  switch (status) {
    case "ARMED":
      return "text-yellow-700 dark:text-yellow-400";
    case "FIRED":
      return "text-green-700 dark:text-green-400";
    case "FAILED":
      return "text-red-700 dark:text-red-400";
    case "CANCELLED":
      return "text-muted-foreground";
    default:
      return "";
  }
}

function weiToGwei(wei: string | null): string {
  if (!wei) return "auto";
  try {
    const gwei = Number(wei) / 1e9;
    return `${gwei} gwei`;
  } catch {
    return wei;
  }
}

export function JobsPanel() {
  const [jobs, setJobs] = useState<SeaDropJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/seadrop/schedule");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load jobs");
      setJobs(data.jobs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000); // refresh every 15s
    return () => clearInterval(t);
  }, [load]);

  async function cancelJob(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/seadrop/schedule/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Scheduled SeaDrop jobs</h3>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Status: Armed → Fired (success or claimed) / Failed / Cancelled.
        Auto-refreshes every 15s.
      </p>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {loading && jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No SeaDrop jobs yet.</p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const args = job.staticArgValues ?? {};
            return (
              <li
                key={job.id}
                className="rounded-md border bg-card/40 p-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="font-medium">{job.name}</p>
                    <p className={`text-xs font-medium ${statusClass(job.scheduleStatus)}`}>
                      {statusLabel(job.scheduleStatus)}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      id: {job.id}
                    </p>
                  </div>
                  {job.scheduleStatus === "ARMED" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={cancellingId === job.id}
                      onClick={() => cancelJob(job.id)}
                    >
                      {cancellingId === job.id ? "Cancelling…" : "Cancel"}
                    </Button>
                  )}
                </div>

                <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium text-foreground">Slug: </dt>
                    <dd className="inline">{args.slug ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Qty: </dt>
                    <dd className="inline">{args.quantity ?? "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline font-medium text-foreground">Minter: </dt>
                    <dd className="inline break-all font-mono">
                      {args.minter ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Open: </dt>
                    <dd className="inline">
                      {job.scheduledAt
                        ? new Date(job.scheduledAt).toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Pre-poll: </dt>
                    <dd className="inline">{args.prePollSeconds ?? 45}s</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Max fee: </dt>
                    <dd className="inline">
                      {weiToGwei(job.scheduleMaxFeePerGasWei)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-foreground">Priority: </dt>
                    <dd className="inline">
                      {weiToGwei(job.scheduleMaxPriorityFeePerGasWei)}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}