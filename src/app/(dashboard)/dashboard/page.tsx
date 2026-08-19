import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProofBadge, StatusBadge, fmtDate } from "@/components/ui";

type AssetRow = {
  id: string;
  name: string;
  kind: string;
  status: "draft" | "in_review" | "changes_requested" | "approved" | "published";
  created_at: string;
  current_version: number;
  proof: { score: number; status: "passed" | "needs_review" | "errors" } | null;
  thumbnail: string | null;
};

export default async function DashboardHome() {
  const supabase = await createClient();

  // Fetch in three steps — PostgREST can't resolve the assets -> proofs
  // junction through asset_versions in a single nested query.
  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, kind, status, created_at, current_version")
    .order("created_at", { ascending: false })
    .limit(20);

  const rows: AssetRow[] = (assets ?? []).map((a) => ({ ...a, proof: null, thumbnail: null }));

  const assetIds = rows.map((a) => a.id);
  const { data: versions } = assetIds.length
    ? await supabase.from("asset_versions").select("id, asset_id, version, url, preview_url").in("asset_id", assetIds)
    : { data: null };

  const versionByAsset = new Map<string, { url: string; preview_url: string | null }[]>();
  for (const v of versions ?? []) {
    const list = versionByAsset.get(v.asset_id) ?? [];
    list.push({ url: v.url, preview_url: v.preview_url ?? null });
    versionByAsset.set(v.asset_id, list);
  }

  const versionIds = (versions ?? []).map((v) => v.id);
  const { data: proofs } = versionIds.length
    ? await supabase.from("proofs").select("asset_version_id, score, status").in("asset_version_id", versionIds)
    : { data: null };

  const proofByVersion = new Map<string, { score: number; status: "passed" | "needs_review" | "errors" }>();
  for (const p of proofs ?? []) proofByVersion.set(p.asset_version_id, p);

  for (const row of rows) {
    const vs = versionByAsset.get(row.id) ?? [];
    const latest = vs.find((v) => v.url) ?? vs[0];
    // Only use a thumbnail <img> that actually renders: images use their URL,
    // PDFs only work if a rasterized preview_url exists.
    if (row.kind === "pdf") {
      row.thumbnail = latest?.preview_url ?? null;
    } else {
      row.thumbnail = latest?.url ?? null;
    }
    const latestVersionId = (versions ?? []).find((v) => v.asset_id === row.id)?.id;
    row.proof = latestVersionId ? (proofByVersion.get(latestVersionId) ?? null) : null;
  }

  const proofOf = (a: AssetRow) => a.proof;

  const counts = {
    approved: rows.filter((a) => a.status === "approved" || a.status === "published").length,
    in_review: rows.filter((a) => a.status === "in_review" || a.status === "changes_requested").length,
    errors: rows.filter((a) => proofOf(a)?.status === "errors").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Home</h1>
          <p className="text-sm text-slate-400">Proof, review and approve your marketing assets.</p>
        </div>
        <Link
          href="/upload"
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-400"
        >
          + Upload asset
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Approved / published" value={counts.approved} tone="emerald" />
        <StatCard label="In review" value={counts.in_review} tone="amber" />
        <StatCard label="Blocking errors" value={counts.errors} tone="red" />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="font-semibold">Recent uploads</h2>
          <span className="text-xs text-slate-500">Latest proofs</span>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-slate-400">No assets yet.</p>
            <Link
              href="/upload"
              className="mt-3 inline-block rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium hover:border-slate-500"
            >
              Upload your first image or PDF
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/70">
            {rows.map((asset) => (
              <li key={asset.id}>
                <Link
                  href={`/assets/${asset.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-800/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-800">
                      {asset.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.thumbnail}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">
                          {asset.kind === "pdf" ? "PDF" : "IMG"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{asset.name}</p>
                      <p className="text-xs text-slate-500">
                        v{asset.current_version} · {fmtDate(asset.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {proofOf(asset) ? <ProofBadge status={proofOf(asset)!.status} /> : <span className="text-xs text-slate-600">Not proofed</span>}
                    {proofOf(asset) && (
                      <span
                        className={`w-12 text-right font-bold ${
                          (proofOf(asset)!.score ?? 0) >= 90
                            ? "text-emerald-400"
                            : (proofOf(asset)!.score ?? 0) >= 70
                              ? "text-amber-400"
                              : "text-red-400"
                        }`}
                      >
                        {proofOf(asset)!.score}/100
                      </span>
                    )}
                    <StatusBadge status={asset.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "red";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "amber"
        ? "text-amber-400"
        : "text-red-400";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-sm text-slate-400">{label}</div>
    </div>
  );
}
