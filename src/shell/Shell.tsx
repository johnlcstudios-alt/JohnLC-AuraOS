import { useEffect } from 'react'
import { Wallpaper } from './Wallpaper'
import { DesktopIcons } from './DesktopIcons'
import { TopBar } from './TopBar'
import { Dock } from './Dock'
import { Taskbar } from './Taskbar'
import { Spotlight } from './Spotlight'
import { CommandPalette } from './CommandPalette'
import { ControlCenter } from './ControlCenter'
import { Widgets } from './Widgets'
import { StartMenu } from './StartMenu'
import { Toaster } from './Toaster'
import { NotificationCenter } from './NotificationCenter'
import { MissionControl } from './MissionControl'
import { ClipboardHistory } from './ClipboardHistory'
import { QuickLook } from './QuickLook'
import { WindowSwitcher } from './WindowSwitcher'
import { WorkspaceBar } from './WorkspaceBar'
import { HotCorners } from './HotCorners'
import { ForceQuit } from './ForceQuit'
import { AppPreviewHost } from './AppPreviewHost'
import { WindowLayer } from '../windows/WindowLayer'
import { ContextMenuHost } from '../ui/ContextMenuHost'
import { DialogHost } from '../ui/DialogHost'
import { computeWorkArea } from '../core/wm/useWindowManager'
import { wm } from '../core/wm/WindowManager'
import { useSystem, useTheme } from '../core/hooks'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { buildDesktopItemMenu, openDesktopMenu } from './desktopMenu'
import { contextMenu } from '../core/contextMenu'

/**
 * The JohnLC AuraOS shell: wallpaper, desktop icons, window layer, top bar,
 * dock/taskbar and every overlay. Shell mode (dock vs taskbar) and window
 * chrome style both come from the theme engine.
 */
export function Shell() {
  const themeState = useTheme()
  const systemState = useSystem()
  useGlobalShortcuts()

  // keep the window-manager work area in sync with viewport + shell chrome
  useEffect(() => {
    const sync = () => wm.setWorkArea(computeWorkArea())
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => wm.setWorkArea(computeWorkArea()), 0)
    return () => window.clearTimeout(id)
  }, [themeState.shellMode, themeState.windowChrome])

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: 'var(--surface)' }}>
      <Wallpaper />

      <DesktopIcons
        onClear={() => wm.clearPreview()}
        onBackgroundContext={(e) => openDesktopMenu(e.clientX, e.clientY)}
        onItemContext={(e, item) => contextMenu.open(buildDesktopItemMenu(item), { x: e.clientX, y: e.clientY }, item.label)}
      />

      <WindowLayer />

      <TopBar />
      <Dock />
      <Taskbar />
      <WorkspaceBar />

      <Spotlight />
      <CommandPalette />
      <ControlCenter />
      <Widgets />
      <StartMenu />
      <NotificationCenter />
      <ClipboardHistory />
      <MissionControl />
      <QuickLook />
      <ForceQuit />
      <WindowSwitcher />
      <HotCorners />
      <Toaster />

      <ContextMenuHost />
      <AppPreviewHost />
      <DialogHost />

      <div className="brightness-veil" style={{ opacity: (1 - systemState.brightness) * 0.78 }} />
      {systemState.nightLight ? <div className="nightlight-veil" /> : null}
    </div>
  )
}
