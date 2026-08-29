import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, organizations(name, slug)")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ org_id: null, role: null, organization: null });
  }

  const organization = Array.isArray(profile.organizations)
    ? profile.organizations[0] ?? null
    : profile.organizations ?? null;

  return NextResponse.json({
    org_id: profile.org_id,
    role: profile.role,
    organization,
  });
}
