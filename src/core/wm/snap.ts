import type { Rect, SnapRegion } from './types'

/** Resolve a logical snap region into concrete geometry inside the work area. */
export function regionRect(region: SnapRegion, area: Rect): Rect {
  const { x, y, w, h } = area
  const halfW = Math.floor(w / 2)
  const halfH = Math.floor(h / 2)
  const thirdW = Math.floor(w / 3)
  const twoThirds = Math.floor((w * 2) / 3)
  switch (region) {
    case 'max':
      return { x, y, w, h }
    case 'left':
      return { x, y, w: halfW, h }
    case 'right':
      return { x: x + w - halfW, y, w: halfW, h }
    case 'top':
      return { x, y, w, h: halfH }
    case 'bottom':
      return { x, y: y + h - halfH, w, h: halfH }
    case 'tl':
      return { x, y, w: halfW, h: halfH }
    case 'tr':
      return { x: x + w - halfW, y, w: halfW, h: halfH }
    case 'bl':
      return { x, y: y + h - halfH, w: halfW, h: halfH }
    case 'br':
      return { x: x + w - halfW, y: y + h - halfH, w: halfW, h: halfH }
    case 'third-left':
      return { x, y, w: thirdW, h }
    case 'third-center':
      return { x: x + thirdW, y, w: thirdW, h }
    case 'third-right':
      return { x: x + w - thirdW, y, w: thirdW, h }
    case 'left-two-thirds':
      return { x, y, w: twoThirds, h }
    case 'right-one-third':
      return { x: x + w - thirdW, y, w: thirdW, h }
    default:
      return { x, y, w, h }
  }
}

export interface SnapCell {
  region: SnapRegion
  label: string
  /** normalized preview geometry, 0..1 */
  nx: number
  ny: number
  nw: number
  nh: number
}

export interface SnapLayout {
  id: string
  name: string
  cells: SnapCell[]
}

const THIRD = 1 / 3
const TWO_THIRDS = 2 / 3

/** Windows 11 style layout chooser shown when hovering the maximize control. */
export const SNAP_LAYOUTS: SnapLayout[] = [
  {
    id: 'halves',
    name: 'Side by side',
    cells: [
      { region: 'left', label: 'Snap left', nx: 0, ny: 0, nw: 0.5, nh: 1 },
      { region: 'right', label: 'Snap right', nx: 0.5, ny: 0, nw: 0.5, nh: 1 },
    ],
  },
  {
    id: 'thirds',
    name: 'Three columns',
    cells: [
      { region: 'third-left', label: 'Left third', nx: 0, ny: 0, nw: THIRD, nh: 1 },
      { region: 'third-center', label: 'Center third', nx: THIRD, ny: 0, nw: THIRD, nh: 1 },
      { region: 'third-right', label: 'Right third', nx: TWO_THIRDS, ny: 0, nw: THIRD, nh: 1 },
    ],
  },
  {
    id: 'quad',
    name: 'Quadrants',
    cells: [
      { region: 'tl', label: 'Top left', nx: 0, ny: 0, nw: 0.5, nh: 0.5 },
      { region: 'tr', label: 'Top right', nx: 0.5, ny: 0, nw: 0.5, nh: 0.5 },
      { region: 'bl', label: 'Bottom left', nx: 0, ny: 0.5, nw: 0.5, nh: 0.5 },
      { region: 'br', label: 'Bottom right', nx: 0.5, ny: 0.5, nw: 0.5, nh: 0.5 },
    ],
  },
  {
    id: 'wide',
    name: 'Wide left, narrow right',
    cells: [
      { region: 'left-two-thirds', label: 'Left two thirds', nx: 0, ny: 0, nw: TWO_THIRDS, nh: 1 },
      { region: 'right-one-third', label: 'Right third', nx: TWO_THIRDS, ny: 0, nw: THIRD, nh: 1 },
    ],
  },
]

export const REGION_LABELS: Record<SnapRegion, string> = {
  max: 'Maximized',
  left: 'Snapped left',
  right: 'Snapped right',
  top: 'Top half',
  bottom: 'Bottom half',
  tl: 'Top left',
  tr: 'Top right',
  bl: 'Bottom left',
  br: 'Bottom right',
  'third-left': 'Left third',
  'third-center': 'Center third',
  'third-right': 'Right third',
  'left-two-thirds': 'Left two thirds',
  'right-one-third': 'Right third',
}

/**
 * Edge magnetism: decide which region (if any) the pointer is currently
 * hovering while dragging a window. Corners win over edges.
 */
export function magnetRegion(px: number, py: number, area: Rect, threshold = 16): SnapRegion | null {
  const nearLeft = px - area.x <= threshold
  const nearRight = area.x + area.w - px <= threshold
  const nearTop = py - area.y <= threshold
  const nearBottom = area.y + area.h - py <= 8

  if (nearTop && nearLeft) return 'tl'
  if (nearTop && nearRight) return 'tr'
  if (nearBottom && nearLeft) return 'bl'
  if (nearBottom && nearRight) return 'br'
  if (nearTop) return 'top'
  if (nearLeft) return 'left'
  if (nearRight) return 'right'
  if (nearBottom) return 'bottom'
  return null
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}
