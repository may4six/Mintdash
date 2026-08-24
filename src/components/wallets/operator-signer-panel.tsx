"use client";

import { useState } from "react";
import { useConnect, useAccount, useDisconnect } from "wagmi";
import type { Address } from "viem";
import { KeyRound, Plug, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, FormField } from "@/components/ui/form-elements";
import { Badge } from "@/components/ui/badge";
import { useOperatorSigner } from "@/hooks/useOperatorSigner";

export function OperatorSignerPanel({
  address,
  chainId,
  label,
}: {
  address: Address;
  chainId: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const signer = useOperatorSigner(address, chainId);
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { address: connectedAddress } = useAccount();
  const { disconnect } = useDisconnect();

  const [showImport, setShowImport] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleImport() {
    if (passphrase.length < 8) {
      toast.error("Use a passphrase of at least 8 characters.");
      return;
    }
    if (passphrase !== passphraseConfirm) {
      toast.error("Passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      await signer.importLocalKey(privateKey.trim() as `0x${string}`, passphrase);
      toast.success("Key encrypted and saved to this browser only.");
      setPrivateKey("");
      setPassphrase("");
      setPassphraseConfirm("");
      setShowImport(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import key.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setBusy(true);
    try {
      await signer.unlockLocalKey(unlockPassphrase);
      setUnlockPassphrase("");
      toast.success("Signer unlocked for this session.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unlock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {signer.isReady ? (
            <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          ) : (
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {signer.isReady ? "Signer ready" : "Configure signer"}
        </Button>
      </DialogTrigger>
      <DialogContent title={`Signer for ${label}`} description="Choose how this Operator wallet signs mint transactions.">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 p-3">
            <span className="text-xs text-muted-foreground">Status</span>
            <Badge variant={signer.isReady ? "success" : "muted"}>{signer.mode.replace("-", " ")}</Badge>
          </div>

          {signer.mode === "connected" ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Connected via browser wallet.</span>
              <Button variant="ghost" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Option A — Connect a browser wallet</p>
              <div className="flex flex-wrap gap-2">
                {connectors.map((connector) => (
                  <Button
                    key={connector.uid}
                    variant="outline"
                    size="sm"
                    isLoading={isConnecting}
                    onClick={() => connect({ connector, chainId })}
                  >
                    <Plug className="h-3.5 w-3.5" aria-hidden="true" /> {connector.name}
                  </Button>
                ))}
              </div>
              {connectedAddress && connectedAddress.toLowerCase() !== address.toLowerCase() && (
                <p className="text-[11px] text-warning">
                  Your connected wallet doesn&apos;t match this Operator&apos;s address — switch accounts in your
                  wallet extension, or connect a different wallet to use as Operator instead.
                </p>
              )}
            </div>
          )}

          {signer.mode === "local-unlocked" && (
            <div className="flex items-center justify-between rounded-md border border-success/30 bg-success/5 p-3 text-xs text-muted-foreground">
              <span>Local signer unlocked for this session.</span>
              <Button variant="ghost" size="sm" onClick={signer.lockLocalKey}>
                Lock
              </Button>
            </div>
          )}

          {signer.mode === "local-locked" && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-foreground">Unlock saved local signer</p>
              <Input
                type="password"
                placeholder="Passphrase"
                value={unlockPassphrase}
                onChange={(e) => setUnlockPassphrase(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" isLoading={busy} onClick={handleUnlock}>
                  Unlock
                </Button>
                <Button size="sm" variant="ghost" onClick={signer.forgetLocalKey}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Forget key
                </Button>
              </div>
            </div>
          )}

          {signer.mode === "none" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Option B — Import a dedicated hot wallet key</p>
              {!showImport ? (
                <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Import private key
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3">
                  <p className="text-[11px] leading-relaxed text-warning">
                    Only import a wallet created for this purpose and funded with just enough ETH for your mints —
                    never a wallet holding significant funds or valuable NFTs. This key is encrypted in your browser
                    and never reaches MintDash&apos;s server.
                  </p>
                  <FormField label="Private key">
                    <Input
                      type="password"
                      placeholder="0x..."
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Passphrase (min. 8 characters)">
                    <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                  </FormField>
                  <FormField label="Confirm passphrase">
                    <Input
                      type="password"
                      value={passphraseConfirm}
                      onChange={(e) => setPassphraseConfirm(e.target.value)}
                    />
                  </FormField>
                  <div className="flex gap-2">
                    <Button size="sm" isLoading={busy} onClick={handleImport}>
                      Encrypt &amp; save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowImport(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
