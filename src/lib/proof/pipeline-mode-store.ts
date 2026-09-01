import "server-only";

import type { ProofPipelineMode } from "./pipeline-mode";

export type { ProofPipelineMode };

export async function getProofPipelineMode(_orgId?: string): Promise<ProofPipelineMode> {
  return "gemini_only";
}

export async function setProofPipelineMode(
  _orgId: string,
  _mode?: ProofPipelineMode,
): Promise<void> {
  // Split pipeline is retired; proofs always run Gemini direct.
}
