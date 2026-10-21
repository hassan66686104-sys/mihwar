import type { Timer } from '../lib/api/types'
import { fmtDuration } from '../lib/labels'
import { remainingMs } from '../lib/timer'
import { serverNow, useTick } from '../lib/useLiveState'

interface Props {
  timer: Timer | undefined
  offset: { current: number }
  label: string
  size?: 'sm' | 'md' | 'xl'
}

/** يعرض الوقت المتبقي محسوبًا من وقت النهاية المحفوظ على الخادم وفرق ساعة الجهاز */
export function TimerDisplay({ timer, offset, label, size = 'md' }: Props) {
  useTick(250)
  const ms = remainingMs(timer, serverNow(offset))
  if (ms === null) {
    return (
      <div className="text-center">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className={`font-bold text-muted ${size === 'xl' ? 'text-5xl' : size === 'md' ? 'text-2xl' : 'text-lg'}`}>—</p>
      </div>
    )
  }
  const ended = ms === 0
  const warn = !ended && ms <= 10000 && timer?.status === 'running'
  const paused = timer?.status === 'paused'
  const color = ended ? 'text-red-700' : warn ? 'text-gold-600' : paused ? 'text-muted' : 'text-olive-800'
  return (
    <div className={`rounded-xl text-center ${warn ? 'bg-gold-100 ring-2 ring-gold-400' : ended ? 'bg-red-50' : ''} px-3 py-1`} role="timer" aria-label={label}>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`font-extrabold tabular-nums ${color} ${size === 'xl' ? 'text-6xl md:text-8xl' : size === 'md' ? 'text-3xl' : 'text-xl'}`} dir="ltr">
        {fmtDuration(ms)}
      </p>
      <p className="text-xs font-semibold" aria-live="polite">
        {ended ? <span className="text-red-700">انتهى الوقت</span> : warn ? <span className="text-gold-700">تبقّت ثوانٍ قليلة</span> : paused ? <span className="text-muted">متوقف مؤقتًا</span> : null}
      </p>
    </div>
  )
}
