import { actions, type ActionDef } from './actions'
import { bridge } from './ipc/bridge'
import { registerBuiltinActions } from './builtinActions'

/**
 * Keyboard shortcut layer.
 *
 * A binding is `combo -> actionId`. Combos are normalized to a canonical token
 * string ("Mod+Alt+ArrowLeft") so the same default works across platforms:
 *   Mod   = Cmd on macOS, Ctrl elsewhere
 *   Ctrl  = the literal Control key (only surfaced when it is NOT the Mod key)
 *   Super = the Windows / Command key on non-mac platforms
 */

const IS_MAC =
  bridge.platform === 'darwin' ||
  (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? navigator.userAgent ?? ''))

/** Canonical token for the pressed key (layout-independent where possible). */
export function keyToken(e: KeyboardEvent): string | null {
  const code = e.code
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const map: Record<string, string> = {
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    Backslash: '\\',
    Space: 'Space',
    Escape: 'Escape',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
  }
  if (map[code]) return map[code]
  if (/^F\d{1,2}$/.test(code)) return code
  if (e.key && e.key.length === 1) return e.key.toUpperCase()
  return e.key || null
}

/** Canonical combo string for a keyboard event, or null when a bare modifier. */
export function eventCombo(e: KeyboardEvent): string | null {
  const token = keyToken(e)
  if (!token) return null
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(token)) return null

  const parts: string[] = []
  const mod = IS_MAC ? e.metaKey : e.ctrlKey
  if (mod) parts.push('Mod')
  if (e.ctrlKey && !mod) parts.push('Ctrl')
  if (e.metaKey && !mod && !IS_MAC) parts.push('Super')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(token)
  return parts.join('+')
}

/** Parse a combo string into its ordering-stable token list. */
function normalize(combo: string): string {
  const tokens = combo
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean)
  const order = ['Mod', 'Ctrl', 'Super', 'Alt', 'Shift']
  const mods = order.filter((m) => tokens.includes(m))
  const keys = tokens.filter((t) => !order.includes(t))
  return [...mods, ...keys].join('+')
}

/** Default bindings, keyed by action id. */
export const DEFAULT_BINDINGS: Record<string, string> = {
  'spotlight.open': 'Mod+Space',
  'commandPalette.open': 'Mod+K',
  'settings.open': 'Mod+,',
  'taskmanager.open': 'Mod+Shift+Escape',
  'terminal.new': 'Mod+Alt+T',
  'files.new': 'Mod+Alt+F',
  'window.close': 'Mod+W',
  'window.minimize': 'Mod+M',
  'window.maximize': 'Mod+Alt+ArrowUp',
  'window.restore': 'Mod+Alt+ArrowDown',
  'window.snapLeft': 'Mod+Alt+ArrowLeft',
  'window.snapRight': 'Mod+Alt+ArrowRight',
  'window.alwaysOnTop': 'Mod+Alt+P',
  'window.moveToDesktop.next': 'Mod+Alt+Shift+]',
  'window.moveToDesktop.prev': 'Mod+Alt+Shift+[',
  'desktop.next': 'Mod+Alt+]',
  'desktop.prev': 'Mod+Alt+[',
  'desktop.new': 'Mod+Alt+N',
  'missionControl.toggle': 'F3',
  'notificationCenter.toggle': 'Mod+Shift+N',
  'clipboardHistory.toggle': 'Mod+Shift+V',
  'theme.toggle': 'Mod+Alt+D',
  'shellMode.toggle': 'Mod+Alt+M',
  'screenshot.capture': 'Mod+Shift+S',
  'system.lock': 'Mod+Alt+L',
  'forceQuit.open': 'Mod+Alt+Escape',
}

export interface ShortcutInfo {
  actionId: string
  title: string
  category: string
  combo: string
  custom: boolean
}

class ShortcutRegistry {
  /** combo -> actionId (rebuilt whenever bindings change) */
  private index = new Map<string, string>()
  /** actionId -> combo (defaults merged with user overrides) */
  private bindings: Record<string, string> = { ...DEFAULT_BINDINGS }
  private overrides: Record<string, string> = {}
  private listeners = new Set<() => void>()
  private ready = false

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): Record<string, string> => this.bindings

  /** Load user overrides and register the built-in actions. */
  async init(): Promise<void> {
    registerBuiltinActions()
    try {
      const saved = await bridge.config.get<Record<string, string>>('shortcuts', {})
      if (saved && typeof saved === 'object') this.overrides = saved
    } catch {
      this.overrides = {}
    }
    this.rebuild()
    this.ready = true
    this.emit()
  }

  private rebuild(): void {
    this.bindings = { ...DEFAULT_BINDINGS, ...this.overrides }
    this.index.clear()
    for (const [actionId, combo] of Object.entries(this.bindings)) {
      this.index.set(normalize(combo), actionId)
    }
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }

  get isReady(): boolean {
    return this.ready
  }

  /** Resolve a keyboard event to the action it should trigger. */
  match(e: KeyboardEvent): ActionDef | undefined {
    const combo = eventCombo(e)
    if (!combo) return undefined
    const actionId = this.index.get(normalize(combo))
    if (!actionId) return undefined
    return actions.get(actionId)
  }

  bindingFor(actionId: string): string {
    return this.bindings[actionId] ?? ''
  }

  isCustom(actionId: string): boolean {
    return actionId in this.overrides
  }

  setBinding(actionId: string, combo: string): void {
    this.overrides = { ...this.overrides, [actionId]: combo }
    this.rebuild()
    void bridge.config.set('shortcuts', this.overrides)
    this.emit()
  }

  resetBinding(actionId: string): void {
    const next = { ...this.overrides }
    delete next[actionId]
    this.overrides = next
    this.rebuild()
    void bridge.config.set('shortcuts', this.overrides)
    this.emit()
  }

  resetAll(): void {
    this.overrides = {}
    this.rebuild()
    void bridge.config.set('shortcuts', {})
    this.emit()
  }

  /** All bindable shortcuts with their resolved combos (for Settings). */
  list(): ShortcutInfo[] {
    return actions
      .all()
      .filter((a) => this.bindings[a.id])
      .map((a) => ({
        actionId: a.id,
        title: a.title,
        category: a.category,
        combo: this.bindings[a.id],
        custom: a.id in this.overrides,
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
  }
}

export const shortcuts = new ShortcutRegistry()

/** Pretty-print a combo for on-screen hints. */
export function prettyCombo(combo: string): string {
  return combo
    .split('+')
    .map((token) => {
      if (token === 'Mod') return IS_MAC ? '⌘' : 'Ctrl'
      if (token === 'Ctrl') return 'Ctrl'
      if (token === 'Super') return IS_MAC ? '⌘' : '⊞'
      if (token === 'Alt') return IS_MAC ? '⌥' : 'Alt'
      if (token === 'Shift') return IS_MAC ? '⇧' : 'Shift'
      return token
    })
    .join(IS_MAC ? '' : '+')
}
