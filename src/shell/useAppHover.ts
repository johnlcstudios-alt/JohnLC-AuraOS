import { useEffect, useRef } from 'react'
import type { AppDef } from '../core/apps/types'
import { PREVIEW_GRACE_MS, PREVIEW_OPEN_DELAY, previews } from '../core/previews'
import { wm } from '../core/wm/WindowManager'

/**
 * Dock/Taskbar hover behaviour for one icon:
 * resting the pointer on a *running* app reveals its live window previews,
 * moving away hides them after a short grace period so the popover stays
 * reachable. The timer lives in a ref so a fast sweep across the dock never
 * leaves a stale popover behind.
 */
export function useAppHover(origin: 'dock' | 'taskbar') {
  const timer = useRef<number | null>(null)

  const cancel = () => {
    if (timer.current === null) return
    window.clearTimeout(timer.current)
    timer.current = null
  }

  useEffect(() => cancel, [])

  const enter = (app: AppDef, el: HTMLElement): void => {
    if (!wm.ofApp(app.id).length) return
    cancel()
    timer.current = window.setTimeout(() => {
      timer.current = null
      previews.show(app.id, el, origin)
    }, PREVIEW_OPEN_DELAY)
  }

  const leave = (): void => {
    cancel()
    previews.hide(PREVIEW_GRACE_MS)
  }

  return { enter, leave }
}
