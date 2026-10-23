import { AppWindow, ExternalLink, Pin, PinOff, X } from 'lucide-react'
import type { AppDef } from '../core/apps/types'
import { appPins } from '../core/apps/pins'
import { launchApp } from '../core/apps/registry'
import { contextMenu, type ContextMenuItem } from '../core/contextMenu'
import { notify } from '../core/notifications'
import { wm } from '../core/wm/WindowManager'

export type JumpListOrigin = 'dock' | 'taskbar'

/**
 * Build the right-click jump list for a Dock/Taskbar icon.
 *
 * Layout mirrors the real thing: the app's own tasks first (Calculator modes,
 * Notes "New Note", …), then every open window of that app, then pin/unpin and
 * quit. Pinning is persisted by the pin store, so it survives a restart.
 */
export function buildAppJumpList(app: AppDef, origin: JumpListOrigin): ContextMenuItem[] {
  const state = wm.getSnapshot()
  const windows = wm.ofApp(app.id)
  const pinned = appPins.isPinned(app.id, !!app.pinned)
  const items: ContextMenuItem[] = []

  for (const task of app.tasks ?? []) {
    items.push({
      id: `task-${task.id}`,
      label: task.label,
      icon: task.icon,
      onSelect: () => {
        if (task.run) void task.run()
        else launchApp(app.id, task.args)
      },
    })
  }
  if (items.length) items.push({ separator: true })

  if (windows.length) {
    for (const win of windows) {
      items.push({
        id: `win-${win.id}`,
        label: win.title,
        icon: app.icon,
        checked: state.focusedId === win.id,
        onSelect: () => wm.activateWindow(win.id),
      })
    }
    if (!app.singleton) {
      items.push({ id: 'new-window', label: 'New Window', icon: AppWindow, onSelect: () => launchApp(app.id) })
    }
  } else {
    items.push({ id: 'open', label: 'Open', icon: ExternalLink, onSelect: () => launchApp(app.id) })
  }

  items.push({ separator: true })
  items.push({
    id: 'pin',
    label: pinned ? `Remove from ${origin === 'dock' ? 'Dock' : 'Taskbar'}` : `Keep in ${origin === 'dock' ? 'Dock' : 'Taskbar'}`,
    icon: pinned ? PinOff : Pin,
    onSelect: () => {
      const next = appPins.toggle(app.id, !!app.pinned)
      notify({
        title: `${app.name} ${next ? 'pinned to' : 'removed from'} the ${origin === 'dock' ? 'Dock' : 'Taskbar'}`,
        kind: 'info',
        appId: 'system',
        banner: false,
      })
    },
  })

  if (windows.length) {
    items.push({ separator: true })
    items.push({
      id: 'quit',
      label: windows.length > 1 ? `Quit ${windows.length} Windows` : 'Quit',
      shortcut: 'Ctrl+Q',
      icon: X,
      danger: true,
      onSelect: () => {
        // "Quit" is explicit: it never stops on unsaved-work prompts
        for (const win of wm.ofApp(app.id)) wm.forceClose(win.id)
      },
    })
  }

  return items
}

/** Open the jump list at a pointer position. */
export function openAppJumpList(app: AppDef, point: { x: number; y: number }, origin: JumpListOrigin): void {
  contextMenu.open(buildAppJumpList(app, origin), point, app.name)
}
