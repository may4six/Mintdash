import { NextRequest, NextResponse } from "next/server";
import { requireUserId, AuthError } from "@/lib/auth";
import { abiDetectSchema } from "@/lib/validations";
import { z } from "zod";

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    const { chainId, address } = abiDetectSchema.parse(await req.json());

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ETHERSCAN_API_KEY isn't configured on the server — paste the ABI manually instead." },
        { status: 501 }
      );
    }

    const url = new URL("https://api.etherscan.io/v2/api");
    url.searchParams.set("chainid", String(chainId));
    url.searchParams.set("module", "contract");
    url.searchParams.set("action", "getabi");
    url.searchParams.set("address", address);
    url.searchParams.set("apikey", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      return NextResponse.json({ error: "Etherscan request failed." }, { status: 502 });
    }
    const data = (await res.json()) as { status: string; message: string; result: string };

    if (data.status !== "1") {
      return NextResponse.json(
        { error: data.result || "Contract isn't verified on Etherscan — paste the ABI manually." },
        { status: 404 }
      );
    }

    let abi: unknown;
    try {
      abi = JSON.parse(data.result);
    } catch {
      return NextResponse.json({ error: "Etherscan returned an ABI that couldn't be parsed." }, { status: 502 });
    }

    return NextResponse.json({ abi });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[POST /api/contracts/abi-detect]", error);
    return NextResponse.json({ error: "Failed to detect ABI" }, { status: 500 });
  }
}
