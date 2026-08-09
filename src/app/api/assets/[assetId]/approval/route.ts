import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["draft", "in_review", "changes_requested", "approved", "published"] as const;

/**
 * POST /api/assets/[assetId]/approval
 * body: { status: 'approved' | 'changes_requested' | 'published' | ..., comment?: string }
 * Records an approval history entry and updates the asset status.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { assetId } = await params;
  const body = await request.json().catch(() => ({}));
  const status = body.status as string;
  const comment = (body.comment as string) ?? null;

  if (!STATUSES.includes(status as any)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, current_version")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return NextResponse.json({ error: "asset not found" }, { status: 404 });

  const { error: upErr } = await supabase
    .from("assets")
    .update({ status })
    .eq("id", assetId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: approval, error: apErr } = await supabase
    .from("approvals")
    .insert({
      asset_id: assetId,
      version: asset.current_version,
      status,
      reviewer_id: user?.id ?? null,
      comment,
    })
    .select()
    .single();
  if (apErr) return NextResponse.json({ error: apErr.message }, { status: 500 });

  return NextResponse.json({ approval });
}
