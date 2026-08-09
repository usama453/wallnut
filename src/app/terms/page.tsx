import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-10">
      <header className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-indigo-500 font-bold text-white">
          A
        </span>
        <span className="text-lg font-semibold">AI Proof</span>
      </header>

      <div className="mt-12">
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-1 text-sm text-slate-500">
          Last updated: August 3, 2026
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-300">
          <section>
            <h2 className="mb-2 text-base font-semibold text-white">1. Acceptance of Terms</h2>
            <p>
              By accessing or using AI Proof (the &quot;Service&quot;), you agree to be
              bound by these Terms of Service. If you do not agree, you may not use the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">2. Description of the Service</h2>
            <p>
              AI Proof reviews marketing images and documents for spelling, grammar, brand
              compliance, design issues, and more, then produces a score and an approval workflow.
              We may change, suspend, or discontinue any part of the Service at any time.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">3. Your Content</h2>
            <p>
              You retain all rights to the content you submit. You grant us a limited license to
              process, store, and analyze that content solely to provide the Service. You confirm
              you own or have the right to submit any content you upload.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">4. Acceptable Use</h2>
            <p>
              You agree not to misuse the Service, including attempting to access it in an
              unauthorized way, submitting unlawful content, or interfering with its operation.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">5. Disclaimers</h2>
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind. Proof
              results are automated and may contain errors; final review responsibility remains
              with you.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">6. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, AI Proof shall not be liable for any
              indirect, incidental, or consequential damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">7. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after
              changes are posted constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-white">8. Contact</h2>
            <p>
              Questions about these Terms can be sent to support via the dashboard or the
              WhatsApp business number.
            </p>
          </section>
        </div>

        <p className="mt-12 text-center text-xs text-slate-500">
          <Link href="/" className="text-indigo-400 hover:text-indigo-300">
            ← Back to AI Proof
          </Link>
        </p>
      </div>
    </main>
  );
}
