export type ProofPipelineMode = "split" | "gemini_only";

export function proofPipelineModeFromEnv(): ProofPipelineMode | null {
  const value = process.env.PROOF_PIPELINE_MODE?.trim().toLowerCase();
  if (value === "gemini_only" || value === "split") return value;
  return null;
}

export function proofPipelineLabel(mode: ProofPipelineMode): string {
  return mode === "gemini_only" ? "Gemini only" : "Split pipeline";
}
