// Shared domain types for AI Proof.

export type AssetKind = "image" | "pdf";
export type AssetStatus = "draft" | "in_review" | "changes_requested" | "approved" | "published";
export type ProofStatus = "passed" | "needs_review" | "errors";
export type Severity = "low" | "medium" | "high";
export type IssueStatus = "open" | "resolved" | "dismissed";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export type GroupPlatform = "whatsapp" | "slack" | "teams";

export interface Group {
  id: string;
  org_id: string;
  name: string;
  platform: GroupPlatform;
  external_id: string | null;
  created_at: string;
}

export interface BrandProfile {
  id: string;
  org_id: string;
  name: string;
  company_name: string | null;
  colors: BrandColor[];
  fonts: string[];
  tone_of_voice: string | null;
  logo_url: string | null;
  preferred_terminology: string[];
  banned_words: string[];
  style_guide: string | null;
}

export interface BrandColor {
  name: string;
  hex: string;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  client: string | null;
  created_at: string;
}

export interface Asset {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  kind: AssetKind;
  mime: string;
  current_version: number;
  status: AssetStatus;
  created_by: string | null;
  created_at: string;
}

export interface AssetVersion {
  id: string;
  asset_id: string;
  version: number;
  storage_path: string;
  url: string;
  /** Rendered preview image(s). For images, the original URL suffices; for PDFs this is the first rendered page. */
  preview_url: string | null;
  /** Per-page preview manifest: { pages: [{ url, width, height }] }. NULL until proofed. */
  preview_meta: { pages: Array<{ url: string; width: number; height: number }> } | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface ProofIssue {
  id: string;
  proof_id: string;
  category: string;
  severity: Severity;
  title: string;
  description: string | null;
  suggestion: string | null;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  label: string | null;
  status: IssueStatus;
  created_at: string;
}

export interface Proof {
  id: string;
  asset_version_id: string;
  score: number;
  status: ProofStatus;
  summary: string | null;
  ocr_text: string | null;
  model: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  asset_id: string;
  version: number;
  status: AssetStatus;
  reviewer_id: string | null;
  comment: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  asset_id: string;
  author_id: string | null;
  body: string;
  resolved: boolean;
  created_at: string;
}
