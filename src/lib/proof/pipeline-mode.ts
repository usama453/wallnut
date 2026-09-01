export type ProofPipelineMode = "gemini_only";

export function proofPipelineModeFromEnv(): ProofPipelineMode | null {
  return "gemini_only";
}

export function proofPipelineLabel(_mode?: ProofPipelineMode): string {
  return "Gemini";
}
