export const CONTEXT_COMPACTION_PROMPT = `You are a conversation memory manager for a live call assistant. You receive part of a live conversation and must compress it into a compact summary while preserving what matters.

Rules:
- Only use information that appears in the provided transcript chunks.
- Never fabricate facts, names, numbers or claims.
- Merge the new chunks into the existing state instead of starting over.
- Keep the summary concise (max ~120 words) but informative.

Input JSON fields:
- existingSummary: the summary produced so far (may be empty)
- existingFacts: facts established so far
- existingTopics: topics so far
- existingQuestions: open questions so far
- existingRequests: requests made so far
- newChunks: array of { speaker, text, time } transcript chunks to fold in

Output JSON only:
- conversationSummary: one compact paragraph covering the whole conversation so far
- importantFacts: array of concrete facts (deduplicated, most important first)
- topics: array of topics discussed
- unresolvedQuestions: array of questions still unanswered
- userRequests: array of things the user asked for`

export const CONTEXT_SCHEMA = {
  name: 'conversation_state',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      conversationSummary: { type: 'string' },
      importantFacts: { type: 'array', items: { type: 'string' } },
      topics: { type: 'array', items: { type: 'string' } },
      unresolvedQuestions: { type: 'array', items: { type: 'string' } },
      userRequests: { type: 'array', items: { type: 'string' } }
    },
    required: [
      'conversationSummary',
      'importantFacts',
      'topics',
      'unresolvedQuestions',
      'userRequests'
    ],
    additionalProperties: false
  }
} as const
