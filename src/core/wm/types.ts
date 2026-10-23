export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Size {
  w: number
  h: number
}

export type WindowVisualState = 'normal' | 'maximized' | 'snapped' | 'minimized'

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export type WMPhase = 'idle' | 'dragging' | 'resizing'

/** Logical regions produced by edge magnetism, Snap Layouts cells and shortcuts. */
export type SnapRegion =
  | 'max'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'tl'
  | 'tr'
  | 'bl'
  | 'br'
  | 'third-left'
  | 'third-center'
  | 'third-right'
  | 'left-two-thirds'
  | 'right-one-third'

export interface WMWindow {
  id: string
  appId: string
  title: string
  args: Record<string, unknown>
  rect: Rect
  /** geometry to return to when un-maximizing / un-snapping / un-minimizing */
  restoreRect: Rect
  state: WindowVisualState
  /** visual state to return to when un-minimizing */
  restoreState: WindowVisualState
  snapRegion: SnapRegion | null
  zIndex: number
  focused: boolean
  minSize: Size
  /** true once the minimize animation has fully played out */
  hidden: boolean
  createdAt: number
  /** bumped every time a minimize/restore animation begins */
  animNonce: number
  /** virtual desktop the window belongs to */
  desktop: string
  /** kept above ordinary windows (macOS "Float on Top" / always-on-top) */
  alwaysOnTop: boolean
}

/** A virtual desktop / workspace. */
export interface DesktopInfo {
  id: string
  name: string
}

export type Interaction =
  | null
  | { kind: 'drag'; id: string; offset: { x: number; y: number } }
  | { kind: 'resize'; id: string; edge: ResizeEdge; startRect: Rect; startPointer: { x: number; y: number } }

export interface SnapPreview {
  region: SnapRegion | null
  rect: Rect
}

export interface WMState {
  /** ordered back (index 0) to front */
  windows: WMWindow[]
  focusedId: string | null
  phase: WMPhase
  interaction: Interaction
  snapPreview: SnapPreview | null
  workArea: Rect
  /** monotonic z-index source */
  seq: number
  /** virtual desktops (workspaces) and the one currently shown */
  desktops: DesktopInfo[]
  activeDesktop: string
}

export interface OpenWindowOptions {
  id: string
  appId: string
  title: string
  args?: Record<string, unknown>
  size: Size
  minSize?: Size
  cascadeIndex?: number
}

export type WMAction =
  | { type: 'workArea'; rect: Rect }
  | ({ type: 'open' } & OpenWindowOptions)
  | { type: 'close'; id: string }
  | { type: 'focus'; id: string }
  | { type: 'setTitle'; id: string; title: string }
  | { type: 'minimize'; id: string }
  | { type: 'minimizeSettled'; id: string; nonce: number }
  | { type: 'restore'; id: string }
  | { type: 'toggleMaximize'; id: string }
  | { type: 'maximize'; id: string }
  | { type: 'unmaximize'; id: string }
  | { type: 'dragStart'; id: string; offset: { x: number; y: number }; rect?: Rect }
  | { type: 'dragMove'; id: string; x: number; y: number }
  | { type: 'dragEnd'; id: string }
  | { type: 'resizeStart'; id: string; edge: ResizeEdge; pointer: { x: number; y: number } }
  | { type: 'resizeMove'; id: string; pointer: { x: number; y: number } }
  | { type: 'resizeEnd'; id: string }
  | { type: 'applySnap'; id: string; region: SnapRegion | null; rect: Rect }
  | { type: 'clearPreview' }
  | { type: 'toggleAlwaysOnTop'; id: string }
  | { type: 'desktopSwitch'; id: string }
  | { type: 'desktopAdd'; id?: string; name?: string }
  | { type: 'desktopRemove'; id: string }
  | { type: 'desktopRename'; id: string; name: string }
  | { type: 'windowToDesktop'; id: string; desktop: string }
  | { type: 'hydrate'; windows: WMWindow[]; desktops: DesktopInfo[]; activeDesktop: string }
