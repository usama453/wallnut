import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PLATFORM_LABEL, platformColor, timeAgo } from "@/lib/groups";
import type { ReportRow } from "@/lib/groups";
import type { Group, GroupPlatform } from "@/types";

export const dynamic = "force-dynamic";

type GroupRow = Pick<Group, "id" | "name" | "platform" | "external_id" | "created_at">;

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, platform, external_id, created_at")
    .eq("id", id)
    .maybeSingle<GroupRow>();
  if (!group) notFound();

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, kind, status, created_at, slug, group_id")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const assetIds = (assets ?? []).map((a) => a.id);
  const { data: versions } = assetIds.length
    ? await supabase
        .from("asset_versions")
        .select("id, asset_id, version, url, preview_url")
        .in("asset_id", assetIds)
    : { data: null };
  const versionByAsset = new Map<string, { id: string; url: string | null; preview_url: string | null }>();
  for (const v of versions ?? []) versionByAsset.set(v.asset_id, v);

  const versionIds = (versions ?? []).map((v) => v.id);
  const { data: proofs } = versionIds.length
    ? await supabase.from("proofs").select("id, asset_version_id, score, status").in("asset_version_id", versionIds)
    : { data: null };
  const proofByVersion = new Map<string, { id: string; score: number; status: string }>();
  for (const p of proofs ?? []) proofByVersion.set(p.asset_version_id, p);

  const proofIds = (proofs ?? []).map((p) => p.id);
  const { data: issues } = proofIds.length
    ? await supabase.from("proof_issues").select("proof_id").in("proof_id", proofIds)
    : { data: null };
  const issueByProof = new Map<string, number>();
  for (const i of issues ?? []) issueByProof.set(i.proof_id, (issueByProof.get(i.proof_id) ?? 0) + 1);

  const reports: ReportRow[] = (assets ?? []).map((a) => {
    const v = versionByAsset.get(a.id);
    const proof = v ? proofByVersion.get(v.id) : undefined;
    return {
      assetId: a.id,
      name: a.name,
      kind: a.kind,
      thumbnail: a.kind === "pdf" ? v?.preview_url ?? null : v?.url ?? null,
      issueCount: proof ? issueByProof.get(proof.id) ?? 0 : 0,
      score: proof?.score ?? null,
      status: a.status,
      createdAt: a.created_at,
      slug: a.slug,
      groupId: id,
    };
  });

  const totalIssues = reports.reduce((n, r) => n + r.issueCount, 0);
  const color = platformColor(group.platform as GroupPlatform);

  return (
    <main className="mx-auto max-w-5xl">
      <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="grid size-10 place-items-center rounded-lg text-xs font-bold text-black"
            style={{ background: color }}
          >
            {group.platform === "whatsapp" ? "WA" : group.platform === "slack" ? "SL" : "MS"}
          </span>
          <div>
            <h1 className="text-xl font-medium tracking-tight text-zinc-100">{group.name}</h1>
            <p className="text-sm text-zinc-500">
              {PLATFORM_LABEL[group.platform as GroupPlatform]} · {reports.length} report{reports.length === 1 ? "" : "s"} · {totalIssues} issue{totalIssues === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-zinc-800 px-6 py-16 text-center text-sm text-zinc-500">
          No reports in this group yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800">
          <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
            All reports
          </div>
          <ul className="divide-y divide-zinc-800/70 bg-zinc-950">
            {reports.map((r) => {
              const href = r.slug ? `/reports/${r.slug}` : `/reports/${r.assetId}`;
              const scoreTone =
                r.score == null
                  ? "text-zinc-600"
                  : r.score >= 90
                    ? "text-emerald-400"
                    : r.score >= 70
                      ? "text-amber-400"
                      : "text-red-400";
              return (
                <li key={r.assetId}>
                  <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/60">
                    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded border border-zinc-800 bg-zinc-900">
                      {r.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.thumbnail} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="text-[9px] text-zinc-600">{r.kind === "pdf" ? "PDF" : "IMG"}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-200">{r.name}</p>
                      <p className="text-[11px] text-zinc-500">
                        {timeAgo(r.createdAt)}
                        {r.score != null ? ` · ${r.score}/100` : " · not proofed"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                      {r.status.replace("_", " ")}
                    </span>
                    <span className={`shrink-0 w-16 text-right text-[11px] font-medium ${scoreTone}`}>
                      {r.issueCount} {r.issueCount === 1 ? "issue" : "issues"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
