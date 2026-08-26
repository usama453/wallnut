export const STAGES = [
  { id: "discovery", label: "Discovery" },
  { id: "pain", label: "Pain" },
  { id: "champion", label: "Champion" },
  { id: "evaluation", label: "Evaluation" },
  { id: "executive_buyin", label: "Executive Buy-in" },
  { id: "technical_validation", label: "Technical Validation" },
  { id: "procurement", label: "Procurement" },
  { id: "closed", label: "CLOSE" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export function stageLabel(id: string): string {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}

export function stageIndex(id: string): number {
  return STAGES.findIndex((s) => s.id === id);
}

/** The health dimensions shown on the deal page, in display order. */
export const HEALTH_DIMENSIONS = [
  { key: "champion", label: "Champion" },
  { key: "pain", label: "Pain" },
  { key: "urgency", label: "Urgency" },
  { key: "budget", label: "Budget" },
  { key: "economic_buyer", label: "Economic Buyer" },
  { key: "competition", label: "Competition" },
  { key: "procurement", label: "Procurement" },
] as const;

/** Categories surfaced in "What We Know", in display order. */
export const FACT_CATEGORIES = [
  { key: "budget", label: "Budget" },
  { key: "pain", label: "Pain points" },
  { key: "goals", label: "Goals" },
  { key: "current_solution", label: "Current solution" },
  { key: "competitors", label: "Competitors" },
  { key: "timeline", label: "Decision timeline" },
  { key: "decision_date", label: "Decision date" },
  { key: "champion", label: "Champion" },
  { key: "economic_buyer", label: "Economic buyer" },
  { key: "decision_criteria", label: "Decision criteria" },
  { key: "procurement", label: "Procurement process" },
  { key: "next_steps", label: "Next steps" },
] as const;

export const FACT_CATEGORY_KEYS = FACT_CATEGORIES.map((c) => c.key);