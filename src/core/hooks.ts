import { useSyncExternalStore } from 'react'
import type { SystemState } from './system/systemStore'
import { system } from './system/systemStore'
import type { ThemeView } from './theme/ThemeEngine'
import { theme } from './theme/ThemeEngine'
import type { MediaSnapshot } from './media'
import { media } from './media'

interface ReadableStore<T> {
  subscribe: (fn: () => void) => () => void
  getSnapshot: () => T
}

export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function useTheme(): ThemeView {
  return useStore(theme)
}

export function useSystem(): SystemState {
  return useStore(system)
}

export function useMedia(): MediaSnapshot {
  return useStore(media)
}

/** Re-render when the theme engine re-resolves light/dark (auto mode). */
export function useResolvedTheme(): 'light' | 'dark' {
  useStore(theme)
  return theme.getResolved()
}
