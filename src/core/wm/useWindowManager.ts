import { useSyncExternalStore } from 'react'
import { wm } from './WindowManager'
import type { Rect, WMState } from './types'

/** Subscribe to the whole window-manager state. */
export function useWindowManager(): WMState {
  return useSyncExternalStore(wm.subscribe, wm.getSnapshot, wm.getSnapshot)
}

export function useFocusedWindow() {
  const state = useWindowManager()
  return state.windows.find((w) => w.id === state.focusedId)
}

/**
 * Where should a window fly to when minimized?
 * The Dock/Taskbar tag their icons with data-dock-app / data-task-app so the
 * animation can land exactly on the app icon (macOS genie-ish behaviour).
 */
export function findDockAnchor(appId: string): { x: number; y: number } | null {
  if (typeof document === 'undefined') return null
  const selectors = [`[data-dock-app="${appId}"]`, `[data-task-app="${appId}"]`, '[data-dock-anchor="fallback"]']
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el) {
      const rect = el.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight - 20 }
}

const TOPBAR_H = 28
const BOTTOM_DOCK_RESERVE = 92
const BOTTOM_TASKBAR_RESERVE = 60

/** Compute the usable desktop area from the live shell mode. */
export function computeWorkArea(): Rect {
  const shellMode = document.documentElement.dataset.shellMode ?? 'dock'
  const bottom = shellMode === 'taskbar' ? BOTTOM_TASKBAR_RESERVE : BOTTOM_DOCK_RESERVE
  return {
    x: 8,
    y: TOPBAR_H + 6,
    w: Math.max(320, window.innerWidth - 16),
    h: Math.max(200, window.innerHeight - TOPBAR_H - 6 - bottom),
  }
}
