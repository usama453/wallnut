/** Pull the canonical image transcription from a persisted proof record. */
export function getProofTranscription(proof: {
  raw?: unknown;
  ocr_text?: string | null;
} | null | undefined): string | null {
  if (!proof) return null;

  if (proof.raw && typeof proof.raw === "object") {
    const raw = proof.raw as Record<string, unknown>;
    const extracted =
      typeof raw.extractedText === "string"
        ? raw.extractedText.trim()
        : typeof raw.extracted_text === "string"
          ? raw.extracted_text.trim()
          : "";
    if (extracted) return extracted;
  }

  const ocr = proof.ocr_text?.trim();
  return ocr || null;
}
