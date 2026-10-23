import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AppWindow, X } from 'lucide-react'
import { getApp, launchApp } from '../core/apps/registry'
import { PREVIEW_GRACE_MS, previews } from '../core/previews'
import { wm } from '../core/wm/WindowManager'
import { useWindowManager } from '../core/wm/useWindowManager'
import { useStore } from '../core/hooks'
import { AppIconTile } from '../ui/controls'
import type { WMWindow } from '../core/wm/types'

const THUMB_W = 196
const MIN_THUMB_H = 118
const MAX_THUMB_H = 168

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

function stateLabel(win: WMWindow): string {
  if (win.state === 'minimized') return 'Minimized'
  if (win.state === 'maximized') return 'Maximized'
  if (win.state === 'snapped') return 'Snapped'
  return 'Window'
}

/**
 * One window thumbnail.
 *
 * AuraOS windows are ordinary DOM inside a single document, so instead of a
 * raster screenshot we clone the window's live `.win-body` subtree and scale it
 * down: identical markup, identical CSS, no extra dependency and no second
 * instance of the app. The clone is inert (`pointer-events: none`) and the
 * gradient card underneath shows through whenever a clone is not available.
 */
function PreviewThumb({ win, focused }: { win: WMWindow; focused: boolean }) {
  const app = getApp(win.appId)
  const cloneRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState(false)

  const sourceW = Math.max(320, win.rect.w)
  const sourceH = Math.max(200, win.rect.h)
  const scale = THUMB_W / sourceW
  const thumbH = clamp(Math.round(sourceH * scale), MIN_THUMB_H, MAX_THUMB_H)

  useEffect(() => {
    const host = cloneRef.current
    if (!host) return
    let cancelled = false
    // copy after paint so the source window has settled
    const timer = window.setTimeout(() => {
      if (cancelled) return
      try {
        const source = document.querySelector(`.win-frame[data-window-id="${win.id}"] .win-body`)
        if (!source || !source.childNodes.length) return
        host.replaceChildren(...Array.from(source.childNodes).map((node) => node.cloneNode(true)))
        setLive(true)
      } catch {
        /* the gradient card stays as the preview */
      }
    }, 30)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [win.id, sourceW, sourceH, win.title])

  const Icon = app?.icon

  return (
    <div
      className="preview-thumb"
      data-thumb={live ? 'live' : 'card'}
      data-dim={focused ? 'false' : 'true'}
      style={{ width: THUMB_W, height: thumbH }}
    >
      <span
        className="preview-fallback"
        style={{ backgroundImage: `linear-gradient(140deg, ${app?.tint[0] ?? '#4f8cff'}, ${app?.tint[1] ?? '#a06bff'})` }}
      >
        {Icon ? <Icon size={30} /> : null}
      </span>
      <div
        ref={cloneRef}
        className="win-body preview-clone"
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: sourceW,
          height: sourceH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

/**
 * Dock/Taskbar window previews.
 *
 * Rendered once at shell level (like the context menu) and driven by the
 * `previews` store so the magnifying Dock does not have to own a popover per
 * icon. Hovering a running app's icon reveals a live thumbnail per window;
 * clicking one focuses it, the small x closes it.
 */
export function AppPreviewHost() {
  const request = useStore(previews)
  const state = useWindowManager()
  const ref = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<{ id: string; left: number; top: number } | null>(null)

  const app = request ? getApp(request.appId) : undefined
  const windows = request ? state.windows.filter((w) => w.appId === request.appId) : []

  // the app closed its last window while the popover was open
  useEffect(() => {
    if (request && windows.length === 0) previews.hide(0)
  }, [request, windows.length])

  useLayoutEffect(() => {
    if (!request) return
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = clamp(request.anchor.x - width / 2, 10, Math.max(10, window.innerWidth - width - 10))
    const top = Math.max(10, request.anchor.y - height - 12)
    setMeasured({ id: request.id, left: Math.round(left), top: Math.round(top) })
  }, [request, windows.length])

  useEffect(() => {
    if (!request) return
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('.app-previews')) return
      previews.hide(0)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') previews.hide(0)
    }
    const close = () => previews.hide(0)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [request])

  const pos = request && measured?.id === request.id ? measured : null

  return (
    <AnimatePresence>
      {request && app && windows.length ? (
        <motion.div
          ref={ref}
          key="app-previews"
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.11, ease: [0.16, 1, 0.3, 1] }}
          className="app-previews glass-strong"
          data-previews-app={app.id}
          style={{
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            visibility: pos ? 'visible' : 'hidden',
            transformOrigin: 'bottom center',
          }}
          onPointerEnter={() => previews.cancelHide()}
          onPointerLeave={() => previews.hide(PREVIEW_GRACE_MS)}
        >
          <div className="app-previews-head">
            <AppIconTile icon={app.icon} tint={app.tint} size={20} radius={6} />
            <span className="truncate text-[12.5px] font-medium">{app.name}</span>
            <span className="text-[11px] text-faint">
              {windows.length} window{windows.length === 1 ? '' : 's'}
            </span>
            {!app.singleton ? (
              <button
                type="button"
                className="icon-btn !h-[22px] !w-[22px] ml-auto"
                title="New Window"
                aria-label="New Window"
                onClick={() => {
                  launchApp(app.id)
                  previews.hide(0)
                }}
              >
                <AppWindow size={13} />
              </button>
            ) : (
              <span className="ml-auto" />
            )}
            <button
              type="button"
              className="icon-btn !h-[22px] !w-[22px]"
              title="Close previews"
              aria-label="Close previews"
              onClick={() => previews.hide(0)}
            >
              <X size={13} />
            </button>
          </div>

          <div className="preview-strip">
            {windows.map((win) => (
              <div key={win.id} className="preview-item" data-preview-item={win.id}>
                <button
                  type="button"
                  className="preview-open"
                  title={win.title}
                  onClick={() => {
                    wm.activateWindow(win.id)
                    previews.hide(0)
                  }}
                >
                  <PreviewThumb win={win} focused={state.focusedId === win.id} />
                </button>
                <div className="preview-meta">
                  <span className="min-w-0 flex-1 truncate" title={win.title}>
                    {win.title}
                  </span>
                  <button
                    type="button"
                    className="preview-close"
                    title="Close window"
                    aria-label={`Close ${win.title}`}
                    onClick={() => wm.close(win.id)}
                  >
                    <X size={11} />
                  </button>
                </div>
                <div className="preview-state">
                  <span>{stateLabel(win)}</span>
                  <span>{wm.desktops.find((d) => d.id === win.desktop)?.name ?? ''}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
