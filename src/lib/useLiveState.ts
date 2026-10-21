import { useCallback, useEffect, useRef, useState } from 'react'
import { backend } from './api'
import type { LinkStatus } from './api/backend'
import { toAppError, type AppError } from './api/errors'

export type Connection = 'live' | 'polling' | 'offline' | 'connecting'

interface Options {
  /** فترة إعادة الجلب الاحتياطية بالمللي ثانية عندما تعمل القناة الفورية */
  pollMs?: number
  /** فترة إعادة الجلب عند تعطل القناة الفورية */
  degradedPollMs?: number
  enabled?: boolean
}

/**
 * حالة جلسة حية: قاعدة البيانات مصدر الحقيقة، وإشعارات Realtime تطلب إعادة الجلب فقط.
 * - إعادة الجلب تُجمَّع (debounce) لتجنب الضغط عند تتابع التغييرات.
 * - جلب احتياطي دوري يغطي أي إشعار ضائع، ويُسرَّع عند تعطل القناة.
 * - يحسب فرق ساعة الجهاز عن الخادم لاستخدامه في المؤقت.
 */
export function useLiveState<T extends { server_now: string }>(
  sessionId: string | null | undefined,
  fetcher: () => Promise<T>,
  { pollMs = 30000, degradedPollMs = 5000, enabled = true }: Options = {},
) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [link, setLink] = useState<LinkStatus>('connecting')
  const [fetchOk, setFetchOk] = useState(true)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const offsetRef = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const inFlight = useRef(false)
  const again = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    try {
      do {
        again.current = false
        const t0 = Date.now()
        const d = await fetcherRef.current()
        const t1 = Date.now()
        offsetRef.current = new Date(d.server_now).getTime() - (t0 + t1) / 2
        setData(d)
        setError(null)
        setFetchOk(true)
      } while (again.current)
    } catch (e) {
      const err = toAppError(e)
      setError(err)
      if (err.code === 'MH_NETWORK') setFetchOk(false)
    } finally {
      inFlight.current = false
    }
  }, [])

  const refresh = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void load(), 200)
  }, [load])

  useEffect(() => {
    if (!enabled || !sessionId) return
    void load()
    const unsub = backend.subscribe(sessionId, () => refresh(), (s) => {
      setLink(s)
      if (s === 'live') refresh() // بعد إعادة الاتصال: مزامنة ما فات
    })
    return () => {
      unsub()
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [sessionId, enabled, load, refresh])

  useEffect(() => {
    if (!enabled || !sessionId) return
    const ms = link === 'live' && fetchOk ? pollMs : degradedPollMs
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, ms)
    return () => clearInterval(id)
  }, [enabled, sessionId, link, fetchOk, pollMs, degradedPollMs, load])

  useEffect(() => {
    const on = () => {
      setOnline(true)
      void load()
    }
    const off = () => setOnline(false)
    const vis = () => document.visibilityState === 'visible' && void load()
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [load])

  const connection: Connection = !online || !fetchOk ? 'offline' : link === 'live' ? 'live' : link === 'connecting' ? 'connecting' : 'polling'

  return { data, setData, error, connection, refresh: load, serverOffset: offsetRef }
}

/** وقت الخادم المقدَّر على هذا الجهاز */
export function serverNow(offset: { current: number }) {
  return Date.now() + offset.current
}

/** يعيد رسم المكوّن كل فترة (للعرض فقط، لا يُعتمد عليه مصدرًا للوقت) */
export function useTick(ms = 250) {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}
