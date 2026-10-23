import type {
  DesktopInfo,
  OpenWindowOptions,
  Rect,
  ResizeEdge,
  Size,
  SnapRegion,
  WMAction,
  WMState,
  WMWindow,
  WindowVisualState,
} from './types'
import { magnetRegion, regionRect } from './snap'

const DEFAULT_WORK_AREA: Rect = { x: 8, y: 34, w: 1264, h: 700 }
const CASCADE_STEP = 28
const MIN_WIDTH = 320
const MIN_HEIGHT = 200

export function createInitialState(): WMState {
  const first: DesktopInfo = { id: 'd1', name: 'Desktop 1' }
  return {
    windows: [],
    focusedId: null,
    phase: 'idle',
    interaction: null,
    snapPreview: null,
    workArea: DEFAULT_WORK_AREA,
    seq: 10,
    desktops: [first],
    activeDesktop: first.id,
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/** Cascade placement for freshly opened windows. */
function cascadeRect(size: Size, workArea: Rect, index: number): Rect {
  const step = (index % 7) * CASCADE_STEP
  const w = Math.min(size.w, Math.max(MIN_WIDTH, workArea.w - 60))
  const h = Math.min(size.h, Math.max(MIN_HEIGHT, workArea.h - 60))
  const x = clamp(workArea.x + 40 + step, workArea.x, workArea.x + Math.max(0, workArea.w - w))
  const y = clamp(workArea.y + 28 + step, workArea.y, workArea.y + Math.max(0, workArea.h - h))
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

/** Geometry used when "tearing off" a maximized/snapped window mid-drag. */
export function tearOffRect(win: WMWindow, workArea: Rect, pointer: { x: number; y: number }): Rect {
  const base = win.restoreRect.w > 0 ? win.restoreRect : cascadeRect({ w: 900, h: 620 }, workArea, 0)
  return {
    x: Math.round(pointer.x - base.w * 0.5),
    y: Math.round(pointer.y - 19), // keep the cursor on the titlebar
    w: base.w,
    h: base.h,
  }
}

function applyResize(edge: ResizeEdge, start: Rect, dx: number, dy: number, min: Size, bounds: Rect): Rect {
  let { x, y, w, h } = start

  if (edge.includes('e')) w = start.w + dx
  if (edge.includes('s')) h = start.h + dy
  if (edge.includes('w')) {
    w = start.w - dx
    x = start.x + dx
  }
  if (edge.includes('n')) {
    h = start.h - dy
    y = start.y + dy
  }

  if (w < min.w) {
    if (edge.includes('w')) x -= min.w - w
    w = min.w
  }
  if (h < min.h) {
    if (edge.includes('n')) y -= min.h - h
    h = min.h
  }

  // keep the window inside the work area on the north edge and the left/top bounds
  if (y < bounds.y) {
    h -= bounds.y - y
    y = bounds.y
  }
  if (x < bounds.x) {
    w -= bounds.x - x
    x = bounds.x
  }
  const maxRight = bounds.x + bounds.w
  const maxBottom = bounds.y + bounds.h
  if (x + w > maxRight) w = maxRight - x
  if (y + h > maxBottom) h = maxBottom - y

  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

function withWindow(state: WMState, id: string, fn: (win: WMWindow) => WMWindow): WMState {
  let changed = false
  const windows = state.windows.map((win) => {
    if (win.id !== id) return win
    const next = fn(win)
    if (next !== win) changed = true
    return next
  })
  return changed ? { ...state, windows } : state
}

/** Bring a window to the front of the z-order and mark focus. */
function raise(state: WMState, id: string): WMState {
  const target = state.windows.find((w) => w.id === id)
  if (!target) return state
  const z = state.seq + 1
  const rest = state.windows.filter((w) => w.id !== id)
  const raised: WMWindow = { ...target, zIndex: z, focused: true }
  const windows = [...rest.map((w) => (w.focused ? { ...w, focused: false } : w)), raised]
  return { ...state, windows, focusedId: id, seq: z }
}

/** Focus the topmost window on a desktop, or clear focus when it is empty. */
function focusDesktop(state: WMState, desktop: string): WMState {
  const onDesktop = state.windows.filter((w) => w.desktop === desktop)
  const top = onDesktop[onDesktop.length - 1]
  const focusedId = top ? top.id : null
  const windows = state.windows.map((w) => ({ ...w, focused: w.id === focusedId }))
  return { ...state, windows, focusedId }
}

export function wmReducer(state: WMState, action: WMAction): WMState {
  switch (action.type) {
    case 'workArea': {
      if (
        state.workArea.x === action.rect.x &&
        state.workArea.y === action.rect.y &&
        state.workArea.w === action.rect.w &&
        state.workArea.h === action.rect.h
      ) {
        return state
      }
      const workArea = action.rect
      // re-fit maximized / snapped windows to the new work area
      const windows = state.windows.map((win) => {
        if (win.state === 'maximized') return { ...win, rect: regionRect('max', workArea) }
        if (win.state === 'snapped' && win.snapRegion) return { ...win, rect: regionRect(win.snapRegion, workArea) }
        return win
      })
      return { ...state, workArea, windows }
    }

    case 'open': {
      const opts: OpenWindowOptions = action
      const rect = cascadeRect(opts.size, state.workArea, opts.cascadeIndex ?? state.windows.length)
      const z = state.seq + 1
      const win: WMWindow = {
        id: opts.id,
        appId: opts.appId,
        title: opts.title,
        args: opts.args ?? {},
        rect,
        restoreRect: rect,
        state: 'normal',
        snapRegion: null,
        zIndex: z,
        focused: true,
        minSize: opts.minSize ?? { w: MIN_WIDTH, h: MIN_HEIGHT },
        hidden: false,
        createdAt: Date.now(),
        animNonce: 0,
        restoreState: 'normal',
        desktop: state.activeDesktop,
        alwaysOnTop: false,
      }
      return {
        ...state,
        windows: [...state.windows.map((w) => (w.focused ? { ...w, focused: false } : w)), win],
        focusedId: win.id,
        seq: z,
      }
    }

    case 'close': {
      const windows = state.windows.filter((w) => w.id !== action.id)
      let focusedId = state.focusedId
      if (focusedId === action.id) {
        const top = windows[windows.length - 1]
        focusedId = top ? top.id : null
        if (top) {
          windows[windows.length - 1] = { ...top, focused: true }
        }
      }
      return { ...state, windows, focusedId }
    }

    case 'focus':
      return raise(state, action.id)

    case 'setTitle':
      return withWindow(state, action.id, (w) => (w.title === action.title ? w : { ...w, title: action.title }))

    case 'minimize':
      return withWindow(state, action.id, (w) =>
        w.state === 'minimized'
          ? w
          : { ...w, state: 'minimized', restoreState: w.state, hidden: false, animNonce: w.animNonce + 1 },
      )

    case 'minimizeSettled':
      return withWindow(state, action.id, (w) =>
        w.state === 'minimized' && w.animNonce === action.nonce ? { ...w, hidden: true } : w,
      )

    case 'restore': {
      const win = state.windows.find((w) => w.id === action.id)
      if (!win) return state
      const next = withWindow(state, action.id, (w) =>
        w.state !== 'minimized'
          ? w
          : { ...w, state: w.restoreState === 'minimized' ? 'normal' : w.restoreState, hidden: false, animNonce: w.animNonce + 1 },
      )
      return raise(next, action.id)
    }

    case 'toggleMaximize': {
      const win = state.windows.find((w) => w.id === action.id)
      if (!win) return state
      if (win.state === 'maximized' || win.state === 'snapped') {
        const next = withWindow(state, action.id, (w) => ({
          ...w,
          state: 'normal',
          snapRegion: null,
          rect: w.restoreRect,
        }))
        return raise(next, action.id)
      }
      const next = withWindow(state, action.id, (w) => ({
        ...w,
        restoreRect: w.state === 'normal' ? w.rect : w.restoreRect,
        state: 'maximized',
        snapRegion: 'max',
        rect: regionRect('max', state.workArea),
      }))
      return raise(next, action.id)
    }

    case 'maximize': {
      const win = state.windows.find((w) => w.id === action.id)
      if (!win || win.state === 'maximized') return state
      const next = withWindow(state, action.id, (w) => ({
        ...w,
        restoreRect: w.state === 'normal' ? w.rect : w.restoreRect,
        state: 'maximized',
        snapRegion: 'max',
        rect: regionRect('max', state.workArea),
      }))
      return raise(next, action.id)
    }

    case 'unmaximize': {
      const win = state.windows.find((w) => w.id === action.id)
      if (!win || (win.state !== 'maximized' && win.state !== 'snapped')) return state
      const next = withWindow(state, action.id, (w) => ({
        ...w,
        state: 'normal',
        snapRegion: null,
        rect: w.restoreRect,
      }))
      return raise(next, action.id)
    }

    case 'applySnap': {
      const win = state.windows.find((w) => w.id === action.id)
      if (!win) return state
      const next = withWindow(state, action.id, (w) => ({
        ...w,
        restoreRect: w.state === 'normal' ? w.rect : w.restoreRect,
        state: action.region === 'max' ? 'maximized' : 'snapped',
        snapRegion: action.region,
        rect: action.rect,
      }))
      return { ...raise(next, action.id), snapPreview: null, phase: 'idle', interaction: null }
    }

    case 'dragStart': {
      const win = state.windows.find((w) => w.id === action.id)
      if (!win) return state
      const raised = raise(state, action.id)
      const override = action.rect
      const windows = raised.windows.map((w) =>
        w.id === action.id
          ? {
              ...w,
              rect: override ?? w.rect,
              state: (override ? 'normal' : w.state) as WindowVisualState,
              snapRegion: override ? null : w.snapRegion,
              restoreRect: w.state === 'normal' && !override ? w.rect : w.restoreRect,
            }
          : w,
      )
      return {
        ...raised,
        windows,
        phase: 'dragging',
        interaction: { kind: 'drag', id: action.id, offset: action.offset },
      }
    }

    case 'dragMove': {
      const interaction = state.interaction
      if (!interaction || interaction.kind !== 'drag' || interaction.id !== action.id) return state
      const area = state.workArea
      const win = state.windows.find((w) => w.id === action.id)
      if (!win) return state
      const x = clamp(action.x, area.x - (win.rect.w - 140), area.x + area.w - 140)
      const y = clamp(action.y, area.y, area.y + area.h - 40)
      const rect = { ...win.rect, x: Math.round(x), y: Math.round(y) }
      const region = magnetRegion(action.x + win.rect.w / 2, action.y + 19, area)
      const snapPreview = region ? { region, rect: regionRect(region, area) } : null
      return { ...withWindow(state, action.id, (w) => ({ ...w, rect })), snapPreview }
    }

    case 'dragEnd': {
      const interaction = state.interaction
      if (!interaction || interaction.kind !== 'drag') {
        return { ...state, phase: 'idle', interaction: null, snapPreview: null }
      }
      const preview = state.snapPreview
      const next: WMState = { ...state, phase: 'idle', interaction: null, snapPreview: null }
      if (preview && preview.region) {
        return wmReducer(next, { type: 'applySnap', id: interaction.id, region: preview.region, rect: preview.rect })
      }
      return next
    }

    case 'resizeStart': {
      const win = state.windows.find((w) => w.id === action.id)
      if (!win) return state
      const raised = raise(state, action.id)
      return {
        ...raised,
        windows: raised.windows.map((w) =>
          w.id === action.id
            ? {
                ...w,
                // resizing a maximized/snapped window drops it back to a plain window
                state: 'normal' as WindowVisualState,
                snapRegion: null,
                restoreRect: w.state === 'normal' ? w.rect : w.restoreRect,
              }
            : w,
        ),
        phase: 'resizing',
        interaction: {
          kind: 'resize',
          id: action.id,
          edge: action.edge,
          startRect: win.rect,
          startPointer: action.pointer,
        },
      }
    }

    case 'resizeMove': {
      const interaction = state.interaction
      if (!interaction || interaction.kind !== 'resize' || interaction.id !== action.id) return state
      const win = state.windows.find((w) => w.id === action.id)
      if (!win) return state
      const dx = action.pointer.x - interaction.startPointer.x
      const dy = action.pointer.y - interaction.startPointer.y
      const minSize: Size = win.minSize ?? { w: MIN_WIDTH, h: MIN_HEIGHT }
      const rect = applyResize(interaction.edge, interaction.startRect, dx, dy, minSize, state.workArea)
      return withWindow(state, action.id, (w) => ({ ...w, rect }))
    }

    case 'resizeEnd':
      return { ...state, phase: 'idle', interaction: null }

    case 'clearPreview':
      return state.snapPreview ? { ...state, snapPreview: null } : state

    case 'toggleAlwaysOnTop': {
      const win = state.windows.find((w) => w.id === action.id)
      if (!win) return state
      return withWindow(state, action.id, (w) => ({ ...w, alwaysOnTop: !w.alwaysOnTop }))
    }

    case 'desktopSwitch': {
      if (action.id === state.activeDesktop) return state
      if (!state.desktops.some((d) => d.id === action.id)) return state
      return focusDesktop({ ...state, activeDesktop: action.id }, action.id)
    }

    case 'desktopAdd': {
      const id = action.id ?? `d${state.seq}${state.desktops.length + 1}`
      const name = action.name ?? `Desktop ${state.desktops.length + 1}`
      if (state.desktops.some((d) => d.id === id)) return state
      const desktops = [...state.desktops, { id, name }]
      return focusDesktop({ ...state, desktops, activeDesktop: id }, id)
    }

    case 'desktopRemove': {
      if (state.desktops.length <= 1) return state
      const index = state.desktops.findIndex((d) => d.id === action.id)
      if (index < 0) return state
      const desktops = state.desktops.filter((d) => d.id !== action.id)
      const fallback = desktops[Math.max(0, index - 1)] ?? desktops[0]
      const windows = state.windows.map((w) => (w.desktop === action.id ? { ...w, desktop: fallback.id } : w))
      const activeDesktop = state.activeDesktop === action.id ? fallback.id : state.activeDesktop
      return focusDesktop({ ...state, desktops, windows, activeDesktop }, activeDesktop)
    }

    case 'desktopRename':
      return {
        ...state,
        desktops: state.desktops.map((d) => (d.id === action.id ? { ...d, name: action.name } : d)),
      }

    case 'windowToDesktop': {
      if (!state.desktops.some((d) => d.id === action.desktop)) return state
      const moved = withWindow(state, action.id, (w) => ({ ...w, desktop: action.desktop }))
      if (action.desktop === state.activeDesktop) return moved
      // moving off the active desktop: hand focus to a remaining window
      return focusDesktop(moved, state.activeDesktop)
    }

    case 'hydrate': {
      const desktops = action.desktops.length ? action.desktops : state.desktops
      const activeDesktop = desktops.some((d) => d.id === action.activeDesktop) ? action.activeDesktop : desktops[0].id
      const windows = action.windows.map((w) => ({
        ...w,
        desktop: desktops.some((d) => d.id === w.desktop) ? w.desktop : activeDesktop,
        focused: false,
      }))
      const seq = windows.reduce((max, w) => Math.max(max, w.zIndex), state.seq)
      const focused = windows.filter((w) => w.desktop === activeDesktop)
      const top = focused[focused.length - 1]
      const focusedId = top ? top.id : null
      return {
        ...state,
        windows: windows.map((w) => (w.id === focusedId ? { ...w, focused: true } : w)),
        desktops,
        activeDesktop,
        focusedId,
        seq,
      }
    }

    default:
      return state
  }
}

/**
 * WindowManager: a tiny observable store around the pure reducer above.
 * Framework agnostic on purpose - the React binding lives in useWindowManager.ts.
 */
export class WindowManager {
  private state: WMState = createInitialState()
  private listeners = new Set<() => void>()
  private idSeq = 0
  /** per-window "are you sure?" hooks consulted by `close` (TextEdit & friends) */
  private closeGuards = new Map<string, () => boolean | Promise<boolean>>()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): WMState => this.state

  dispatch(action: WMAction): void {
    const next = wmReducer(this.state, action)
    if (next === this.state) return
    this.state = next
    this.listeners.forEach((fn) => fn())
  }

  // ---- convenience API -----------------------------------------------------

  nextId(appId: string): string {
    this.idSeq += 1
    return `${appId}-${this.idSeq}`
  }

  open(appId: string, title: string, size: Size, minSize?: Size, args?: Record<string, unknown>): string {
    const id = this.nextId(appId)
    this.dispatch({ type: 'open', id, appId, title, size, minSize, args, cascadeIndex: this.state.windows.length })
    return id
  }

  close(id: string): void {
    const guard = this.closeGuards.get(id)
    if (guard && this.state.windows.some((w) => w.id === id)) {
      void Promise.resolve()
        .then(() => guard())
        .then((proceed) => {
          if (proceed) this.forceClose(id)
        })
        .catch(() => undefined)
      return
    }
    this.forceClose(id)
  }

  /** Close without consulting the guard (Force Quit, "Quit" jump list). */
  forceClose(id: string): void {
    this.closeGuards.delete(id)
    this.dispatch({ type: 'close', id })
  }

  /**
   * Register a hook that may veto a close (unsaved-document prompts). The guard
   * resolves `true` to let the window go, `false` to keep it open. Returns a
   * disposer that must be called when the window unmounts.
   */
  addCloseGuard(id: string, fn: () => boolean | Promise<boolean>): () => void {
    this.closeGuards.set(id, fn)
    return () => {
      if (this.closeGuards.get(id) === fn) this.closeGuards.delete(id)
    }
  }

  focus(id: string): void {
    if (this.state.focusedId !== id) this.dispatch({ type: 'focus', id })
    else this.dispatch({ type: 'focus', id })
  }

  minimize(id: string): void {
    this.dispatch({ type: 'minimize', id })
  }

  restore(id: string): void {
    this.dispatch({ type: 'restore', id })
  }

  toggleMaximize(id: string): void {
    this.dispatch({ type: 'toggleMaximize', id })
  }

  /** Maximize without toggling (used by the "maximize" shortcut). */
  maximize(id: string): void {
    this.dispatch({ type: 'maximize', id })
  }

  /** Restore a maximized/snapped window to its previous floating geometry. */
  unmaximize(id: string): void {
    this.dispatch({ type: 'unmaximize', id })
  }

  snapTo(id: string, region: SnapRegion): void {
    this.dispatch({ type: 'applySnap', id, region, rect: regionRect(region, this.state.workArea) })
  }

  minimizeSettled(id: string, nonce: number): void {
    this.dispatch({ type: 'minimizeSettled', id, nonce })
  }

  setWorkArea(rect: Rect): void {
    this.dispatch({ type: 'workArea', rect })
  }

  setTitle(id: string, title: string): void {
    this.dispatch({ type: 'setTitle', id, title })
  }

  clearPreview(): void {
    this.dispatch({ type: 'clearPreview' })
  }

  // ---- virtual desktops ---------------------------------------------------

  switchDesktop(id: string): void {
    this.dispatch({ type: 'desktopSwitch', id })
  }

  addDesktop(): string {
    const id = `d${Date.now().toString(36)}`
    this.dispatch({ type: 'desktopAdd', id })
    return id
  }

  removeDesktop(id: string): void {
    this.dispatch({ type: 'desktopRemove', id })
  }

  renameDesktop(id: string, name: string): void {
    this.dispatch({ type: 'desktopRename', id, name })
  }

  moveToDesktop(id: string, desktop: string): void {
    this.dispatch({ type: 'windowToDesktop', id, desktop })
  }

  toggleAlwaysOnTop(id: string): void {
    this.dispatch({ type: 'toggleAlwaysOnTop', id })
  }

  get activeDesktop(): string {
    return this.state.activeDesktop
  }

  get desktops(): DesktopInfo[] {
    return this.state.desktops
  }

  windowsOn(desktop: string): WMWindow[] {
    return this.state.windows.filter((w) => w.desktop === desktop)
  }

  /** Replace the whole session (used by session restore). */
  hydrate(snapshot: { windows: WMWindow[]; desktops: DesktopInfo[]; activeDesktop: string }): void {
    this.dispatch({ type: 'hydrate', ...snapshot })
  }

  // ---- queries ------------------------------------------------------------

  get windows(): WMWindow[] {
    return this.state.windows
  }

  ofApp(appId: string): WMWindow[] {
    return this.state.windows.filter((w) => w.appId === appId)
  }

  topOfApp(appId: string): WMWindow | undefined {
    const list = this.ofApp(appId)
    return list.length ? list[list.length - 1] : undefined
  }

  get focused(): WMWindow | undefined {
    return this.state.windows.find((w) => w.id === this.state.focusedId)
  }

  /** Focus the topmost window of an app, un-minimizing it when needed. */
  activateApp(appId: string): WMWindow | undefined {
    const top = this.topOfApp(appId)
    if (!top) return undefined
    return this.activateWindow(top.id)
  }

  /**
   * Focus one specific window: follow it to its desktop, restore it when it is
   * minimized, otherwise raise it. Used by Dock/Taskbar window previews.
   */
  activateWindow(id: string): WMWindow | undefined {
    const target = this.state.windows.find((w) => w.id === id)
    if (!target) return undefined
    // clicking a Dock/Taskbar icon follows the window to its desktop
    if (target.desktop !== this.state.activeDesktop) this.switchDesktop(target.desktop)
    const current = this.state.windows.find((w) => w.id === id)
    if (current?.state === 'minimized') this.restore(id)
    else this.focus(id)
    return target
  }
}

export const wm = new WindowManager()
