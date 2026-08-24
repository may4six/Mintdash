"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { Trash2, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { ImportWalletDialog } from "@/components/wallets/import-wallet-dialog";
import { OperatorSignerPanel } from "@/components/wallets/operator-signer-panel";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { useInvalidateWallets, walletsQueryKey } from "@/hooks/useReceiverWallets";
import { shortenAddress, formatWeiToEth } from "@/lib/utils";
import type { WalletDTO } from "@/types";

async function fetchWallets(chainId: number): Promise<WalletDTO[]> {
  const res = await fetch(`/api/wallets?chainId=${chainId}`);
  if (!res.ok) throw new Error("Failed to load wallets");
  const data = (await res.json()) as { wallets: WalletDTO[] };
  return data.wallets;
}

export function WalletList({ chainId, initialWallets }: { chainId: number; initialWallets: WalletDTO[] }) {
  const { data: wallets, isLoading } = useQuery({
    queryKey: walletsQueryKey(chainId),
    queryFn: () => fetchWallets(chainId),
    initialData: initialWallets,
  });
  const invalidateWallets = useInvalidateWallets();

  const addresses = useMemo(() => (wallets ?? []).map((w) => w.address as Address), [wallets]);
  const { data: balances } = useWalletBalances(addresses, chainId);

  async function handleDelete(wallet: WalletDTO) {
    if (!confirm(`Remove "${wallet.label}"? This only removes it from MintDash — nothing happens on-chain.`)) return;
    try {
      const res = await fetch(`/api/wallets/${wallet.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove wallet");
      toast.success(`Removed ${wallet.label}`);
      invalidateWallets(chainId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove wallet");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {wallets?.length ?? 0} wallet{wallets?.length === 1 ? "" : "s"} on this chain
        </p>
        <ImportWalletDialog chainId={chainId} />
      </div>

      {isLoading && <Skeleton className="h-48" />}

      {!isLoading && wallets && wallets.length === 0 && (
        <EmptyState
          icon={WalletIcon}
          title="No wallets yet"
          description="Add your Operator wallet and at least one Receiver to get started."
          action={<ImportWalletDialog chainId={chainId} />}
        />
      )}

      {!isLoading && wallets && wallets.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Wallet</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wallets.map((wallet) => {
              const balance = balances?.[wallet.address.toLowerCase()];
              return (
                <TableRow key={wallet.id}>
                  <TableCell className="font-medium">{wallet.label}</TableCell>
                  <TableCell>
                    <Badge variant={wallet.role === "OPERATOR" ? "operator" : "receiver"}>{wallet.role}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {shortenAddress(wallet.address)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {balance === undefined ? (
                      <Skeleton className="h-4 w-16" />
                    ) : balance === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      `${formatWeiToEth(balance)} ETH`
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {wallet.role === "OPERATOR" && (
                        <OperatorSignerPanel
                          address={wallet.address as Address}
                          chainId={chainId}
                          label={wallet.label}
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(wallet)}
                        aria-label={`Remove ${wallet.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
