import { Copy, ExternalLink, Eye, FolderOpen, Info, Layers, Monitor, Moon, Plus, Settings as SettingsIcon, Sparkles, Trash2, Wallpaper as WallpaperIcon } from 'lucide-react'
import type { ContextMenuItem } from '../core/contextMenu'
import { bridge } from '../core/ipc/bridge'
import { dialogs } from '../core/dialogs'
import { notify } from '../core/notifications'
import { clipboardHistory } from '../core/clipboard'
import { quickLook } from '../core/quickLook'
import { wm } from '../core/wm/WindowManager'
import { theme } from '../core/theme/ThemeEngine'
import { WALLPAPERS } from '../core/theme/wallpapers'
import { launchApp } from '../core/apps/registry'
import { ui } from '../core/uiStore'
import { contextMenu as ctx } from '../core/contextMenu'
import type { DeskItem } from './DesktopIcons'

export function humanSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** Context menu for the empty desktop background. */
export function buildDesktopMenu(): ContextMenuItem[] {
  const cycleWallpaper = (): void => {
    const current = theme.get('wallpaper')
    const index = WALLPAPERS.findIndex((w) => w.id === current)
    const next = WALLPAPERS[(index + 1) % WALLPAPERS.length]
    theme.set({ wallpaper: next.id, customWallpaper: null, customWallpaperData: null })
    notify({ title: `Wallpaper: ${next.name}`, kind: 'info', appId: 'system', banner: false })
  }

  return [
    {
      label: 'New Folder…',
      icon: Plus,
      onSelect: () => {
        void (async () => {
          const name = await dialogs.prompt({ title: 'New Folder', message: 'Folder name', defaultValue: 'Untitled Folder' })
          if (!name) return
          try {
            await bridge.fs.mkdir(`~/Desktop/${name}`)
            notify({ title: 'Folder created', body: `~/Desktop/${name}`, kind: 'success', appId: 'files' })
          } catch (error) {
            notify({ title: 'Could not create folder', body: error instanceof Error ? error.message : '', kind: 'error', appId: 'files' })
          }
        })()
      },
    },
    {
      label: 'New Text File…',
      icon: Plus,
      onSelect: () => {
        void (async () => {
          const name = await dialogs.prompt({ title: 'New Text File', message: 'File name', defaultValue: 'Untitled.txt' })
          if (!name) return
          try {
            await bridge.fs.writeText(`~/Desktop/${name}`, '')
            notify({ title: 'File created', body: `~/Desktop/${name}`, kind: 'success', appId: 'files' })
          } catch (error) {
            notify({ title: 'Could not create file', body: error instanceof Error ? error.message : '', kind: 'error', appId: 'files' })
          }
        })()
      },
    },
    { separator: true },
    { label: 'Next Wallpaper', icon: WallpaperIcon, onSelect: cycleWallpaper },
    {
      label: 'Live Wallpaper',
      icon: Sparkles,
      checked: theme.get('liveWallpaper'),
      onSelect: () => theme.set({ liveWallpaper: !theme.get('liveWallpaper') }),
    },
    {
      label: 'Personalize…',
      icon: SettingsIcon,
      onSelect: () => void launchApp('settings', { section: 'personalization' }),
    },
    { separator: true },
    { label: 'Show All Windows (Mission Control)', icon: Layers, onSelect: () => ui.open('mission-control') },
    {
      label: 'Show Desktop',
      onSelect: () => {
        for (const w of wm.windowsOn(wm.activeDesktop)) wm.minimize(w.id)
      },
    },
    {
      label: 'Toggle Dark Appearance',
      icon: Moon,
      onSelect: () => theme.toggleDark(),
    },
    { separator: true },
    {
      label: 'Display Settings',
      icon: Monitor,
      onSelect: () => void launchApp('settings', { section: 'display' }),
    },
  ]
}

/** Context menu for a desktop shortcut. */
export function buildDesktopItemMenu(item: DeskItem): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    { label: 'Open', icon: ExternalLink, onSelect: () => item.run() },
  ]

  if (item.path) {
    items.push(
      { label: 'Open in New Files Window', icon: FolderOpen, onSelect: () => void launchApp('files', { path: item.path }) },
      { label: 'Quick Look', icon: Eye, onSelect: () => quickLook.open(item.path as string) },
      {
        label: 'Reveal in File Manager',
        icon: FolderOpen,
        onSelect: () => void bridge.fs.reveal(item.path as string).catch(() => undefined),
      },
      {
        label: 'Copy Path',
        icon: Copy,
        onSelect: () => {
          void bridge.clipboard.writeText(item.path as string)
          clipboardHistory.noteWrite(item.path as string)
          notify({ title: 'Path copied', kind: 'success', appId: 'files', banner: false })
        },
      },
      { separator: true },
      {
        label: 'Get Info',
        icon: Info,
        onSelect: () => {
          void (async () => {
            try {
              const stat = await bridge.fs.stat(item.path as string)
              await dialogs.alert({
                title: stat.name,
                message: `${stat.kind === 'dir' ? 'Folder' : `${stat.ext.toUpperCase() || 'File'}`} · ${humanSize(stat.size)}`,
                detail: stat.path,
              })
            } catch (error) {
              await dialogs.alert({ title: item.label, message: error instanceof Error ? error.message : 'Not available' })
            }
          })()
        },
      },
    )
  }

  items.push(
    { separator: true },
    {
      label: 'Move to Trash',
      icon: Trash2,
      danger: true,
      disabled: !item.path || item.id === 'home',
      onSelect: () => {
        void (async () => {
          if (!item.path) return
          const ok = await dialogs.confirm({
            title: 'Move to Trash?',
            message: `“${item.label}” will be moved to the trash.`,
            danger: true,
            confirmLabel: 'Move to Trash',
          })
          if (!ok) return
          try {
            await bridge.fs.trash(item.path)
            notify({ title: 'Moved to Trash', body: item.path, kind: 'info', appId: 'files' })
          } catch (error) {
            notify({ title: 'Could not move to Trash', body: error instanceof Error ? error.message : '', kind: 'error', appId: 'files' })
          }
        })()
      },
    },
  )

  return items
}

/** Open the desktop background menu at the pointer. */
export function openDesktopMenu(x: number, y: number): void {
  ctx.open(buildDesktopMenu(), { x, y })
}
