export const SUMMARY_SYSTEM_PROMPT = `You are a meeting summarizer. Given the full transcript of a call and the conversation state captured during it, produce a concise, useful call summary.

Rules:
- Only include information that is present in the transcript or conversation state.
- Never fabricate topics, decisions, numbers or details.
- Be concrete and specific, not generic.

Input JSON fields:
- durationSeconds: total call duration
- conversationSummary: summary produced during the call
- importantFacts: facts established during the call
- topics: topics discussed
- unresolvedQuestions: questions left open
- userRequests: requests the user made
- transcript: full transcript as array of { speaker, text, timeSeconds }

Output JSON only:
- mainTopics: array of the main topics (3-6, most prominent first)
- keyPoints: array of key points (concrete statements established during the call)
- openQuestions: array of open questions
- importantMoments: array of { timeSeconds, note } for notable moments (question about a product, pricing discussion, concern raised, decisions, etc.) sorted by timeSeconds`

export const SUMMARY_SCHEMA = {
  name: 'call_summary',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      mainTopics: { type: 'array', items: { type: 'string' } },
      keyPoints: { type: 'array', items: { type: 'string' } },
      openQuestions: { type: 'array', items: { type: 'string' } },
      importantMoments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            timeSeconds: { type: 'number' },
            note: { type: 'string' }
          },
          required: ['timeSeconds', 'note'],
          additionalProperties: false
        }
      }
    },
    required: ['mainTopics', 'keyPoints', 'openQuestions', 'importantMoments'],
    additionalProperties: false
  }
} as const

export const SUGGESTION_SCHEMA = {
  name: 'assistant_suggestion',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      should_intervene: { type: 'boolean' },
      type: {
        type: 'string',
        enum: ['answer', 'suggestion', 'clarification', 'warning', 'information', 'summary']
      },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      title: { type: 'string' },
      content: { type: 'string' },
      reason: { type: 'string' },
      confidence: { type: 'number' }
    },
    required: [
      'should_intervene',
      'type',
      'priority',
      'title',
      'content',
      'reason',
      'confidence'
    ],
    additionalProperties: false
  }
} as const
