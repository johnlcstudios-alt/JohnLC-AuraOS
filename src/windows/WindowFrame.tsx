import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Minus, Square, X } from 'lucide-react'
import { tearOffRect, wm } from '../core/wm/WindowManager'
import { findDockAnchor, useWindowManager } from '../core/wm/useWindowManager'
import type { ResizeEdge, WMWindow } from '../core/wm/types'
import { SnapLayoutsMenu } from './SnapLayoutsMenu'
import { openWindowMenu } from './windowMenu'
import { useTheme } from '../core/hooks'
import { getApp } from '../core/apps/registry'
import { AppIconTile } from '../ui/controls'

const EDGE_STYLE: Record<ResizeEdge, CSSProperties> = {
  n: { top: 0, left: 10, right: 10, height: 5, cursor: 'ns-resize' },
  s: { bottom: 0, left: 10, right: 10, height: 5, cursor: 'ns-resize' },
  w: { top: 10, bottom: 10, left: 0, width: 5, cursor: 'ew-resize' },
  e: { top: 10, bottom: 10, right: 0, width: 5, cursor: 'ew-resize' },
  nw: { top: 0, left: 0, width: 14, height: 14, cursor: 'nwse-resize' },
  ne: { top: 0, right: 0, width: 14, height: 14, cursor: 'nesw-resize' },
  sw: { bottom: 0, left: 0, width: 14, height: 14, cursor: 'nesw-resize' },
  se: { bottom: 0, right: 0, width: 14, height: 14, cursor: 'nwse-resize' },
}

const EDGE_CURSOR: Record<ResizeEdge, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  w: 'ew-resize',
  e: 'ew-resize',
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  se: 'nwse-resize',
}

const EDGES: ResizeEdge[] = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']

