# MintDash

A multi-wallet delegated NFT minting console. One **Operator** wallet pays gas and
mint price; NFTs are delivered directly to **Receiver** wallets. Preflight every
mint — balance, eligibility, simulated calldata — before anything is spent.

```
[ Operator ] --mint(to)--> [ Contract ] --delivers--> [ Receiver ]
   pays gas + price                                     holds the NFT
```

## A note on the architecture

The original spec called for private keys "encrypted at rest" in Postgres, and
separately for "never put private keys on the server." Those two requirements
conflict — a database is server infrastructure. This build resolves it in favor
of the safer reading, and it changes what "Wallet Management" means here:

- **Receiver wallets never need a private key at all.** For the "Operator pays,
  NFT lands in Receiver" flow, only the Receiver's public address is required —
  the Operator calls the contract directly with the Receiver's address as the
  mint recipient. No key custody, no attack surface.
- **The Operator** signs either by connecting a real wallet (MetaMask, WalletConnect,
  etc. — via wagmi, prompted per transaction like any dApp) or, optionally, by
  importing a dedicated "hot wallet" private key that's encrypted client-side
  with the Web Crypto API (AES-GCM, PBKDF2-derived key) and stored **only** in
  that browser's `localStorage`. The plaintext key, the passphrase, and the
  encrypted blob never reach MintDash's server or database — see
  `src/lib/wallet/localSigner.ts`. Only ever import a wallet created for this
  purpose and funded with just enough ETH for your mints.
- The `Wallet` table in Postgres stores **addresses and roles only** — no key
  material, ever.

This is more secure than the original spec and satisfies "never put private
keys on the server" literally, rather than storing them in the one place that
*is* the server.

## How Delegated Minting actually works

Whether the Operator can pay on a Receiver's behalf depends on the target
contract's mint function, and MintDash is honest about this rather than
pretending otherwise:

- **If the function has an explicit recipient parameter** (commonly `to`,
  `recipient`, `account` — auto-detected from the ABI), the Operator calls it
  directly with each Receiver's address as that parameter. The Operator signs
  and pays for every mint in the batch. This is the common case for team/reserve
  mints, gift mints, and many public sales.
- **If the function has no recipient parameter**, it mints to `msg.sender` —
  there is no way for the Operator to put the NFT in a different wallet without
  either the Receiver's own signature or a delegation mechanism the target
  contract would have to support itself (e.g. delegate.cash-style registries,
  which MintDash does not assume). In this case, MintDash still simulates
  eligibility for you during preflight, then routes execution into a **self-sign**
  flow: each Receiver connects their own wallet in the browser and signs their
  own mint. The Operator is not involved in gas for these.

Preflight (`src/lib/contracts/preflight.ts`) checks, for every receiver: the
contract has code at that address on that chain, the Operator's ETH balance
against the total simulated cost (with a 15% gas safety margin), on-chain
whitelist eligibility where an eligibility view function is detectable, and a
full `estimateContractGas` simulation per receiver — so a call that would
revert is caught before it's ever sent, with the decoded revert reason shown
in the UI.

## Tech stack

Next.js 15 (App Router, TypeScript strict) · Tailwind CSS · Clerk auth · viem +
wagmi · Prisma + PostgreSQL · Railway (`output: "standalone"`)

## Project structure

```
prisma/schema.prisma       Data model — Wallet (address + role only), Campaign,
                            CampaignReceiver, MintRun, MintRunItem, ActivityEvent
prisma/seed.ts              Demo data so the dashboard isn't empty on first load
src/app/                    Routes (App Router) + API route handlers
src/components/ui/          Hand-built primitives (Button, Card, Dialog, Table…)
src/components/wallets/     Wallet list, add-wallet dialog, Operator signer panel
src/components/campaigns/   The campaign wizard + run panel — the core mint flow
src/components/mint/        Preflight panel, execution progress, gas settings,
                             the Operator→Contract→Receiver flow diagram
src/hooks/                  useOperatorSigner, useDelegatedMint, usePreflight,
                             useReceiverWallets/useOperatorWallets, useCampaigns,
                             useWalletBalances
src/lib/wallet/localSigner.ts   Client-side-only encrypted key storage
src/lib/contracts/          ABI parsing/detection helpers + the preflight engine
src/lib/validations.ts      Every Zod schema, shared by API routes and forms
```

## Setup

