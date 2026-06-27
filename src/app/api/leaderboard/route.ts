import { NextResponse } from "next/server";
import { buildProjection, ProjectionFailure } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const iterations = Math.min(
    200000,
    Math.max(1000, Number(url.searchParams.get("iterations")) || 50000)
  );
  const debugTeam = url.searchParams.get("debugTeam") || undefined;

  try {
    const result = await buildProjection({ iterations, debugTeam });
    return NextResponse.json(result);
  } catch (e) {
    // A required live feed was unavailable — surface the reason + per-feed
    // diagnostics so the UI can show an error screen with an Advanced log.
    // We deliberately do NOT fall back to any modeled/fabricated numbers.
    if (e instanceof ProjectionFailure) {
      console.error("[leaderboard] projection unavailable:", e.message, e.diagnostics);
      return NextResponse.json(
        { error: e.message, diagnostics: e.diagnostics },
        { status: 503 }
      );
    }
    console.error("[leaderboard] buildProjection threw:", e);
    return NextResponse.json(
      { error: "Projection failed unexpectedly.", diagnostics: [String(e)] },
      { status: 500 }
    );
  }
}
