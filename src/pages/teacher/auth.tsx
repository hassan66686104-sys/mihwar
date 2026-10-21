import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { backend, teacherApi } from '../../lib/api'
import type { AuthUser } from '../../lib/api/backend'
import { toAppError } from '../../lib/api/errors'

interface TeacherCtx {
  user: AuthUser | null
  profile: { id: string; display_name: string } | null
  loading: boolean
  needsProfile: boolean
  error: string | null
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<TeacherCtx | null>(null)

export function TeacherProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<TeacherCtx['profile']>(null)
  const [loading, setLoading] = useState(true)
  const [needsProfile, setNeedsProfile] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (u: AuthUser | null) => {
    setUser(u)
    setError(null)
    if (!u) {
      setProfile(null)
      setLoading(false)
      return
    }
    try {
      setProfile(await teacherApi.bootstrap(null))
      setNeedsProfile(false)
    } catch (e) {
      const err = toAppError(e)
      if (err.code === 'MH_NO_PROFILE') setNeedsProfile(true)
      else setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void backend.auth.getUser().then(load)
    return backend.auth.onChange((u) => {
      setUser((prev) => {
        if (prev?.id !== u?.id) void load(u)
        return u
      })
    })
  }, [load])

  const value: TeacherCtx = {
    user,
    profile,
    loading,
    needsProfile,
    error,
    reload: async () => load(await backend.auth.getUser()),
    signOut: async () => {
      await backend.auth.signOut()
      await load(null)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTeacher() {
  const c = useContext(Ctx)
  if (!c) throw new Error('TeacherProvider missing')
  return c
}
