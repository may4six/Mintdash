import { NextRequest, NextResponse } from "next/server";
import { requireUserId, AuthError } from "@/lib/auth";
import { preflightRequestSchema } from "@/lib/validations";
import { runPreflight } from "@/lib/contracts/preflight";
import { z } from "zod";

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    const input = preflightRequestSchema.parse(await req.json());
    const result = await runPreflight(input);
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error("[POST /api/preflight]", error);
    const message = error instanceof Error ? error.message : "Preflight check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
