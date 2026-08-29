import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BackIcon, PlatformIcon } from "@/components/wallnut/icons";
import { MetricChip } from "@/components/wallnut/metric-chip";
import { ReportCard } from "@/components/wallnut/report-card";
import { Reveal } from "@/components/wallnut/reveal";
import type { ReportRow } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import type { Group, GroupPlatform } from "@/types";

export const dynamic = "force-dynamic";

type GroupRow = Pick<
  Group,
  "id" | "name" | "platform" | "external_id" | "created_at"
>;

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
  if (!user) redirect("/");

  const [{ data: group }, { data: profile }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, platform, external_id, created_at")
      .eq("id", id)
      .maybeSingle<GroupRow>(),
    supabase
      .from("profiles")
      .select("organizations(name)")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  if (!group) notFound();

  const organization = Array.isArray(profile?.organizations)
    ? profile.organizations[0] ?? null
    : profile?.organizations ?? null;

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, kind, status, created_at, created_by, slug, group_id")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const assetIds = (assets ?? []).map((asset) => asset.id);
  const { data: versions } = assetIds.length
    ? await supabase
        .from("asset_versions")
        .select("id, asset_id, version, url, preview_url")
        .in("asset_id", assetIds)
        .order("version", { ascending: false })
    : { data: null };
  const versionByAsset = new Map<
    string,
    { id: string; url: string | null; preview_url: string | null }
  >();
  for (const version of versions ?? []) {
    if (!versionByAsset.has(version.asset_id)) {
      versionByAsset.set(version.asset_id, version);
    }
  }

  const versionIds = [...versionByAsset.values()].map((version) => version.id);
  const { data: proofs } = versionIds.length
    ? await supabase
        .from("proofs")
        .select("id, asset_version_id, score, status")
        .in("asset_version_id", versionIds)
    : { data: null };
  const proofByVersion = new Map<
    string,
    { id: string; score: number; status: string }
  >();
  for (const proof of proofs ?? []) {
    proofByVersion.set(proof.asset_version_id, proof);
  }

  const proofIds = (proofs ?? []).map((proof) => proof.id);
  const { data: issues } = proofIds.length
    ? await supabase
        .from("proof_issues")
        .select("proof_id")
        .in("proof_id", proofIds)
    : { data: null };
  const issueCountByProof = new Map<string, number>();
  for (const issue of issues ?? []) {
    issueCountByProof.set(
      issue.proof_id,
      (issueCountByProof.get(issue.proof_id) ?? 0) + 1,
    );
  }

  const creatorIds = [
    ...new Set(
      (assets ?? [])
        .map((asset) => asset.created_by as string | null)
        .filter((creatorId): creatorId is string => Boolean(creatorId)),
    ),
  ];
  const [{ data: creators }, { data: usageUploaders }] = await Promise.all([
    creatorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", creatorIds)
      : Promise.resolve({ data: null }),
    assetIds.length
      ? supabase
          .from("whatsapp_usage")
          .select("asset_id, from_phone")
          .in("asset_id", assetIds)
          .eq("direction", "inbound")
          .eq("msg_type", "proof")
      : Promise.resolve({ data: null }),
  ]);
  const creatorName = new Map<string, string>();
  for (const creator of creators ?? []) {
    creatorName.set(creator.id, creator.full_name || "Workspace member");
  }
  const phoneByAsset = new Map<string, string>();
  for (const usage of usageUploaders ?? []) {
    if (usage.asset_id && usage.from_phone && !phoneByAsset.has(usage.asset_id)) {
      phoneByAsset.set(usage.asset_id, usage.from_phone);
    }
  }

  const reports: ReportRow[] = (assets ?? []).map((asset) => {
    const version = versionByAsset.get(asset.id);
    const proof = version ? proofByVersion.get(version.id) : undefined;
    return {
      assetId: asset.id,
      name: asset.name,
      kind: asset.kind,
      thumbnail:
        asset.kind === "pdf"
          ? version?.preview_url ?? null
          : version?.url ?? null,
      issueCount: proof ? issueCountByProof.get(proof.id) ?? 0 : 0,
      score: proof?.score ?? null,
      status: asset.status,
      createdAt: asset.created_at,
      slug: asset.slug,
      groupId: id,
      uploader:
        (asset.created_by ? creatorName.get(asset.created_by) : null) ??
        phoneByAsset.get(asset.id) ??
        null,
    };
  });

  const totalIssues = reports.reduce(
    (total, report) => total + report.issueCount,
    0,
  );
  const checkedReports = reports.filter((report) => report.score != null).length;

  return (
    <main className="mx-auto w-full max-w-[880px] pb-10 pt-2">
      <Reveal>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-[12px] text-[#919191] transition hover:text-white"
        >
          <BackIcon />
          Back
        </Link>
      </Reveal>

      <div className="mt-7 flex flex-col items-center text-center">
        <Reveal dramatic delayMs={100}>
          <div className="flex items-center justify-center gap-2.5">
            <PlatformIcon platform={group.platform as GroupPlatform} size={22} />
            <h1 className="text-[clamp(24px,4vw,30px)] font-bold leading-none tracking-[-0.72px] text-white">
              {group.name}
            </h1>
          </div>
        </Reveal>
        <Reveal dramatic delayMs={240}>
          <p className="mt-2.5 text-[12px] text-[#919191]">
            {organization?.name ?? "My workspace"}
          </p>
        </Reveal>
        <Reveal dramatic delayMs={380}>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <MetricChip value={reports.length} label="reports" />
            <MetricChip value={checkedReports} label="checked" />
            <MetricChip value={totalIssues} label="issues found" />
          </div>
        </Reveal>
      </div>

      <Reveal dramatic delayMs={520}>
        <h2 className="mb-3 mt-9 text-[12px] font-bold text-[#fbfbfb]">Reports</h2>
      </Reveal>

      {reports.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {reports.map((report, index) => (
            <Reveal
              key={report.assetId}
              dramatic
              delayMs={620 + Math.min(index, 8) * 90}
              className="h-full"
            >
              <ReportCard report={report} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] border border-dashed border-[#292929] px-6 py-16 text-center">
          <p className="text-[12px] font-bold text-[#bdbdbd]">No reports yet</p>
          <p className="mt-2 text-[11px] text-[#5f5f5f]">
            Reports sent from this group will appear here.
          </p>
        </div>
      )}
    </main>
  );
}