```bash
git clone <your-fork>
cd mintdash
npm install
cp .env.example .env   # fill in the values below
npx prisma migrate dev --name init
npm run dev
```

Requires Node 18.18+ and a Postgres database (local, Railway, Supabase,
whatever you have `DATABASE_URL` pointed at).

### Environment variables

All of these are documented inline in `.env.example`. Summary:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Yes | From the Clerk dashboard |
| `NEXT_PUBLIC_MAINNET_RPC_URL` / `NEXT_PUBLIC_SEPOLIA_RPC_URL` | Recommended | Alchemy/Infura URL — falls back to a public RPC if unset, but that's rate-limited |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional | Omit to fall back to browser-injected wallets only |
| `ETHERSCAN_API_KEY` | Optional | Powers "Detect ABI"; without it, paste the ABI manually |
| `SEED_USER_ID` | Optional, local only | Your Clerk user ID, for `npm run db:seed` |

### Running locally

```bash
npm run dev
```

Sign up, then (optional) seed demo data: copy your Clerk user ID from the
Clerk dashboard into `SEED_USER_ID` in `.env`, then:

```bash
npm run db:seed
```

This adds one Operator, three Receivers, a demo campaign, and a run with mixed
confirmed/failed results on Sepolia, so History and the dashboard stats aren't
empty on first load.

### Deploying to Railway

1. Push this repo to GitHub, then on [railway.com/new](https://railway.com/new) choose
   **Deploy from GitHub repo** and select it (Railway will prompt you to connect
   your GitHub account if you haven't already).
2. On the same project, click **+ New → Database → PostgreSQL**. Then open your
   Next.js service → **Variables** tab → **Add Reference Variable** → select
   `DATABASE_URL` from the Postgres service. This keeps it in sync automatically
   if the database credentials ever change.
3. Add the rest of the environment variables from the table above under the same
   **Variables** tab.
4. Build/start commands need no manual config — Railway's builder reads
   `scripts.build` / `scripts.start` from `package.json` directly, which already
   do the right thing here (`prisma generate && next build`, then copying
   `public/` and `.next/static` into `.next/standalone` — Next's standalone
   output doesn't do that on its own, and skipping it is the most common cause
   of a build that works locally but 404s on every asset in production).
5. Go to **Settings → Deploy → Pre-deploy Command** and set it to
   `npx prisma migrate deploy`. Railway runs this in a separate container with
   access to your service's variables, before each new deploy starts serving
   traffic — so migrations always run exactly once, before the new code goes live.
6. Redeploy, then go to **Settings → Networking → Generate Domain** to get a
   public URL — a fresh service isn't publicly reachable until you do this.
7. In Clerk's dashboard, add that Railway domain to your application's allowed
   origins (and move to a production Clerk instance with `pk_live_`/`sk_live_`
   keys when you're ready for real users — the `pk_test_`/`sk_test_` keys from
   local dev work fine for an initial check but aren't meant for production).

## Known scope limitations

Built to be genuinely complete for the core flow, not to fake coverage of
every edge case:

- **"Detect ABI"** only works for contracts verified on Etherscan (via its v2
  API). Unverified contracts fall back to pasting the ABI manually.
- **Mint price auto-detection** isn't wired up — price is entered manually.
  `findPriceGetter` in `src/lib/contracts/abi.ts` is there if you want to wire
  a read for common `price()`/`mintPrice()` getters.
- **Whitelist eligibility** is checked on-chain only when the ABI exposes a
  plausible `isWhitelisted(address)`-shaped view function. Merkle-proof-only
  allowlists (proof supplied as a function argument, no separate checker) show
  as "eligibility unknown" in preflight rather than a guess.
- The self-sign flow (functions with no recipient parameter) requires manually
  switching the connected wallet per receiver — there's no batching there,
  because there's no way to batch signatures from different private keys in a
  browser without asking each wallet to sign anyway.
- This project could not be `npm install`'d or built in the sandboxed
  environment it was generated in (no network access), so treat the first
  `npm install && npm run build` as the real correctness check, not a
  formality — please open an issue (or just fix it) if something doesn't
  compile.

## Responsible use

MintDash executes ordinary, direct smart-contract calls — the same calldata
any wallet would send — batched across wallets you control. It doesn't
fabricate allowlist eligibility or bypass any on-chain control. Individual NFT
projects may have their own rules about per-wallet mint limits or fair-launch
expectations; those are enforced by the target contract or the project's own
terms, not by this tool, and are yours to respect.
