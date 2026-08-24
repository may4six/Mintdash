import type { ComponentType } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Gauge, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FlowBanner } from "@/components/mint/flow-banner";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border-strong bg-secondary/50 px-3 py-1 font-mono text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
          Operator-model delegated minting
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">MintDash</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
          One Operator wallet pays gas and mint price. NFTs land directly in your Receiver wallets.
          Preflight every mint before it costs you anything.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/sign-up">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>

        <Card className="mt-12 text-left">
          <CardContent className="py-6">
            <p className="mb-4 text-center font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              How delegated minting works
            </p>
            <FlowBanner />
          </CardContent>
        </Card>

        <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
          <FeatureCard
            icon={ShieldCheck}
            title="Thorough preflight"
            description="Balance, eligibility, and simulated calldata checked before you spend a wei."
          />
          <FeatureCard
            icon={Gauge}
            title="Live per-wallet status"
            description="Pending → Submitted → Confirmed, tracked per receiver in real time."
          />
          <FeatureCard
            icon={ListChecks}
            title="Retry failed only"
            description="A batch failure doesn't mean re-running wallets that already succeeded."
          />
        </div>
      </div>
    </main>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      <p className="mt-2 text-xs font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
