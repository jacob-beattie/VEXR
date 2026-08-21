// Shared Claude API call used by every edge function that talks to Anthropic
// (ai-briefing's two modes, parse-plan, generate-plan). Owns the API key read, the 30s
// timeout, request headers/body, and response error handling, so a change to any of those
// (timeout value, model id, error-log format) only needs to happen in one place.

const CLAUDE_MODEL = 'claude-sonnet-4-6'
const CLAUDE_TIMEOUT_MS = 30000

/**
 * Calls Claude with a single user-turn prompt and returns the trimmed text response
 * (empty string if Claude returned no text — callers that need to treat that as a
 * failure check for it themselves, since parse-plan/generate-plan instead let an empty
 * string fail naturally in their own JSON.parse step). Throws on missing API key or a
 * non-2xx response. `context` only labels the error log line (e.g. "parse-plan",
 * "ai-briefing (predictor)").
 */
export async function callClaude(prompt: string, maxTokens: number, context: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS)

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })

    if (!aiRes.ok) {
      const errBody = await aiRes.text()
      console.error(`[${context}] Anthropic error:`, aiRes.status, errBody.slice(0, 200))
      throw new Error('AI service error')
    }

    const aiData = await aiRes.json()
    return aiData.content?.[0]?.text?.trim() ?? ''
  } finally {
    clearTimeout(timeout)
  }
}
