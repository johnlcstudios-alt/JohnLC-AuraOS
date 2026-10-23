import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { appList, launchApp, pinnedApps } from '../core/apps/registry'
import { appPins } from '../core/apps/pins'
import { previews } from '../core/previews'
import { wm } from '../core/wm/WindowManager'
import { useWindowManager } from '../core/wm/useWindowManager'
import { useStore, useTheme } from '../core/hooks'
import { AppIconTile } from '../ui/controls'
import { openAppJumpList } from './jumpList'
import { useAppHover } from './useAppHover'

const BASE = 50
const MAX_SCALE = 1.78
const SIGMA = 80

/**
 * Floating glass Dock with pointer-driven magnification (gaussian falloff),
 * running indicators, launch bounce and a Trash slot.
 *
 * Right-clicking an icon opens its jump list (tasks, open windows, pin/unpin,
 * quit); resting the pointer on a running app reveals live window previews.
 */
export function Dock() {
  const { windows } = useWindowManager()
  const themeState = useTheme()
  // subscribing to the pin store keeps pinned/unpinned apps in sync
  const pins = useStore(appPins)
  const preview = useStore(previews)
  const hover = useAppHover('dock')
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [scales, setScales] = useState<Record<string, number>>({})
  const [bounceId, setBounceId] = useState<string | null>(null)

  const pinned = useMemo(() => pinnedApps(), [pins])

  if (themeState.shellMode === 'taskbar') return null

  const running = new Set(windows.map((w) => w.appId))
  const extras = appList().filter((a) => running.has(a.id) && !pinned.some((p) => p.id === a.id))
  const items = [...pinned, ...extras]

  const measure = (clientX: number | null) => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const nodes = containerRef.current?.querySelectorAll<HTMLElement>('[data-dock-app]')
      if (!nodes || !nodes.length) return
      if (clientX === null || !themeState.dockMagnify) {
        setScales({})
        return
      }
      const next: Record<string, number> = {}
      nodes.forEach((node) => {
        const rect = node.getBoundingClientRect()
        const center = rect.left + rect.width / 2
        const d = Math.abs(clientX - center)
        const scale = 1 + (MAX_SCALE - 1) * Math.exp(-(d * d) / (2 * SIGMA * SIGMA))
        next[node.dataset.dockApp as string] = Math.round(scale * 100) / 100
      })
      setScales((prev) => {
        const same =
          Object.keys(prev).length === Object.keys(next).length &&
          Object.keys(next).every((k) => prev[k] === next[k])
        return same ? prev : next
      })
    })
  }

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => measure(e.clientX)
  const onPointerLeave = () => measure(null)

  const activate = (appId: string) => {
    const top = wm.topOfApp(appId)
    if (top) {
      wm.activateApp(appId)
      return
    }
    launchApp(appId)
    setBounceId(appId)
    window.setTimeout(() => setBounceId((current) => (current === appId ? null : current)), 1300)
  }

  return (
    <div className="dock-wrap">
      <div
        ref={containerRef}
        className="dock glass"
        data-dock-anchor="fallback"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {items.map((app) => {
          const scale = scales[app.id] ?? 1
          const size = Math.round(BASE * scale)
          const isRunning = running.has(app.id)
          return (
            <button
              key={app.id}
              type="button"
              className="dock-item"
              data-dock-app={app.id}
              data-bounce={bounceId === app.id ? 'true' : 'false'}
              data-preview={preview?.appId === app.id ? 'true' : 'false'}
              style={{ width: size, height: size + 7 }}
              aria-label={app.name}
              title={isRunning ? undefined : app.name}
              onClick={() => activate(app.id)}
              onPointerOver={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hover.enter(app, e.currentTarget)
              }}
              onPointerOut={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hover.leave()
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                previews.hide(0)
                openAppJumpList(app, { x: e.clientX, y: e.clientY }, 'dock')
              }}
            >
              <span className="dock-tip glass !border-0 rounded-lg">{app.name}</span>
              <AppIconTile icon={app.icon} tint={app.tint} size={size} radius={Math.max(11, Math.round(size * 0.24))} />
              <span
                className="dock-dot block h-[4px] w-[4px] rounded-full transition-opacity"
                style={{ background: 'var(--text)', opacity: isRunning ? 0.85 : 0 }}
              />
            </button>
          )
        })}

        <div className="dock-sep" />

        <button
          type="button"
          className="dock-item trash-item"
          style={{ width: BASE, height: BASE + 7 }}
          title="Trash"
          onClick={() => activate('files')}
        >
          <span className="dock-tip glass !border-0 rounded-lg">Trash</span>
          <span
            className="grid place-items-center rounded-[10px] border"
            style={{
              width: BASE,
              height: BASE,
              borderColor: 'var(--line-strong)',
              background: 'var(--hover)',
            }}
          >
            <Trash2 size={Math.round(BASE * 0.46)} className="text-muted" />
          </span>
        </button>
      </div>
    </div>
  )
}
