import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  buildDropMintTransaction,
  getDrop,
} from "@/lib/opensea/drops";

const BodySchema = z.object({
  slug: z.string().min(1),
  minter: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  quantity: z.number().int().min(1).max(20).default(1),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await req.json();
    const body = BodySchema.parse(json);

    const mintTx = await buildDropMintTransaction(body.slug, {
      minter: body.minter as `0x${string}`,
      quantity: body.quantity,
    });

    return NextResponse.json(mintTx);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("409")
      ? 409
      : message.includes("422")
        ? 422
        : 400;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  try {
    const drop = await getDrop(slug);
    return NextResponse.json(drop);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}