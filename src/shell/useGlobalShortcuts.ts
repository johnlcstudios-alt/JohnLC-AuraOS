import { useEffect } from 'react'
import { ui } from '../core/uiStore'
import { wm } from '../core/wm/WindowManager'
import { bus, EVT, type OverlayEvent } from '../core/bus'
import { switcher } from '../core/switcher'
import { shortcuts } from '../core/shortcuts'
import { quickLook } from '../core/quickLook'

/**
 * Global JohnLC AuraOS keyboard shortcuts.
 *
 * Almost everything is data-driven through the shortcut registry
 * (src/core/shortcuts.ts): each key combo maps to an action id, so Settings can
 * rebind them and the command surfaces reuse the same definitions.
 *
 * Special cases handled here:
 *   Mod+Tab        hold to cycle windows, release to focus (window switcher)
 *   Escape         dismiss the top overlay / cancel the switcher
 */

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

/** Most-recently-used first: the front window is index 0. */
function mruWindowIds(): string[] {
  return [...wm.windows].sort((a, b) => b.zIndex - a.zIndex).map((w) => w.id)
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    void shortcuts.init()

    const offOverlay = bus.on<OverlayEvent>(EVT.OVERLAY, ({ name, open }) => {
      if (open === false) ui.close(name)
      else ui.open(name)
    })

    const onKeyDown = (e: KeyboardEvent): void => {
      // --- window switcher (hold + cycle) ---
      if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (e.shiftKey) switcher.back()
        else switcher.show(mruWindowIds())
        return
      }

      if (e.key === 'Escape') {
        if (switcher.isOpen) {
          e.preventDefault()
          switcher.cancel()
          return
        }
        if (quickLook.isOpen) {
          e.preventDefault()
          quickLook.close()
          return
        }
        if (ui.anyOpen) {
          e.preventDefault()
          ui.closeTopmost()
          return
        }
      }

      // Space toggles Quick Look closed (its opener lives in Files / the desktop).
      // stopPropagation so the originating surface does not immediately reopen it.
      if (e.key === ' ' && quickLook.isOpen) {
        e.preventDefault()
        e.stopPropagation()
        quickLook.close()
        return
      }

      // never hijack typing in a field unless a modifier is held
      if (isEditable(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) return

      const action = shortcuts.match(e)
      if (!action) return
      e.preventDefault()
      void action.run()
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      // commit the switcher when the modifier is released
      if (!switcher.isOpen) return
      const mod = e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt'
      if (mod || (e.key !== 'Tab' && !e.ctrlKey && !e.metaKey)) {
        const id = switcher.commit()
        if (id) {
          const win = wm.getSnapshot().windows.find((w) => w.id === id)
          if (win) {
            if (win.desktop !== wm.activeDesktop) wm.switchDesktop(win.desktop)
            if (win.state === 'minimized') wm.restore(id)
            else wm.focus(id)
          }
        }
      }
    }

    const onBlur = (): void => {
      if (switcher.isOpen) switcher.cancel()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      offOverlay()
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
