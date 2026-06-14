import { NextResponse } from "next/server";
import { buildProjection } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const iterations = Math.min(
    200000,
    Math.max(1000, Number(url.searchParams.get("iterations")) || 20000)
  );
  const forceMock = url.searchParams.get("mock") === "1";

  try {
    const result = await buildProjection({ iterations, forceMock });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[leaderboard] buildProjection threw:", e);
    return NextResponse.json(
      { error: "projection_failed", message: String(e) },
      { status: 500 }
    );
  }
}
