import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from './database.types.ts'

// api_rate_limits has no RLS policies (deny-all for anon/authenticated) since it's a rate-limit
// ledger, not user-owned data — a user must not be able to read/insert/delete rows that exist to
// constrain them. This client is scoped to that table only, and only ever called after the
// caller's JWT has already been verified in each function's handler, so `userId` always comes
// from the verified token, never from client input.
const rateLimitClient = createClient<Database>(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Delegates to the check_and_increment_rate_limit Postgres function (SECURITY DEFINER), which
// does the count check and the insert inside one statement, serialized by a per-(user_id,
// function_name) advisory lock. A plain select-count-then-insert from JS is two round trips with
// no transaction, so concurrent requests from the same user could all read the same under-limit
// count before any of them inserted, letting all of them through — this closes that race.
export async function checkRateLimit(
  userId: string,
  functionName: string,
  limit: number,
  windowMs = 60 * 60 * 1000,
): Promise<boolean> {
  const { data, error } = await rateLimitClient.rpc('check_and_increment_rate_limit', {
    p_user_id: userId,
    p_function_name: functionName,
    p_limit: limit,
    p_window_seconds: Math.round(windowMs / 1000),
  })
  if (error) {
    // Fail closed: if the rate-limit mechanism itself is broken, block the action rather than
    // silently allow unlimited Anthropic/Strava calls.
    console.error(`[rate-limit] check_and_increment_rate_limit RPC failed for ${functionName}:`, error.message)
    return false
  }
  return data === true
}
