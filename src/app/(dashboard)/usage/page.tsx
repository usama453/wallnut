import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/components/ui";

type UsageRow = {
  id?: number | null;
  direction: "inbound" | "outbound";
  msg_type: string | null;
  message_id: string | null;
  from_phone: string | null;
  to_phone: string | null;
  group_id: string | null;
  status: string | null;
  error_code: string | null;
  error_detail: string | null;
  asset_id: string | null;
  created_at: string;
};

export default async function UsagePage() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("whatsapp_usage")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows: UsageRow[] = (data ?? []) as UsageRow[];

  const inbound = rows.filter((r) => r.direction === "inbound");
  const outbound = rows.filter((r) => r.direction === "outbound");
  const proofs = inbound.filter((r) => r.msg_type === "proof");
  const approvals = inbound.filter((r) => r.msg_type === "approval");
  const media = inbound.filter((r) => ["image", "document", "video"].includes(r.msg_type ?? ""));
  const textChat = inbound.filter((r) => r.msg_type === "text");
  const failed = outbound.filter((r) => r.status === "failed" || r.error_code);
  const delivered = outbound.filter((r) => r.status === "delivered");

  const avgScore = proofs.length
    ? Math.round(proofs.reduce((s, r) => s + Number(r.status ?? 0), 0) / proofs.length)
    : null;

  const days: { label: string; inbound: number; outbound: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const label = start.toLocaleDateString("en-US", { weekday: "short" });
    days.push({
      label,
      inbound: rows.filter((r) => r.direction === "inbound" && r.created_at >= start.toISOString() && r.created_at < end.toISOString()).length,
      outbound: rows.filter((r) => r.direction === "outbound" && r.created_at >= start.toISOString() && r.created_at < end.toISOString()).length,
    });
  }
  const maxDay = Math.max(1, ...days.map((d) => Math.max(d.inbound, d.outbound)));

  const recent = rows.slice(0, 15);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usage</h1>
        <p className="text-sm text-slate-400">WhatsApp bot activity over the last 30 days.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Inbound messages" value={inbound.length} tone="indigo" />
        <StatCard label="Outbound sent" value={outbound.length} tone="sky" />
        <StatCard label="Proofs run" value={proofs.length} tone="emerald" />
        <StatCard label="Approvals" value={approvals.length} tone="amber" />
        <StatCard label="Delivered" value={delivered.length} tone="emerald" />
        <StatCard label="Failures" value={failed.length} tone="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="font-semibold">Last 7 days</h2>
          <div className="mt-4 flex h-32 items-end gap-3">
            {days.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end justify-center gap-1">
                  <div
                    className="w-3 rounded-t bg-indigo-500/70"
                    style={{ height: `${Math.round((d.inbound / maxDay) * 100)}%` }}
                    title={`${d.inbound} inbound`}
                  />
                  <div
                    className="w-3 rounded-t bg-sky-500/70"
                    style={{ height: `${Math.round((d.outbound / maxDay) * 100)}%` }}
                    title={`${d.outbound} outbound`}
                  />
                </div>
                <span className="text-xs text-slate-500">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded bg-indigo-500/70" /> inbound</span>
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded bg-sky-500/70" /> outbound</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="font-semibold">Breakdown</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Images / PDFs received" value={media.length} />
            <Row label="Text chats" value={textChat.length} />
            <Row label="Proof approvals via WhatsApp" value={approvals.length} />
            <Row label="Interactive cards delivered" value={delivered.filter((r) => r.msg_type === "interactive").length} />
            <Row label="Average proof score" value={avgScore === null ? "—" : `${avgScore}/100`} />
          </dl>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="font-semibold">Recent activity</h2>
          <span className="text-xs text-slate-500">Latest events</span>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-14 text-center text-slate-400">
            No WhatsApp activity recorded yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/70">
            {recent.map((r) => {
              const tag =
                r.msg_type === "proof"
                  ? "PROOF"
                  : r.msg_type === "approval"
                    ? "APPROVE"
                    : r.msg_type === "status"
                      ? "STATUS"
                      : r.direction === "inbound"
                        ? "IN"
                        : "OUT";
              const tagColor =
                r.msg_type === "proof"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : r.msg_type === "approval"
                    ? "bg-amber-500/15 text-amber-300"
                    : r.msg_type === "status"
                      ? "bg-slate-700 text-slate-300"
                      : r.direction === "inbound"
                        ? "bg-indigo-500/15 text-indigo-300"
                        : "bg-sky-500/15 text-sky-300";
              const statusColor =
                r.status === "failed" || r.error_code
                  ? "text-red-400"
                  : r.status === "delivered" || r.status === "approved" || r.status === "read"
                    ? "text-emerald-400"
                    : "text-slate-400";
              return (
                <li key={r.id ?? `${r.created_at}-${r.message_id}`} className="flex items-center gap-3 px-5 py-2.5">
                  <span className={`w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-bold ${tagColor}`}>{tag}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                    {r.msg_type === "status"
                      ? `Message ${r.status}${r.error_code ? ` · ${r.error_code}` : ""}`
                      : r.msg_type === "proof"
                        ? `Proof score ${r.status}/100`
                        : r.msg_type === "approval"
                          ? `${r.status === "approved" ? "Approved" : "Changes requested"}${r.asset_id ? " · " + r.asset_id.slice(0, 8) : ""}`
                          : r.direction === "inbound"
                            ? `${r.msg_type} from ${r.from_phone ?? "?"}${r.group_id ? " (group)" : ""}`
                            : `${r.msg_type} to ${r.to_phone ?? (r.group_id ? "group" : "?")}`}
                  </span>
                  <span className={`w-24 shrink-0 text-right text-xs ${statusColor}`}>
                    {r.status === "failed" ? "failed" : r.msg_type === "status" ? "" : r.status && r.msg_type !== "text" ? r.status : ""}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-slate-500">{fmtDate(r.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-600">
        Tracking from 30-day window. Proofs also count toward your <Link href="/" className="text-indigo-400 hover:underline">workspace reports</Link>.
      </p>
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
  tone: "indigo" | "sky" | "emerald" | "amber" | "red";
}) {
  const color: Record<string, string> = {
    indigo: "text-indigo-400",
    sky: "text-sky-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className={`text-2xl font-bold ${color[tone]}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-semibold text-slate-200">{value}</dd>
    </div>
  );
}
