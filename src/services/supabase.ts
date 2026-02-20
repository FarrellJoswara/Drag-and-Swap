/**
 * Supabase service — key/value persistence for the data-store block.
 *
 * To enable:
 *   1. npm install @supabase/supabase-js
 *   2. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local
 *   3. Create a "kv_store" table: id (uuid), key (text), value (text), created_at
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_KEY)
    throw new Error('Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
}

export async function saveKeyValue(
  pairs: { key: string; value: string }[],
): Promise<{ saved: string }> {
  assertConfigured()

  // TODO: replace with real supabase-js insert
  // import { createClient } from '@supabase/supabase-js'
  // const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  // await supabase.from('kv_store').insert(pairs.map(p => ({ key: p.key, value: p.value })))

  console.log('[supabase] would save', pairs)
  return { saved: `${pairs.length} pair(s)` }
}
