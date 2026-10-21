import type { Timer } from './api/types'

/** الوقت المتبقي محسوبًا من التوقيت المرجعي المحفوظ على الخادم (وليس من عدّاد محلي) */
export function remainingMs(t: Timer | undefined, now: number): number | null {
  if (!t) return null
  if (t.status === 'running' && t.ends_at) return Math.max(0, new Date(t.ends_at).getTime() - now)
  if (t.status === 'paused') return t.remaining_ms ?? 0
  if (t.status === 'ended') return 0
  return null
}

export function isRunning(t: Timer | undefined, now: number) {
  return t?.status === 'running' && !!t.ends_at && new Date(t.ends_at).getTime() > now
}
