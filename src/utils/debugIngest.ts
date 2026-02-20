/**
 * Optional debug log ingest. Only sends when VITE_DEBUG_INGEST_URL is set.
 * No hardcoded localhost — set the URL in .env.local when needed.
 */
const DEBUG_INGEST_URL = import.meta.env.VITE_DEBUG_INGEST_URL as string | undefined
const DEBUG_SESSION_ID = import.meta.env.VITE_DEBUG_SESSION_ID as string | undefined

export function debugIngest(payload: Record<string, unknown>): void {
  if (!DEBUG_INGEST_URL) return
  const sessionId = (DEBUG_SESSION_ID ?? payload.sessionId) as string | undefined
  fetch(DEBUG_INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'X-Debug-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify({ ...payload, ...(sessionId ? { sessionId } : {}) }),
  }).catch(() => {})
}
