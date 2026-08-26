import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runProof } from "@/lib/proof/runProof";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/proof/[assetVersionId]
 * Re-run the proof pipeline for a specific version (e.g. after fixes or a model change).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetVersionId: string }> },
) {
  const { assetVersionId } = await params;

  const supabase = await createClient();
  const { data: version } = await supabase
    .from("asset_versions")
    .select("id, asset_id")
    .eq("id", assetVersionId)
    .maybeSingle();
  if (!version) return NextResponse.json({ error: "version not found" }, { status: 404 });

  try {
    const proof = await runProof(assetVersionId);
    return NextResponse.json({
      proof: {
        id: proof.proofId,
        score: proof.report.score,
        status: proof.report.status,
        summary: proof.report.summary,
        issueCount: proof.report.issues.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "proof failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
