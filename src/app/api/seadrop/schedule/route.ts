import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { robinhood } from "@/lib/constants";

const BodySchema = z.object({
  slug: z.string().min(1),
  minter: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  quantity: z.number().int().min(1).max(20).default(1),
  scheduledAt: z.string().datetime(),
  prePollSeconds: z.number().int().min(10).max(300).default(45),
  chainId: z.number().int().default(robinhood.id),
  name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        chainId: body.chainId,
        name: body.name ?? `SeaDrop ${body.slug}`,
        contractAddress: "0x0000000000000000000000000000000000000000",
        abi: [],
        mintFunctionName: "seadrop_fire",
        recipientParam: null,
        phase: "WHITELIST",
        priceWeiPerMint: "0",
        maxPerWallet: body.quantity,
        staticArgValues: {
          slug: body.slug,
          minter: body.minter.toLowerCase(),
          quantity: body.quantity,
          prePollSeconds: body.prePollSeconds,
        },
        autoExecute: true,
        scheduleStatus: "ARMED",
        scheduledAt,
      },
    });

    return NextResponse.json({
      id: campaign.id,
      scheduledAt: campaign.scheduledAt,
      slug: body.slug,
      minter: body.minter,
      prePollSeconds: body.prePollSeconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.campaign.findMany({
    where: {
      userId,
      mintFunctionName: "seadrop_fire",
      scheduleStatus: { in: ["ARMED", "FIRED", "FAILED", "CANCELLED"] },
    },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });

  return NextResponse.json({ jobs });
}