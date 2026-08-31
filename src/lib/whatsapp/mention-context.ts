export interface WhatsAppMentionContext {
  userMessage: string;
  quotedMessage?: string;
  quotedHasMedia?: boolean;
}

const PROOF_INTENT =
  /\b(proof\s*read|proofread|proof|check|review|sense\s*check|spell\s*check|grammar\s*check|typo|edit)\b/i;

export function wantsTextProof(text: string): boolean {
  return PROOF_INTENT.test(text);
}

export function stripProofCommand(text: string): string {
  return text
    .replace(/\b(can you|could you|would you|please|pls)\b/gi, "")
    .replace(/\b(proof\s*read|proofread|proof|check|review|read|sense\s*check|spell\s*check|grammar\s*check)\b/gi, "")
    .replace(/\b(this|it|the message|the text|message)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text to run through the proof pipeline, if the user is asking for a proof. */
export function resolveTextToProof(ctx: WhatsAppMentionContext): string | null {
  const user = ctx.userMessage.trim();
  if (!wantsTextProof(user)) return null;

  if (ctx.quotedMessage?.trim()) return ctx.quotedMessage.trim();

  const stripped = stripProofCommand(user);
  if (stripped.length >= 12) return stripped;

  return null;
}

/** Text to proof in WhatsApp — explicit proof-read in groups; pasted copy in DMs. */
export function resolveWhatsAppTextToProof(
  ctx: WhatsAppMentionContext,
  groupId?: string,
): string | null {
  const explicit = resolveTextToProof(ctx);
  if (explicit) return explicit;
  if (groupId) return null;
  if (ctx.quotedMessage?.trim()) return null;

  const user = ctx.userMessage.trim();
  if (user.length < 20) return null;
  if (user.endsWith("?")) return null;
  if (/^(how|what|why|when|where|who|can you|could you|is there|are there|do you|does|hi|hello|hey)\b/i.test(user)) {
    return null;
  }

  return user;
}

export function buildMentionChatInput(
  ctx: WhatsAppMentionContext,
  groupId?: string,
): string {
  const parts: string[] = [];

  if (ctx.quotedMessage?.trim()) {
    parts.push(`Quoted message they are replying to:\n"""${ctx.quotedMessage.trim()}"""`);
  } else if (ctx.quotedHasMedia) {
    parts.push(
      "They quoted an image or PDF (text not available). Tell them to @mention Wallnut on the file itself, or paste the copy here.",
    );
  }

  if (ctx.userMessage.trim()) {
    parts.push(`Their message to you:\n"""${ctx.userMessage.trim()}"""`);
  }

  if (!parts.length) {
    return groupId
      ? "Someone @mentioned you in a WhatsApp group without a question. Reply briefly and invite them to send copy or an image/PDF to proof."
      : "Someone messaged you on WhatsApp. Reply briefly as Wallnut.";
  }

  parts.push(
    groupId
      ? "Answer their actual question using the quoted context when relevant. If they want proofing, be specific — do not tell them to send a file when the text is already above."
      : "This is a direct WhatsApp DM. Your reply IS the complete answer — list any copy corrections inline. Never mention a proof report on the way, a dashboard link, or any follow-up message.",
  );

  return parts.join("\n\n");
}
