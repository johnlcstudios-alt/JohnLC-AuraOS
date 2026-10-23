import { useEffect, useRef } from 'react'
import { hotCorners, type HotCornerConfig } from '../core/hotCorners'
import { actions } from '../core/actions'
import { useStore } from '../core/hooks'
import { contextMenu } from '../core/contextMenu'

const DWELL_MS = 220
const SIZE = 6

/**
 * Hot corners: hover a screen corner for a moment to run its action.
 * Defaults: Mission Control (top-left), Notifications (top-right),
 * Show Desktop (bottom-left), Widgets (bottom-right). Right-click a corner to
 * change or disable it.
 */
export function HotCorners() {
  const config = useStore(hotCorners)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})
  const armed = useRef<Record<string, boolean>>({})

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((t) => t && clearTimeout(t))
    }
  }, [])

  if (!config.enabled) return null

  const corners: Array<{ id: 'tl' | 'tr' | 'bl' | 'br'; style: React.CSSProperties }> = [
    { id: 'tl', style: { top: 0, left: 0 } },
    { id: 'tr', style: { top: 0, right: 0 } },
    { id: 'bl', style: { bottom: 0, left: 0 } },
    { id: 'br', style: { bottom: 0, right: 0 } },
  ]

  const run = (actionId: string) => {
    if (!actionId || actionId === 'none') return
    actions.run(actionId)
  }

  return (
    <>
      {corners.map(({ id, style }) => {
        const actionId = config[id]
        return (
          <div
            key={id}
            aria-hidden
            className="absolute z-[190]"
            style={{ ...style, width: SIZE, height: SIZE }}
            onMouseEnter={() => {
              if (armed.current[id]) return
              armed.current[id] = true
              timers.current[id] = setTimeout(() => run(actionId), DWELL_MS)
            }}
            onMouseLeave={() => {
              armed.current[id] = false
              const t = timers.current[id]
              if (t) clearTimeout(t)
              timers.current[id] = null
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              const options = [
                { label: 'Mission Control', value: 'missionControl.toggle' },
                { label: 'Notifications', value: 'notificationCenter.toggle' },
                { label: 'Show Desktop', value: 'desktop.showDesktop' },
                { label: 'Widgets', value: 'widgets.open' },
                { label: 'Clipboard', value: 'clipboardHistory.toggle' },
                { label: 'None', value: 'none' },
              ]
              contextMenu.open(
                [
                  ...options.map((o) => ({
                    label: o.label,
                    checked: actionId === o.value,
                    onSelect: () => {
                      const patch: Partial<HotCornerConfig> = {}
                      ;(patch as Record<string, string>)[id] = o.value
                      hotCorners.update(patch)
                    },
                  })),
                  { separator: true },
                  { label: 'Disable hot corners', danger: true, onSelect: () => hotCorners.update({ enabled: false }) },
                ],
                { x: e.clientX, y: e.clientY },
                `Hot corner · ${id.toUpperCase()}`,
              )
            }}
          />
        )
      })}
    </>
  )
}
