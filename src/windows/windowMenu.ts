import { ArrowLeftToLine, ArrowRightToLine, Minus, Pin, Square, X } from 'lucide-react'
import type { ContextMenuItem } from '../core/contextMenu'
import { contextMenu } from '../core/contextMenu'
import { wm } from '../core/wm/WindowManager'
import type { WMWindow } from '../core/wm/types'

/** Build the right-click menu for a window's title bar. */
export function buildWindowMenu(win: WMWindow): ContextMenuItem[] {
  const isMax = win.state === 'maximized' || win.state === 'snapped'
  const others = wm.windowsOn(win.desktop).filter((w) => w.id !== win.id && w.state !== 'minimized')

  const desktopSubmenu: ContextMenuItem[] = wm.desktops.map((d) => ({
    label: d.name,
    checked: d.id === win.desktop,
    onSelect: () => wm.moveToDesktop(win.id, d.id),
  }))

  return [
    { label: 'Restore', disabled: !isMax, onSelect: () => wm.unmaximize(win.id) },
    { label: 'Maximize', icon: Square, disabled: isMax, onSelect: () => wm.maximize(win.id) },
    { label: 'Minimize', icon: Minus, onSelect: () => wm.minimize(win.id) },
    { separator: true },
    { label: 'Snap Left', icon: ArrowLeftToLine, disabled: isMax, onSelect: () => wm.snapTo(win.id, 'left') },
    { label: 'Snap Right', icon: ArrowRightToLine, disabled: isMax, onSelect: () => wm.snapTo(win.id, 'right') },
    { separator: true },
    {
      label: 'Always on Top',
      icon: Pin,
      checked: win.alwaysOnTop,
      onSelect: () => wm.toggleAlwaysOnTop(win.id),
    },
    { label: 'Move to Desktop', submenu: desktopSubmenu.length ? desktopSubmenu : [{ label: 'Only one desktop', disabled: true }] },
    { label: 'Minimize Others', disabled: others.length === 0, onSelect: () => others.forEach((w) => wm.minimize(w.id)) },
    { separator: true },
    { label: 'Close', icon: X, danger: true, onSelect: () => wm.close(win.id) },
  ]
}

export function openWindowMenu(win: WMWindow, x: number, y: number): void {
  wm.focus(win.id)
  contextMenu.open(buildWindowMenu(win), { x, y }, win.title)
}
