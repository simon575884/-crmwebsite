import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
export const SUPABASE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? import.meta.env.VITE_SUPABASE_ANON_KEY
    ?? '',
).trim()

const missingVariables = []
if (!SUPABASE_URL) missingVariables.push('VITE_SUPABASE_URL')
if (!SUPABASE_KEY) missingVariables.push('VITE_SUPABASE_PUBLISHABLE_KEY')

let configurationError = ''
let client = null

if (!missingVariables.length) {
  try {
    const parsedUrl = new URL(SUPABASE_URL)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('The Supabase URL must use HTTP or HTTPS.')
    }

    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  } catch (error) {
    configurationError = error instanceof Error ? error.message : 'Supabase configuration is invalid.'
  }
}

export const supabaseConfig = Object.freeze({
  isConfigured: Boolean(client),
  missingVariables,
  error: configurationError,
})

export const supabase = client
