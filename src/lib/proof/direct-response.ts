/** Plain-text Gemini response for gemini_only pipeline runs. */
export function getProofDirectResponse(proof: {
  raw?: unknown;
  summary?: string | null;
} | null | undefined): string | null {
  if (!proof) return null;

  if (proof.raw && typeof proof.raw === "object") {
    const raw = proof.raw as Record<string, unknown>;
    if (typeof raw.directResponse === "string" && raw.directResponse.trim()) {
      return raw.directResponse.trim();
    }
  }

  const summary = proof.summary?.trim();
  return summary || null;
}

export function isDirectProofReport(proof: {
  raw?: unknown;
} | null | undefined): boolean {
  if (!proof?.raw || typeof proof.raw !== "object") return false;
  const raw = proof.raw as Record<string, unknown>;
  return raw.pipeline_mode === "gemini_only";
}

export function isAllGoodDirectResponse(text: string): boolean {
  return /^all good\.?$/i.test(text.trim());
}

/** Short dashboard / asset title from a direct Gemini reply. */
export function directReplyPreview(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Proof";
  if (isAllGoodDirectResponse(trimmed)) return "All good";
  const firstLine = trimmed.split("\n").find((line) => line.trim())?.trim() ?? trimmed;
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
}
