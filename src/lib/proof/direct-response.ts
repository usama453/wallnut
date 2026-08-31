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

/** Strip markdown, transcriptions, and URLs from a direct Gemini proof reply. */
export function sanitizeDirectProofResponse(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return text;
  if (isAllGoodDirectResponse(text)) return "All good.";

  text = text.replace(/https?:\/\/\S+/gi, "").trim();
  text = text.replace(/\*\*/g, "");

  const errorsMatch = text.match(/\berrors?\s*:?\s*\n([\s\S]*)/i);
  if (errorsMatch) {
    text = errorsMatch[1].trim();
  } else {
    text = text.replace(/^transcription\s*:?\s*\n[\s\S]*?(?=\n\s*(?:errors?\s*:|error\s*:|spelling\s*:|grammar\s*:|punctuation\s*:)|$)/i, "").trim();
  }

  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*•]\s*/, "");
    if (!trimmed) continue;
    if (isAllGoodDirectResponse(trimmed)) return "All good.";
    if (/^(error|correction|spelling|grammar|punctuation)\s*:/i.test(trimmed)) {
      kept.push(trimmed);
    }
  }

  const result = kept.join("\n").trim();
  if (result) return result;

  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || "All good.";
}

/** WhatsApp-safe direct proof body (no URLs — the report button adds the link). */
export function formatDirectProofWhatsAppReply(raw: string): string {
  return sanitizeDirectProofResponse(raw);
}

/** Short dashboard / asset title from a direct Gemini reply. */
export function directReplyPreview(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "Proof";
  if (isAllGoodDirectResponse(trimmed)) return "All good";
  const firstLine = trimmed.split("\n").find((line) => line.trim())?.trim() ?? trimmed;
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
}