export function WindowFrame({ win, children, onScreen = true }: { win: WMWindow; children: ReactNode; onScreen?: boolean }) {
  const wmState = useWindowManager()
  const themeState = useTheme()
  const chrome = themeState.windowChrome
  const rect = win.rect
  const minimized = win.state === 'minimized'
  const [snapOpen, setSnapOpen] = useState(false)

  const dragRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const snapTimerRef = useRef<number | null>(null)
  const app = getApp(win.appId)

  // ---- minimize target: fly to the dock/taskbar icon -----------------------
  const dockTarget =
    minimized && !win.hidden ? findDockAnchor(win.appId) : null

  const animate = dockTarget
    ? {
        x: dockTarget.x - (rect.x + rect.w / 2),
        y: dockTarget.y - (rect.y + rect.h / 2),
        scale: 0.14,
        opacity: 0,
      }
    : { x: 0, y: 0, scale: 1, opacity: 1 }

  // ---- global cursor while interacting with THIS window ---------------------
  useEffect(() => {
    const interaction = wmState.interaction
    if (!interaction || interaction.id !== win.id) return
    if (wmState.phase === 'dragging') {
      document.body.style.cursor = 'grabbing'
      return () => {
        document.body.style.cursor = ''
      }
    }
    if (wmState.phase === 'resizing' && interaction.kind === 'resize') {
      document.body.style.cursor = EDGE_CURSOR[interaction.edge]
      return () => {
        document.body.style.cursor = ''
      }
    }
    return
  }, [wmState.phase, wmState.interaction, win.id])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (snapTimerRef.current !== null) clearTimeout(snapTimerRef.current)
    },
    [],
  )

  // ---- titlebar dragging ----------------------------------------------------
  const onTitlePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    wm.focus(win.id)

    const current = rect
    let offset = { x: e.clientX - current.x, y: e.clientY - current.y }
    let override: typeof current | undefined

    if (win.state === 'maximized') {
      // "tear off": restore the pre-maximize size and grab it under the cursor
      override = tearOffRect(win, wmState.workArea, { x: e.clientX, y: e.clientY })
      offset = { x: e.clientX - override.x, y: e.clientY - override.y }
    }

    offsetRef.current = offset
    lastPointerRef.current = { x: e.clientX, y: e.clientY }
    dragRef.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer capture is best-effort */
    }
    wm.dispatch({ type: 'dragStart', id: win.id, offset, rect: override })
    if (snapOpen) setSnapOpen(false)
  }

  const scheduleDrag = () => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (!dragRef.current) return
      wm.dispatch({
        type: 'dragMove',
        id: win.id,
        x: lastPointerRef.current.x - offsetRef.current.x,
        y: lastPointerRef.current.y - offsetRef.current.y,
      })
    })
  }

  const onTitlePointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    lastPointerRef.current = { x: e.clientX, y: e.clientY }
    scheduleDrag()
  }

  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = false
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    wm.dispatch({ type: 'dragEnd', id: win.id })
  }

  // ---- resizing -------------------------------------------------------------
  const startResize = (edge: ResizeEdge) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || win.state === 'maximized') return
    e.stopPropagation()
    wm.focus(win.id)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    wm.dispatch({
      type: 'resizeStart',
      id: win.id,
      edge,
      pointer: { x: e.clientX, y: e.clientY },
    })
  }

  const onResizeMove = (e: RPointerEvent<HTMLDivElement>) => {
    const interaction = wmState.interaction
    if (!interaction || interaction.kind !== 'resize' || interaction.id !== win.id) return
    wm.dispatch({ type: 'resizeMove', id: win.id, pointer: { x: e.clientX, y: e.clientY } })
  }

  const onResizeEnd = (e: RPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    wm.dispatch({ type: 'resizeEnd', id: win.id })
  }

  // ---- snap layouts hover ---------------------------------------------------
  const openSnapMenu = () => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    snapTimerRef.current = window.setTimeout(() => setSnapOpen(true), 360)
  }
  const closeSnapMenu = () => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    snapTimerRef.current = window.setTimeout(() => setSnapOpen(false), 280)
  }
  const selectSnap = (region: Parameters<typeof wm.snapTo>[1]) => {
    setSnapOpen(false)
    wm.snapTo(win.id, region)
  }

  const focused = wmState.focusedId === win.id
  const controlsInteractive = win.state !== 'minimized'

  const maximizeControl = (
    <div
      className="relative"
      onMouseEnter={openSnapMenu}
      onMouseLeave={closeSnapMenu}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {chrome === 'macos' ? (
        <button
          type="button"
          className="traffic traffic-max"
          data-dim={!focused ? 'true' : 'false'}
          title="Zoom (hover for snap layouts)"
          aria-label="Zoom"
          onClick={() => controlsInteractive && wm.toggleMaximize(win.id)}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M1 4.5V1h3.5M7 3.5V7H3.5" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="icon-btn h-[30px] w-[34px] rounded-none"
          title="Maximize (hover for snap layouts)"
          aria-label="Maximize"
          onClick={() => controlsInteractive && wm.toggleMaximize(win.id)}
        >
          {win.state === 'maximized' || win.state === 'snapped' ? <Copy size={13} /> : <Square size={12} />}
        </button>
      )}
      <AnimatePresence>
        {snapOpen && controlsInteractive ? <SnapLayoutsMenu onSelect={selectSnap} onKeepOpen={(open) => (open ? setSnapOpen(true) : closeSnapMenu())} /> : null}
      </AnimatePresence>
    </div>
  )

  return (
    <motion.div
      className="win-frame"
      data-focused={focused ? 'true' : 'false'}
      data-state={win.state}
      data-app={win.appId}
      data-window-id={win.id}
      data-onscreen={onScreen ? 'true' : 'false'}
      data-desktop={win.desktop}
      initial={{ opacity: 0, scale: 0.94, y: 14 }}
      animate={animate}
      exit={{ opacity: 0, scale: 0.96, y: 10, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}
      onAnimationComplete={() => {
        if (win.state === 'minimized') wm.minimizeSettled(win.id, win.animNonce)
      }}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: (win.alwaysOnTop ? 100000 : 0) + win.zIndex,
        transformOrigin: 'center center',
        visibility: win.hidden || !onScreen ? 'hidden' : 'visible',
        pointerEvents: minimized || !onScreen ? 'none' : 'auto',
      }}
      aria-hidden={!onScreen}
      onPointerDown={() => onScreen && wm.focus(win.id)}
    >
      <div
        className="win-titlebar"
        style={{ zIndex: 20, cursor: win.state === 'maximized' ? 'default' : 'grab' }}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          e.preventDefault()
          openWindowMenu(win, e.clientX, e.clientY)
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          wm.toggleMaximize(win.id)
        }}
      >
        {chrome === 'macos' ? (
          <div
            className="traffic-group relative z-10 flex items-center gap-2"
            onPointerDown={(e) => {
              e.stopPropagation()
              wm.focus(win.id)
            }}
          >
            <button
              type="button"
              className="traffic traffic-close"
              data-dim={!focused ? 'true' : 'false'}
              title="Close"
              aria-label="Close window"
              onClick={() => wm.close(win.id)}
            >
              <X size={8} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className="traffic traffic-min"
              data-dim={!focused ? 'true' : 'false'}
              title="Minimize"
              aria-label="Minimize window"
              onClick={() => wm.minimize(win.id)}
            >
              <Minus size={8} strokeWidth={2.2} />
            </button>
            {maximizeControl}
          </div>
        ) : (
          <div className="relative z-10 flex items-center gap-2.5 pl-1">
            {app ? <AppIconTile icon={app.icon} tint={app.tint} size={16} radius={4} /> : null}
            <span className="max-w-[46%] truncate text-[12.5px] font-medium" style={{ color: focused ? 'var(--text)' : 'var(--text-muted)' }}>
              {win.title}
            </span>
          </div>
        )}

        {chrome === 'macos' ? (
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-center"
            style={{ color: focused ? 'var(--text)' : 'var(--text-muted)' }}
          >
            <span className="truncate px-3 text-[12.5px] font-medium opacity-90">{win.title}</span>
          </div>
        ) : null}

        {chrome === 'windows' ? (
          <div className="ml-auto flex items-center" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="icon-btn h-[30px] w-[34px] rounded-none"
              title="Minimize"
              aria-label="Minimize"
              onClick={() => wm.minimize(win.id)}
            >
              <Minus size={14} />
            </button>
            {maximizeControl}
            <button
              type="button"
              className="icon-btn h-[30px] w-[34px] rounded-none hover:!bg-[#e81123] hover:text-white"
              title="Close"
              aria-label="Close"
              onClick={() => wm.close(win.id)}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
      </div>

      {win.state !== 'maximized'
        ? EDGES.map((edge) => (
            <div
              key={edge}
              className="resize-handle"
              style={EDGE_STYLE[edge]}
              onPointerDown={startResize(edge)}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
              onPointerCancel={onResizeEnd}
            />
          ))
        : null}

      <div className="win-body">{children}</div>
    </motion.div>
  )
}
