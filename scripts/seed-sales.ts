/**
 * Seed the AI Sales Navigator with three realistic demo deals.
 * Idempotent: skips a deal if a deal with the same company name exists.
 *
 * Usage: AI_PROVIDER=mock tsx scripts/seed-sales.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import type { DealAnalysis } from "../src/lib/sales/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function activity(dealId: string, type: string, title: string, detail: string | null, meta: Record<string, unknown>) {
  return { deal_id: dealId, type, title, detail, meta };
}

async function seed() {
  const { data: existing } = await supabase.from("deals").select("company_name");
  const have = new Set((existing ?? []).map((d) => (d as { company_name: string }).company_name.toLowerCase()));

  const acme = await seedDeal({
    company_name: "Acme Corp",
    contact_name: "Sarah Khan",
    contact_role: "VP Marketing",
    deal_value: 75000,
    stage: "evaluation",
    health_score: 72,
    summary:
      "Strong product interest and a clear pain (2-week creative approvals) but no access to the economic buyer yet. Budget is being expanded toward $75k.",
    main_risk: "Economic buyer unknown",
    skip: have,
    analysis: {
      summary:
        "Sarah is highly engaged and pain is acute (approvals take two weeks). Budget has been raised to ~$75k. There is no access to the economic buyer (CFO) yet, and procurement is untouched.",
      stage: "evaluation",
      health_score: 72,
      pain_score: 90,
      champion_score: 85,
      urgency_score: 45,
      budget_score: 70,
      economic_buyer_score: 20,
      competition_score: 60,
      procurement_score: 0,
      known_facts: [
        { category: "budget", key: "Amount", value: "~$75k", confidence: "known" },
        { category: "pain", key: "Core pain", value: "Creative approvals take ~2 weeks and delay every campaign", confidence: "known" },
        { category: "current_solution", key: "Vendor", value: "Adobe Workfront", confidence: "known" },
        { category: "competitors", key: "Incumbent", value: "Adobe (incumbent), Filestage evaluated", confidence: "known" },
        { category: "timeline", key: "Indicated", value: "Decide before end of Q3", confidence: "known" },
        { category: "decision_criteria", key: "Must-have", value: "Cut approval time to under 48 hours, show VP workflow", confidence: "known" },
        { category: "champion", key: "Person", value: "Sarah Khan, VP Marketing", confidence: "known" },
      ],
      unknowns: ["Economic buyer", "Procurement process", "Decision date"],
      people: [
        { name: "Sarah Khan", role: "VP Marketing", relationship: "champion", influence: "high", sentiment: "positive", status: "engaged", notes: "Engaged, controls neither budget nor procurement" },
        { name: "John Smith", role: "CFO", relationship: "economic_buyer", influence: "unknown", sentiment: "unknown", status: "not_contacted", notes: "Signs off at the $75k level" },
      ],
      risks: [
        { title: "Economic buyer unknown", severity: "high", description: "No access to the CFO who signs off at this level." },
        { title: "Incumbent (Adobe) in place", severity: "medium", description: "Adobe Workfront is the status quo; switching needs a strong case." },
        { title: "Moderate urgency", severity: "medium", description: "Q3 timeline is real but not immediate." },
      ],
      buying_signals: ["Budget raised to ~$75k", "Explicit Q3 decision timeline", "Named a must-have success criterion"],
      objections: [],
      quotes: ["Our biggest problem is that approvals take around two weeks.", "We could probably go up to around $75k."],
      next_best_action: {
        title: "Get Sarah to introduce you to the VP of Marketing's executive",
        description: "Get Sarah to introduce you to the economic buyer (CFO).",
        reason:
          "Sarah is highly engaged but does not appear to control the budget. The deal is unlikely to progress without executive involvement. Another product demo won't move the deal.",
        priority: "high",
        timing: "Within 24 hours",
      },
      recommended_message: {
        subject: "Bringing your VP into the conversation",
        body: "Hi Sarah,\n\nGreat speaking today. Based on what you shared about the approval delays, I think it would be useful to bring the decision-maker on the budget side into the conversation so we can show how we'd approach that workflow.\n\nWould you be comfortable introducing us?\n\nBest,",
        explanation: "It gives Sarah an easy, low-risk action and routes you to the budget authority — the single highest-leverage move right now.",
      },
      deal_changes: [
        { field: "Budget", previous: "~$50k", current: "~$75k", source: "August 15 call" },
        { field: "Competitors", previous: "—", current: "Adobe identified as incumbent", source: "August 15 call" },
        { field: "Decision criteria", previous: "—", current: "Approval time under 48 hours", source: "August 15 call" },
      ],
      avoid: ["Don't run another demo — interest is already strong.", "Don't send pricing before the economic buyer is looped in."],
    },
    people: [
      { name: "Sarah Khan", role: "VP Marketing", relationship: "champion", influence: "high", sentiment: "positive", status: "engaged" },
      { name: "John Smith", role: "CFO", relationship: "economic_buyer", influence: "unknown", sentiment: "unknown", status: "not_contacted" },
    ],
    facts: [
      ["budget", "Amount", "~$75k", "known"],
      ["pain", "Core pain", "Creative approvals take ~2 weeks and delay every campaign", "known"],
      ["current_solution", "Vendor", "Adobe Workfront", "known"],
      ["competitors", "Incumbent", "Adobe (incumbent), Filestage evaluated", "known"],
      ["timeline", "Indicated", "Decide before end of Q3", "known"],
      ["decision_criteria", "Must-have", "Cut approval time to under 48 hours", "known"],
      ["champion", "Person", "Sarah Khan, VP Marketing", "known"],
      ["economic_buyer", "Person", "Unknown", "unknown"],
      ["procurement", "Process", "Unknown", "unknown"],
      ["decision_date", "Date", "Unknown", "unknown"],
    ],
    transcript: {
      title: "Aug 15 discovery call",
      content: `[Salesperson]
Thanks for joining, Sarah. To recap, you're looking at replacing how Acme handles creative approvals, right?

[Sarah]
Yes. We're currently using Adobe Workfront, and our biggest problem is that approvals take around two weeks. Every campaign launch gets delayed.

[Salesperson]
That's painful. How much does that two-week delay actually cost?

[Sarah]
Honestly, probably tens of thousands per quarter in missed campaign windows. We could probably go up to around $75k for the right solution.

[Salesperson]
Who signs off on a purchase at that level?

[Sarah]
That would be our CFO, John Smith. I don't want to bother him yet, but we'd need his buy-in eventually.

[Salesperson]
What's your timeline?

[Sarah]
We're hoping to have this decided before the end of Q3. We're also looking at a tool called Filestage, but it seems more for approvals than full workflows.`,
    },
    activity: [
      ["call_analyzed", "Call analyzed — Aug 15 discovery call", "Budget increased to ~$75k; competitor identified: Adobe; VP introduction discussed", { health_score: 72, stage: "evaluation" }],
      ["fact_changed", "Budget: ~$50k → ~$75k", "August 15 call", { field: "budget" }],
      ["fact_changed", "Competitor identified: Adobe", "August 15 call", { field: "competitors" }],
      ["action_recommended", "Recommended: Get VP introduction", "Sarah is engaged but does not control budget.", { priority: "high" }],
    ],
    action: {
      title: "Get Sarah to introduce you to the economic buyer",
      description: "Ask Sarah for an introduction to the CFO so the budget decision is in reach.",
      reason:
        "Sarah is highly engaged but does not appear to control the budget. The deal is unlikely to progress without executive involvement.",
      priority: "high",
      timing: "Within 24 hours",
    },
  });

  const globex = await seedDeal({
    company_name: "Globex",
    contact_name: "Marcus Webb",
    contact_role: "Head of Operations",
    deal_value: 42000,
    stage: "discovery",
    health_score: 45,
    summary:
      "Manual reporting is a real pain but urgency is low — no hard date has surfaced. Budget and the economic buyer are still unclear.",
    main_risk: "Low urgency",
    skip: have,
    analysis: {
      summary:
        "Marcus confirmed manual reporting is painful but there is no deadline or budget signal yet. The deal is in discovery and could stall without urgency.",
      stage: "discovery",
      health_score: 45,
      pain_score: 60,
      champion_score: 55,
      urgency_score: 25,
      budget_score: 55,
      economic_buyer_score: 30,
      competition_score: 30,
      procurement_score: 0,
      known_facts: [
        { category: "pain", key: "Core pain", value: "Manual reporting takes ~6 hours per week", confidence: "known" },
        { category: "current_solution", key: "Tooling", value: "Excel + manual data pulls", confidence: "known" },
        { category: "champion", key: "Person", value: "Marcus Webb, Head of Operations", confidence: "known" },
      ],
      unknowns: ["Economic buyer", "Budget", "Decision date", "Decision criteria"],
      people: [
        { name: "Marcus Webb", role: "Head of Operations", relationship: "champion", influence: "medium", sentiment: "neutral", status: "engaged", notes: "Engaged but not urgent" },
      ],
      risks: [
        { title: "Low urgency", severity: "high", description: "No decision timeline has surfaced." },
        { title: "Economic buyer unknown", severity: "medium", description: "Budget authority not identified." },
      ],
      buying_signals: [],
      objections: [],
      quotes: ["It takes about six hours a week to put the report together manually."],
      next_best_action: {
        title: "Quantify the monthly cost of the manual reporting process",
        description: "Build the business case with Marcus.",
        reason:
          "Urgency is the blocker. Until the cost of the current process is quantified, there is no reason for Globex to move fast.",
        priority: "high",
        timing: "Before the next call",
      },
      recommended_message: {
        subject: "Quick follow-up — cost of the current process",
        body: "Hi Marcus,\n\nThanks for the call. To help build the case internally, it would be great to put a number on what the manual reporting process costs Globex each month.\n\nDo you have a rough estimate, or should we work through it together?\n\nBest,",
        explanation: "It turns a vague pain into a concrete number, which is what creates urgency.",
      },
      deal_changes: [],
      avoid: ["Don't push for a demo — urgency isn't there yet.", "Don't pitch features before the pain is quantified."],
    },
    people: [
      { name: "Marcus Webb", role: "Head of Operations", relationship: "champion", influence: "medium", sentiment: "neutral", status: "engaged" },
    ],
    facts: [
      ["pain", "Core pain", "Manual reporting takes ~6 hours per week", "known"],
      ["current_solution", "Tooling", "Excel + manual data pulls", "known"],
      ["champion", "Person", "Marcus Webb, Head of Operations", "known"],
      ["budget", "Amount", "Unknown", "unknown"],
      ["economic_buyer", "Person", "Unknown", "unknown"],
      ["decision_date", "Date", "Unknown", "unknown"],
      ["decision_criteria", "Criteria", "Unknown", "unknown"],
    ],
    transcript: {
      title: "Aug 12 discovery call",
      content: `[Salesperson]
Thanks for the time, Marcus. What does the reporting process look like today?

[Marcus]
We pull data from four systems and stitch it together in Excel. It takes about six hours a week to put the report together manually, and it's usually out of date by Monday.

[Salesperson]
How big is the team impacted by this?

[Marcus]
About eight people on the ops team. There's no budget discussion yet — that would be my director. I just wanted to understand what's out there first.`,
    },
    activity: [
      ["call_analyzed", "Call analyzed — Aug 12 discovery call", "Manual reporting confirmed as pain; urgency unclear", { health_score: 45, stage: "discovery" }],
      ["action_recommended", "Recommended: Quantify cost of current process", "Urgency is the blocker.", { priority: "high" }],
    ],
    action: {
      title: "Quantify the monthly cost of the manual reporting process",
      description: "Work with Marcus to put a dollar figure on the six hours/week of manual work.",
      reason: "Urgency is the blocker. A concrete cost number is what creates it.",
      priority: "high",
      timing: "Before the next call",
    },
  });

  const notion = await seedDeal({
    company_name: "NotionLabs",
    contact_name: "Priya Sharma",
    contact_role: "CTO",
    deal_value: 120000,
    stage: "procurement",
    health_score: 78,
    summary:
      "Strong champion (CTO) who is also the economic buyer. Procurement has started; the security review is the last gate before close.",
    main_risk: "Security review",
    skip: have,
    analysis: {
      summary:
        "The champion is the economic buyer and fully aligned. Procurement is underway; the security questionnaire is the remaining gate.",
      stage: "procurement",
      health_score: 78,
      pain_score: 85,
      champion_score: 90,
      urgency_score: 70,
      budget_score: 85,
      economic_buyer_score: 80,
      competition_score: 40,
      procurement_score: 60,
      known_facts: [
        { category: "budget", key: "Amount", value: "~$120k approved", confidence: "known" },
        { category: "pain", key: "Core pain", value: "Cross-team onboarding workflow is broken", confidence: "known" },
        { category: "procurement", key: "Status", value: "Security questionnaire in progress", confidence: "known" },
        { category: "champion", key: "Person", value: "Priya Sharma, CTO", confidence: "known" },
        { category: "economic_buyer", key: "Person", value: "Priya Sharma, CTO", confidence: "known" },
        { category: "decision_criteria", key: "Must-haves", value: "Security, compliance, implementation timeline", confidence: "known" },
      ],
      unknowns: ["Vendor security questionnaire completion", "Contract legal review"],
      people: [
        { name: "Priya Sharma", role: "CTO", relationship: "champion", influence: "high", sentiment: "positive", status: "engaged", notes: "Champion and economic buyer" },
        { name: "Alex Chen", role: "Head of Security", relationship: "stakeholder", influence: "medium", sentiment: "neutral", status: "engaged", notes: "Running the security review" },
      ],
      risks: [
        { title: "Security review could delay", severity: "medium", description: "Questionnaire is in progress with Alex's team." },
      ],
      buying_signals: ["Budget already approved", "Procurement has started", "Security team actively engaged"],
      objections: [],
      quotes: ["Once security signs off, we're ready to move forward."],
      next_best_action: {
        title: "Complete the security questionnaire and confirm the review owner",
        description: "Close the security gate.",
        reason:
          "Security sign-off is the last blocker. Everything else — budget, champion, economic buyer — is aligned.",
        priority: "high",
        timing: "Within 48 hours",
      },
      recommended_message: {
        subject: "Security questionnaire — next steps",
        body: "Hi Priya,\n\nGreat progress on the security review. We've started the questionnaire and expect to have it back to Alex's team within the next two days.\n\nIs there anything we should prioritize on the legal side while that's running?\n\nBest,",
        explanation: "It keeps the security gate moving and surfaces any legal blocker early.",
      },
      deal_changes: [],
      avoid: ["Don't discount — the deal is nearly closed.", "Don't go quiet during the security review — stay responsive to Alex's team."],
    },
    people: [
      { name: "Priya Sharma", role: "CTO", relationship: "champion", influence: "high", sentiment: "positive", status: "engaged" },
      { name: "Alex Chen", role: "Head of Security", relationship: "stakeholder", influence: "medium", sentiment: "neutral", status: "engaged" },
    ],
    facts: [
      ["budget", "Amount", "~$120k approved", "known"],
      ["pain", "Core pain", "Cross-team onboarding workflow is broken", "known"],
      ["procurement", "Status", "Security questionnaire in progress", "known"],
      ["champion", "Person", "Priya Sharma, CTO", "known"],
      ["economic_buyer", "Person", "Priya Sharma, CTO", "known"],
      ["decision_criteria", "Must-haves", "Security, compliance, implementation timeline", "known"],
      ["decision_date", "Date", "Unknown", "unknown"],
      ["competitors", "Incumbent", "None identified", "known"],
    ],
    transcript: {
      title: "Aug 10 procurement call",
      content: `[Salesperson]
Thanks for the update, Priya. Where does procurement stand?

[Priya]
Security is the main gate. Alex's team is going through the questionnaire now. Once security signs off, we're ready to move forward.

[Salesperson]
Perfect. Anything on the legal side we should know about?

[Priya]
Our legal is usually straightforward for this size. I'd expect the standard vendor review.

[Salesperson]
Great — we'll get the questionnaire back within two days.`,
    },
    activity: [
      ["call_analyzed", "Call analyzed — Aug 10 procurement call", "Security review confirmed as the final gate", { health_score: 78, stage: "procurement" }],
      ["action_recommended", "Recommended: Complete security questionnaire", "Security sign-off is the last blocker.", { priority: "high" }],
    ],
    action: {
      title: "Complete the security questionnaire",
      description: "Return the questionnaire to Alex's security team and confirm the legal review path.",
      reason: "Security sign-off is the last blocker before close.",
      priority: "high",
      timing: "Within 48 hours",
    },
  });

  console.log(`Seeded: ${[acme, globex, notion].filter(Boolean).length} demo deals.`);
}

async function seedDeal(args: {
  company_name: string;
  contact_name: string;
  contact_role: string;
  deal_value: number;
  stage: string;
  health_score: number;
  summary: string;
  main_risk: string;
  skip: Set<string>;
  analysis: DealAnalysis;
  people: { name: string; role: string; relationship: string; influence: string; sentiment: string; status: string }[];
  facts: [string, string, string, string][];
  transcript: { title: string; content: string };
  activity: [string, string, string | null, Record<string, unknown>][];
  action: { title: string; description: string; reason: string; priority: string; timing: string };
}) {
  if (args.skip.has(args.company_name.toLowerCase())) {
    console.log(`  skip ${args.company_name} (already exists)`);
    return null;
  }

  const { data: deal, error } = await supabase
    .from("deals")
    .insert({
      company_name: args.company_name,
      contact_name: args.contact_name,
      contact_role: args.contact_role,
      deal_value: args.deal_value,
      stage: args.stage,
      health_score: args.health_score,
      summary: args.summary,
      main_risk: args.main_risk,
    })
    .select()
    .single();

  if (error || !deal) {
    console.error(`  FAILED to create ${args.company_name}:`, error?.message);
    return null;
  }
  const dealId = deal.id as string;
  console.log(`  created ${args.company_name}`);

  const { error: personErr } = await supabase.from("deal_people").insert(
    args.people.map((p) => ({ deal_id: dealId, ...p })),
  );
  if (personErr) console.error(`  people: ${personErr.message}`);

  const { error: factErr } = await supabase.from("deal_facts").insert(
    args.facts.map(([category, key, value, confidence]) => ({
      deal_id: dealId,
      category,
      key,
      value,
      confidence,
      source: args.transcript.title,
    })),
  );
  if (factErr) console.error(`  facts: ${factErr.message}`);

  const { data: transcript, error: transcriptErr } = await supabase
    .from("deal_transcripts")
    .insert({ deal_id: dealId, title: args.transcript.title, content: args.transcript.content })
    .select()
    .single();
  if (transcriptErr) console.error(`  transcript: ${transcriptErr.message}`);

  const { error: analysisErr } = await supabase.from("deal_analyses").insert({
    deal_id: dealId,
    transcript_id: transcript?.id ?? null,
    stage: args.analysis.stage,
    health_score: args.analysis.health_score,
    analysis_json: args.analysis as unknown as Record<string, unknown>,
    model: "seed",
  });
  if (analysisErr) console.error(`  analysis: ${analysisErr.message}`);

  const { error: actionErr } = await supabase.from("deal_actions").insert({
    deal_id: dealId,
    ...args.action,
    status: "open",
  });
  if (actionErr) console.error(`  action: ${actionErr.message}`);

  const { error: activityErr } = await supabase.from("deal_activity").insert(
    args.activity.map(([type, title, detail, meta]) => ({ deal_id: dealId, type, title, detail, meta })),
  );
  if (activityErr) console.error(`  activity: ${activityErr.message}`);

  return deal;
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });