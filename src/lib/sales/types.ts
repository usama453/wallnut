export type Priority = "high" | "medium" | "low";
export type Severity = "high" | "medium" | "low";

export interface FactItem {
  category: string;
  key: string;
  value: string;
  confidence?: "known" | "assumed";
}

export interface PersonItem {
  name: string;
  role?: string | null;
  relationship?: string | null;
  influence?: string | null;
  sentiment?: string | null;
  status?: string | null;
  notes?: string | null;
}

export interface RiskItem {
  title: string;
  severity: Severity;
  description?: string | null;
}

export interface NextBestAction {
  title: string;
  description?: string | null;
  reason: string;
  priority: Priority;
  timing?: string | null;
}

export interface RecommendedMessage {
  subject?: string | null;
  body: string;
  explanation?: string | null;
}

export interface DealChange {
  field: string;
  previous?: string | null;
  current: string;
  source?: string | null;
}

/** Structured AI output — the single source of truth for the deal page. */
export interface DealAnalysis {
  summary: string;
  stage: string;
  health_score: number;
  pain_score: number;
  champion_score: number;
  urgency_score: number;
  budget_score: number;
  economic_buyer_score: number;
  competition_score: number;
  procurement_score: number;
  known_facts: FactItem[];
  unknowns: string[];
  people: PersonItem[];
  risks: RiskItem[];
  buying_signals: string[];
  objections: { title: string; description?: string | null }[];
  quotes: string[];
  next_best_action: NextBestAction;
  recommended_message: RecommendedMessage;
  deal_changes: DealChange[];
  avoid: string[];
}

// ── DB row types ──────────────────────────────────────────────────────

export interface DealRow {
  id: string;
  user_id: string | null;
  company_name: string;
  contact_name: string | null;
  contact_role: string | null;
  deal_value: number | null;
  currency: string;
  stage: string;
  health_score: number | null;
  summary: string | null;
  main_risk: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DealPersonRow {
  id: string;
  deal_id: string;
  name: string;
  role: string | null;
  relationship: string | null;
  influence: string | null;
  sentiment: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealFactRow {
  id: string;
  deal_id: string;
  category: string;
  key: string;
  value: string;
  confidence: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealActionRow {
  id: string;
  deal_id: string;
  title: string;
  description: string | null;
  reason: string | null;
  priority: string;
  timing: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface DealActivityRow {
  id: string;
  deal_id: string;
  type: string;
  title: string;
  detail: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface DealTranscriptRow {
  id: string;
  deal_id: string;
  title: string;
  content: string;
  analyzed_at: string;
  created_at: string;
}

export interface DealAnalysisRow {
  id: string;
  deal_id: string;
  transcript_id: string | null;
  stage: string | null;
  health_score: number | null;
  analysis_json: DealAnalysis;
  model: string | null;
  created_at: string;
}