import { getProvider } from "@/lib/ai";
import type { RawReport } from "@/lib/ai";
import { isAllGoodDirectResponse, sanitizeDirectProofResponse } from "@/lib/proof/direct-response";
import { sanitizeText } from "@/lib/text";

/** Run a lightweight proof pass on plain text (WhatsApp messages, quoted replies). */
export async function proofPlainText(
  text: string,
  _orgId?: string | null,
  _options?: { standalone?: boolean },
): Promise<RawReport> {
  const source = sanitizeText(text.trim());
  if (!source) {
    return {
      score: 100,
      status: "passed",
      summary: "No text to proof.",
      issues: [],
    };
  }

  const provider = getProvider();
  const { rawText } = await provider.proofTextDirect({ text: source });
  const directResponse = sanitizeDirectProofResponse(sanitizeText(rawText.trim()));
  const allGood = isAllGoodDirectResponse(directResponse);
  return {
    score: allGood ? 100 : 70,
    status: allGood ? "passed" : "needs_review",
    summary: directResponse,
    issues: [],
    directResponse,
    humanReply: directResponse,
    extractedText: source,
  };
}
