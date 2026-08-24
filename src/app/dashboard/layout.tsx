import { Suspense, type ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Web3Provider } from "@/components/providers/web3-provider";
import { ChainSwitcher } from "@/components/dashboard/chain-switcher";
import { NavLinks } from "@/components/dashboard/nav-links";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <Web3Provider>
      <div className="flex min-h-screen flex-col sm:flex-row">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card/40 p-4 sm:flex">
          <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-mono text-sm font-semibold tracking-tight">MintDash</span>
          </Link>
          <NavLinks className="flex flex-col gap-1" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center justify-between gap-3 sm:hidden">
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="font-mono text-sm font-semibold tracking-tight">MintDash</span>
              </Link>
              <UserButton afterSignOutUrl="/" />
            </div>
            <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 sm:hidden">
              <NavLinks className="flex flex-row gap-1" />
            </div>
            <Suspense fallback={<div className="h-9 w-44 animate-pulse rounded-md bg-secondary" />}>
              <ChainSwitcher />
            </Suspense>
            <div className="hidden sm:block">
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </Web3Provider>
  );
}
