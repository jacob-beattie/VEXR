import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// createClient() throws during module evaluation if either var is missing — before main.tsx ever
// calls createRoot().render(), so ErrorBoundary (which only catches React render/lifecycle errors)
// never sees it. Left unchecked, that's a blank white screen with nothing but a console stack
// trace no real user will open. Fail loudly and specifically instead — see docs/ENVIRONMENT.md.
const missing = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
].filter((v): v is string => Boolean(v))

if (missing.length > 0) {
  const message = `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
  document.body.innerHTML = `
    <div style="font-family: sans-serif; min-height: 100vh; background: #0a0a0a; color: #fff; display: flex; align-items: center; justify-content: center; padding: 24px;">
      <div style="max-width: 480px;">
        <h1 style="font-size: 18px; margin-bottom: 12px;">Configuration error</h1>
        <p style="color: #999; line-height: 1.5;">${message}. Check your Vercel project's Environment Variables (or <code>.env.local</code> for local development) — see <code>docs/ENVIRONMENT.md</code>.</p>
      </div>
    </div>
  `
  throw new Error(message)
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
