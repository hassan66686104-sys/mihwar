import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IS_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'
import { AppError, toAppError } from './errors'
import type { AuthUser, Backend, LinkStatus } from './backend'

const RPC_TIMEOUT_MS = 15000

let client: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (!IS_CONFIGURED) throw new AppError('MH_NOT_CONFIGURED')
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mihwar-auth' },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  }
  return client
}

const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
  u ? { id: u.id, email: u.email ?? null } : null

export const supabaseBackend: Backend = {
  configured: IS_CONFIGURED,

  async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)
    try {
      const { data, error } = await sb().rpc(fn, args).abortSignal(controller.signal)
      if (error) throw toAppError(error)
      return data as T
    } catch (e) {
      if (controller.signal.aborted) throw new AppError('MH_NETWORK', 'timeout')
      throw toAppError(e)
    } finally {
      clearTimeout(timer)
    }
  },

  auth: {
    async getUser() {
      const { data } = await sb().auth.getSession()
      return toUser(data.session?.user)
    },
    async signIn(email, password) {
      const { error } = await sb().auth.signInWithPassword({ email, password })
      if (error) throw new AppError(/invalid/i.test(error.message) ? 'MH_LOGIN_FAILED' : /confirm/i.test(error.message) ? 'MH_EMAIL_UNCONFIRMED' : 'MH_NETWORK', error.message)
    },
    async signUp(email, password) {
      const { data, error } = await sb().auth.signUp({ email, password })
      if (error) throw new AppError(/already|registered/i.test(error.message) ? 'MH_EMAIL_TAKEN' : /password/i.test(error.message) ? 'MH_WEAK_PASSWORD' : 'MH_SIGNUP_FAILED', error.message)
      return Boolean(data.session)
    },
    async signOut() {
      await sb().auth.signOut()
    },
    async resetPassword(email, redirectTo) {
      const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw toAppError(error)
    },
    onChange(cb) {
      if (!IS_CONFIGURED) return () => {}
      const { data } = sb().auth.onAuthStateChange((_e, session) => cb(toUser(session?.user)))
      return () => data.subscription.unsubscribe()
    },
  },

  subscribe(sessionId, onChange, onStatus) {
    if (!IS_CONFIGURED) {
      onStatus('offline')
      return () => {}
    }
    onStatus('connecting')
    const channel = sb()
      .channel(`mh:${sessionId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'change' }, (msg) => onChange(String((msg.payload as { t?: string })?.t ?? '')))
      .subscribe((status) => {
        const map: Record<string, LinkStatus> = { SUBSCRIBED: 'live', CHANNEL_ERROR: 'offline', TIMED_OUT: 'offline', CLOSED: 'offline' }
        onStatus(map[status] ?? 'connecting')
      })
    return () => {
      void sb().removeChannel(channel)
    }
  },
}
