import { accentById, DEFAULT_ACCENT } from './accents'
import { DEFAULT_WALLPAPER } from './wallpapers'
import { bridge } from '../ipc/bridge'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type ShellMode = 'dock' | 'taskbar'
export type ChromeStyle = 'macos' | 'windows'

export interface ThemeState {
  mode: ThemeMode
  accent: string
  wallpaper: string
  customWallpaper: string | null
  customWallpaperData: string | null
  liveWallpaper: boolean
  shellMode: ShellMode
  windowChrome: ChromeStyle
  dockMagnify: boolean
  transparency: boolean
  reduceMotion: boolean
}

export const DEFAULT_THEME: ThemeState = {
  mode: 'dark',
  accent: DEFAULT_ACCENT,
  wallpaper: DEFAULT_WALLPAPER,
  customWallpaper: null,
  customWallpaperData: null,
  liveWallpaper: true,
  shellMode: 'dock',
  windowChrome: 'macos',
  dockMagnify: true,
  transparency: true,
  reduceMotion: false,
}

export type ResolvedTheme = 'light' | 'dark'

/** What components actually subscribe to: persisted prefs + resolved theme. */
export type ThemeView = ThemeState & { resolved: ResolvedTheme }

class ThemeEngine {
  private state: ThemeState = { ...DEFAULT_THEME }
  private snapshot: ThemeView = { ...this.state, resolved: 'dark' }
  private resolved: ResolvedTheme = 'dark'
  private listeners = new Set<() => void>()
  private media: MediaQueryList | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private started = false

  /** boot: load persisted prefs, apply, listen to the OS colour scheme */
  async init(): Promise<void> {
    if (this.started) return
    this.started = true
    try {
      const saved = await bridge.config.get<Partial<ThemeState>>('theme', {})
      this.state = { ...DEFAULT_THEME, ...saved }
      if (this.state.customWallpaper) {
        const data = await bridge.fs.readDataUrl(this.state.customWallpaper).catch(() => null)
        this.state.customWallpaperData = data
      }
    } catch {
      /* first run / corrupt config: defaults are fine */
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.media = window.matchMedia('(prefers-color-scheme: dark)')
      this.media.addEventListener('change', () => this.apply())
    }
    this.apply()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): ThemeView => this.snapshot

  getResolved = (): ResolvedTheme => this.snapshot.resolved

  private syncSnapshot(): void {
    const next: ThemeView = { ...this.state, resolved: this.resolved }
    if (
      next.resolved === this.snapshot.resolved &&
      (Object.keys(next) as (keyof ThemeView)[]).every((k) => next[k] === this.snapshot[k]) &&
      (Object.keys(this.snapshot) as (keyof ThemeView)[]).every((k) => k in next)
    ) {
      return
    }
    this.snapshot = next
  }

  get<K extends keyof ThemeState>(key: K): ThemeState[K] {
    return this.state[key]
  }

  set(patch: Partial<ThemeState>): void {
    this.state = { ...this.state, ...patch }
    this.apply()
    this.persist()
  }

  /** cycle light -> dark -> auto (used by menus / terminal) */
  cycleMode(): ThemeMode {
    const order: ThemeMode[] = ['light', 'dark', 'auto']
    const next = order[(order.indexOf(this.state.mode) + 1) % order.length]
    this.set({ mode: next })
    return next
  }

  toggleDark(): void {
    this.set({ mode: this.resolved === 'dark' ? 'light' : 'dark' })
  }

  async setCustomWallpaper(path: string | null): Promise<void> {
    if (!path) {
      this.set({ customWallpaper: null, customWallpaperData: null })
      return
    }
    const data = await bridge.fs.readDataUrl(path).catch(() => null)
    this.set({ customWallpaper: path, customWallpaperData: data })
  }

  private persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void bridge.config.set('theme', this.state)
    }, 250)
  }

  private apply(): void {
    if (typeof document === 'undefined') return
    this.resolved = this.state.mode === 'auto' ? (this.media?.matches ? 'dark' : 'light') : this.state.mode

    const root = document.documentElement
    root.dataset.theme = this.resolved
    root.dataset.shellMode = this.state.shellMode
    root.dataset.chrome = this.state.windowChrome
    root.dataset.transparency = String(this.state.transparency)
    root.dataset.reduceMotion = String(this.state.reduceMotion)

    const accent = accentById(this.state.accent)
    root.style.setProperty('--accent', accent.hex)
    root.style.setProperty('--accent-rgb', accent.rgb)

    // light/dark wallpapers look wrong with a dark UI: nudge surface tone
    this.syncSnapshot()
    this.listeners.forEach((fn) => fn())
  }
}

export const theme = new ThemeEngine()
export type { ThemeEngine }
