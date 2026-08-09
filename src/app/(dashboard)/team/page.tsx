import Link from "next/link";

export default function TeamPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-sm text-slate-400">Invite members and manage roles.</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-10 text-center">
        <p className="text-sm text-slate-400">
          Team invites ship in the next milestone. For now, anyone with an account
          in your Supabase org can use the app.
        </p>
      </div>
      <Link href="/dashboard" className="text-sm text-indigo-400 hover:underline">
        ← Back to dashboard
      </Link>
    </div>
  );
}
