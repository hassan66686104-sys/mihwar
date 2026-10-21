import type { TeacherState } from '../../../lib/api/types'

export type Act = <T>(key: string, fn: () => Promise<T>, success?: string) => Promise<T | undefined>

export interface PanelProps {
  data: TeacherState
  act: Act
  busy: string | null
}

export interface TimedPanelProps extends PanelProps {
  offset: { current: number }
}
