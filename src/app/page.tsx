import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-indigo-500 font-bold text-white">
            A
          </span>
          <span className="text-lg font-semibold">AI Proof</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-slate-400 hover:text-white">
            Sign in
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-indigo-500 px-4 py-2 font-medium hover:bg-indigo-400"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mt-24 text-center">
        <span className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
          Works in Slack, Teams &amp; WhatsApp
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold leading-tight tracking-tight">
          Proof marketing assets before they go live.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
          AI Proof extracts every word from your images and PDFs, checks spelling,
          brand rules, contrast, CTAs and links — then gives you a score, an
          annotated preview and an approval workflow. In seconds.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-indigo-500 px-5 py-2.5 font-semibold hover:bg-indigo-400"
          >
            Start proofing free
          </Link>
          <Link
            href="/reports/d38a73564c"
            className="rounded-lg border border-slate-700 px-5 py-2.5 font-medium hover:border-slate-500"
          >
            See an example report
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Free tier runs on Tesseract OCR + Gemini Flash. No credit card.
        </p>
      </section>

      <section className="mt-20 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Upload anything",
            body: "Drag & drop, paste from clipboard, or send via Slack, Teams or WhatsApp.",
          },
          {
            title: "AI catches the rest",
            body: "Spelling, grammar, CTAs, contrast, safe margins, brand rules, broken links.",
          },
          {
            title: "Approve with confidence",
            body: "Score, annotated issues and version history. Every version is reviewed before publish.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"
          >
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
