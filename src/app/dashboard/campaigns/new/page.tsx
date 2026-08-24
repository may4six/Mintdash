import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

export default async function NewCampaignPage({
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
        <h1 className="text-lg font-semibold tracking-tight">New campaign</h1>
        <p className="text-sm text-muted-foreground">Operator pays. NFTs land in Receiver wallets.</p>
      </div>
      <CampaignWizard chainId={chainId} />
    </div>
  );
}
