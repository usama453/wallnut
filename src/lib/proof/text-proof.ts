import { createAdminClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/ai";
import type { BrandContext, RawIssue, RawReport } from "@/lib/ai";
import { getProofAdminSettings } from "./proof-settings-store";
import { filterIssuesByChecks } from "./issue-checks";
import { hasEnabledProofChecks } from "./proof-settings";
import { spellcheck } from "./spellcheck";
import { detectRomanUrduLines } from "./roman-urdu";
import { sanitizeText } from "@/lib/text";

/** Run a lightweight proof pass on plain text (WhatsApp messages, quoted replies). */
export async function proofPlainText(
  text: string,
  orgId?: string | null,
): Promise<RawReport> {
  const source = sanitizeText(text.trim());
  if (!source) {
    return {
      score: 100,
      status: "passed",
      summary: "No text to proof.",
      issues: [],
    };
  }

  const settings = await getProofAdminSettings();
  const admin = await createAdminClient();
  const brand = orgId ? await loadBrand(admin, orgId) : null;
  const provider = getProvider();

  const { report } = await provider.analyzeText({
    text: source,
    brand,
    enabledChecks: settings.checks,
  });

  appendSpellcheckIssues(report, source, brand);
  report.issues = filterIssuesByChecks(report.issues, settings.checks);
  if (!hasEnabledProofChecks(settings.checks)) {
    report.issues = [];
  }
  finalizeReport(report);

  try {
    report.humanReply = await provider.generateHumanReply(report);
  } catch (err) {
    console.error(
      `[text-proof] human reply failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  return report;
}

async function loadBrand(admin: Awaited<ReturnType<typeof createAdminClient>>, orgId: string): Promise<BrandContext | null> {
  const { data } = await admin
    .from("brand_profiles")
    .select("*")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  return {
    company_name: data.company_name,
    colors: data.colors ?? [],
    fonts: data.fonts ?? [],
    tone_of_voice: data.tone_of_voice,
    preferred_terminology: data.preferred_terminology ?? [],
    banned_words: data.banned_words ?? [],
    style_guide: data.style_guide,
    allow_slang_roman_urdu: data.allow_slang_roman_urdu ?? false,
  };
}

function finalizeReport(report: RawReport) {
  const hasHigh = report.issues.some((issue) => issue.severity === "high");
  const penalty = report.issues.reduce((sum, issue) => {
    if (issue.severity === "high") return sum + 15;
    if (issue.severity === "medium") return sum + 8;
    return sum + 3;
  }, 0);
  report.score = Math.max(0, Math.round(100 - penalty));
  if (report.score >= 90 && !hasHigh) report.status = "passed";
  else if (report.score >= 70) report.status = "needs_review";
  else report.status = "errors";
}

function appendSpellcheckIssues(
  report: RawReport,
  sourceText: string,
  brand: BrandContext | null,
) {
  if (brand?.allow_slang_roman_urdu) return;

  const allow = [
    brand?.company_name ?? "",
    ...(brand?.preferred_terminology ?? []),
    ...(brand?.fonts ?? []),
  ].filter(Boolean);

  const alreadyFlagged = new Set<string>();
  for (const issue of report.issues) {
    const hay = `${issue.title} ${issue.description ?? ""} ${issue.suggestion ?? ""}`.toLowerCase();
    for (const word of hay.split(/[^a-z']+/i)) {
      if (word.length >= 2) alreadyFlagged.add(word.toLowerCase());
    }
  }

  const findings = spellcheck(sourceText, {
    allow,
    skipLineIndices: detectRomanUrduLines(sourceText),
  });

  for (const f of findings) {
    if (f.words?.length) continue;
    const lower = f.word.toLowerCase();
    if (alreadyFlagged.has(lower)) continue;

    report.issues.push(spellcheckIssue(f));
  }
}

function spellcheckIssue(f: {
  word: string;
  count: number;
  context?: string;
  severity: RawIssue["severity"];
  suggestions: string[];
}): RawIssue {
  return {
    category: "typography",
    severity: f.severity,
    title: `Misspelled "${f.word}"${f.count > 1 ? ` (×${f.count})` : ""}`,
    description: f.context ? `Found in: "${f.context}"` : `Appears ${f.count}× in the text.`,
    suggestion:
      f.suggestions.length > 0
        ? `Did you mean: ${f.suggestions.join(", ")}?`
        : "Verify the intended spelling.",
    location: null,
  };
}
