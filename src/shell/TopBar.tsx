import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  BatteryCharging,
  Bell,
  Bluetooth,
  BluetoothOff,
  ClipboardList,
  LayoutGrid,
  MoonStar,
  Search,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { bridge } from '../core/ipc/bridge'
import { useSystem, useTheme, useStore } from '../core/hooks'
import { notifications } from '../core/notifications'
import { system as systemStore } from '../core/system/systemStore'
import { ui } from '../core/uiStore'
import { wm } from '../core/wm/WindowManager'
import { useWindowManager } from '../core/wm/useWindowManager'
import { launchApp } from '../core/apps/registry'
import { theme } from '../core/theme/ThemeEngine'
import { MenuList, type MenuItemDef } from '../ui/controls'
import type { OverlayId } from '../core/uiStore'

const IS_MAC = bridge.platform === 'darwin' || (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? ''))
const MOD = IS_MAC ? '⌘' : 'Ctrl+'

export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const date = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  return (
    <span className="tabular-nums">
      {date}&nbsp;&nbsp;{time}
    </span>
  )
}

function Logo() {
  return (
    <svg width="15" height="15" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="topbar-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="#a06bff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#topbar-logo)" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="#fff" strokeWidth="3" />
    </svg>
  )
}

export function TopBar() {
  const system = useSystem()
  const themeState = useTheme()
  const wmState = useWindowManager()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const closeTimer = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const focusedWin = wmState.windows.find((w) => w.id === wmState.focusedId)
  const appName = focusedWin?.appId ? titleFor(focusedWin.appId) : 'JohnLC AuraOS'

  useEffect(() => {
    if (!openMenu) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [openMenu])

  const show = (id: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenMenu(id)
  }
  const scheduleHide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 240)
  }

  const fileMenus = (): MenuItemDef[] => [
    { label: 'New Terminal Window', shortcut: `${MOD}T`, onSelect: () => launchApp('terminal') },
    { label: 'New Finder Window', shortcut: `${MOD}N`, onSelect: () => launchApp('files') },
    { separator: true },
    {
      label: 'Close Window',
      shortcut: `${MOD}W`,
      disabled: !focusedWin,
      onSelect: () => focusedWin && wm.close(focusedWin.id),
    },
    { separator: true },
    { label: 'Open…', shortcut: `${MOD}O`, disabled: true },
    { label: 'Save', shortcut: `${MOD}S`, disabled: true },
  ]

  const editMenus = (): MenuItemDef[] => [
    { label: 'Undo', shortcut: `${MOD}Z`, disabled: true },
    { separator: true },
    { label: 'Cut', shortcut: `${MOD}X`, disabled: true },
    { label: 'Copy', shortcut: `${MOD}C`, disabled: true },
    { label: 'Paste', shortcut: `${MOD}V`, disabled: true },
    { label: 'Select All', shortcut: `${MOD}A`, disabled: true },
  ]

  const viewMenus = (): MenuItemDef[] => [
    {
      label: `Switch to ${themeState.resolved === 'dark' ? 'Light' : 'Dark'} Mode`,
      onSelect: () => theme.toggleDark(),
    },
    {
      label: `Switch to ${themeState.shellMode === 'dock' ? 'Taskbar' : 'Dock'} Mode`,
      onSelect: () => theme.set({ shellMode: themeState.shellMode === 'dock' ? 'taskbar' : 'dock' }),
    },
    { separator: true },
    { label: 'Mission Control', checked: ui.getSnapshot()['mission-control'], onSelect: () => ui.toggle('mission-control') },
    { label: 'Notification Center', checked: ui.getSnapshot()['notification-center'], onSelect: () => ui.toggle('notification-center') },
    { label: 'Clipboard History', checked: ui.getSnapshot().clipboard, onSelect: () => ui.toggle('clipboard') },
    { separator: true },
    { label: 'Show Widgets', checked: ui.getSnapshot().widgets, onSelect: () => ui.toggle('widgets') },
    { label: 'Show Control Center', onSelect: () => ui.toggle('control-center') },
  ]

  const windowMenus = (): MenuItemDef[] => {
    const items: MenuItemDef[] = [
      {
        label: 'Minimize',
        shortcut: `${MOD}M`,
        disabled: !focusedWin,
        onSelect: () => focusedWin && wm.minimize(focusedWin.id),
      },
      {
        label: 'Zoom',
        disabled: !focusedWin,
        onSelect: () => focusedWin && wm.toggleMaximize(focusedWin.id),
      },
      { separator: true },
    ]
    for (const win of wmState.windows) {
      items.push({
        id: win.id,
        label: win.title,
        checked: win.id === wmState.focusedId,
        onSelect: () => {
          if (win.state === 'minimized') wm.restore(win.id)
          else wm.focus(win.id)
        },
      })
    }
    if (!wmState.windows.length) items.push({ label: 'No Windows', disabled: true })
    return items
  }

  const helpMenus = (): MenuItemDef[] => [
    { label: 'Search…', shortcut: `${MOD}Space`, onSelect: () => ui.toggle('spotlight') },
    { label: 'About JohnLC AuraOS', onSelect: () => launchApp('about') },
    { label: 'Keyboard Shortcuts', onSelect: () => launchApp('settings', { section: 'shortcuts' }) },
  ]

  const standard = [
    { id: 'file', label: 'File', items: fileMenus },
    { id: 'edit', label: 'Edit', items: editMenus },
    { id: 'view', label: 'View', items: viewMenus },
    { id: 'window', label: 'Window', items: windowMenus },
    { id: 'help', label: 'Help', items: helpMenus },
  ]

  const overlayState = useStore(ui)
  const controlOpen = overlayState['control-center']
  const spotOpen = overlayState.spotlight
  const widgetsOpen = overlayState.widgets
  const notifOpen = overlayState['notification-center']
  const clipboardOpen = overlayState.clipboard
  const missionOpen = overlayState['mission-control']
  const notifItems = useStore(notifications)
  const unread = notifItems.some((n) => !n.read)

  const toggle = (name: OverlayId) => ui.toggle(name)

  return (
    <div className="topbar" ref={rootRef}>
      <div className="relative flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
        {/* Apple-menu style logo menu */}
        <div className="relative" onPointerEnter={() => openMenu && show('logo')} onPointerLeave={scheduleHide}>
          <button
            type="button"
            className="top-menu !px-2"
            data-open={openMenu === 'logo' ? 'true' : 'false'}
            onClick={() => setOpenMenu(openMenu === 'logo' ? null : 'logo')}
            aria-label="JohnLC AuraOS menu"
          >
            <Logo />
          </button>
          <AnimatePresence>
            {openMenu === 'logo' ? (
              <div className="absolute left-0 top-[24px]">
                <MenuList
                  width={240}
                  onClose={() => setOpenMenu(null)}
                  items={[
                    { label: 'About JohnLC AuraOS', onSelect: () => launchApp('about') },
                    { label: 'System Settings…', onSelect: () => launchApp('settings') },
                    { label: 'Task Manager', onSelect: () => launchApp('taskmanager') },
                    { separator: true },
                    { label: 'Mission Control', onSelect: () => ui.toggle('mission-control') },
                    { label: 'Force Quit…', onSelect: () => ui.toggle('force-quit') },
                    { separator: true },
                    { label: 'Reload Shell', shortcut: `${MOD}R`, onSelect: () => window.location.reload() },
                    { separator: true },
                    { label: 'Quit JohnLC AuraOS', shortcut: `${MOD}Q`, danger: true, onSelect: () => void bridge.app.quit() },
                  ]}
                />
              </div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Focused-app menu (macOS global menu) */}
        <div className="relative" onPointerEnter={() => openMenu && show('app')} onPointerLeave={scheduleHide}>
          <button
            type="button"
            className="top-menu font-semibold"
            data-open={openMenu === 'app' ? 'true' : 'false'}
            onClick={() => setOpenMenu(openMenu === 'app' ? null : 'app')}
          >
            {appName}
          </button>
          <AnimatePresence>
            {openMenu === 'app' ? (
              <div className="absolute left-0 top-[24px]">
                <MenuList
                  width={250}
                  onClose={() => setOpenMenu(null)}
                  items={[
                    { label: `About ${appName}`, onSelect: () => launchApp('about') },
                    { separator: true },
                    {
                      label: `Hide ${appName}`,
                      shortcut: `${MOD}H`,
                      disabled: !focusedWin,
                      onSelect: () => focusedWin && wm.minimize(focusedWin.id),
                    },
                    {
                      label: `Close ${appName}`,
                      shortcut: `${MOD}W`,
                      disabled: !focusedWin,
                      onSelect: () => focusedWin && wm.close(focusedWin.id),
                    },
                    { separator: true },
                    { label: 'Settings…', shortcut: `${MOD},`, onSelect: () => launchApp('settings') },
                  ]}
                />
              </div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Standard menus */}
        {standard.map((menu) => (
          <div
            key={menu.id}
            className="relative"
            onPointerEnter={() => openMenu && show(menu.id)}
            onPointerLeave={scheduleHide}
          >
            <button
              type="button"
              className="top-menu"
              data-open={openMenu === menu.id ? 'true' : 'false'}
              onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
            >
              {menu.label}
            </button>
            <AnimatePresence>
              {openMenu === menu.id ? (
                <div className="absolute left-0 top-[24px]">
                  <MenuList
                    width={menu.id === 'window' ? 260 : 250}
                    onClose={() => setOpenMenu(null)}
                    items={menu.items()}
                  />
                </div>
              ) : null}
            </AnimatePresence>
          </div>
        ))}
        <span className="ml-1 hidden text-[11px] text-faint xl:inline">
          {focusedWin ? `${wmState.windows.length} window${wmState.windows.length === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {/* Status tray */}
      <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
        {system.focus ? (
          <button
            type="button"
            className="status-btn !gap-1"
            onClick={() => systemStore.toggle('focus')}
            aria-label="Do Not Disturb is on — click to turn off"
            title="Do Not Disturb is on (click to turn off)"
            data-dnd="on"
          >
            <MoonStar size={13} />
            <span className="text-[10.5px]">DND</span>
          </button>
        ) : null}

        <button
          type="button"
          className="status-btn"
          data-open={controlOpen ? 'true' : 'false'}
          onClick={() => toggle('control-center')}
          aria-label="Control center"
          title="Control Center"
        >
          <span className="flex items-center gap-2">
            {system.wifi ? <Wifi size={15} /> : <WifiOff size={15} className="opacity-55" />}
            {system.bluetooth ? <Bluetooth size={15} /> : <BluetoothOff size={15} className="opacity-55" />}
            {system.muted || system.volume === 0 ? (
              <VolumeX size={15} className={system.muted ? 'opacity-55' : ''} />
            ) : (
              <Volume2 size={15} />
            )}
            <span className="flex items-center gap-1 text-[11.5px] text-muted">
              <BatteryCharging size={16} className={system.charging ? '' : 'opacity-70'} />
              {Math.round(system.battery)}%
            </span>
          </span>
        </button>

        <button
          type="button"
          className="status-btn"
          data-open={missionOpen ? 'true' : 'false'}
          onClick={() => toggle('mission-control')}
          aria-label="Mission Control"
          title="Mission Control (F3)"
        >
          <LayoutGrid size={14} />
        </button>

        <button
          type="button"
          className="status-btn"
          data-open={clipboardOpen ? 'true' : 'false'}
          onClick={() => toggle('clipboard')}
          aria-label="Clipboard History"
          title="Clipboard History (Ctrl+Shift+V)"
        >
          <ClipboardList size={14} />
        </button>

        <button
          type="button"
          className="status-btn relative"
          data-open={notifOpen ? 'true' : 'false'}
          onClick={() => toggle('notification-center')}
          aria-label="Notification Center"
          title="Notifications (Ctrl+Shift+N)"
        >
          <Bell size={14} />
          {unread ? (
            <span
              className="absolute right-1 top-1 h-[6px] w-[6px] rounded-full"
              style={{ background: 'var(--danger)' }}
            />
          ) : null}
        </button>

        <button
          type="button"
          className="status-btn"
          data-open={spotOpen ? 'true' : 'false'}
          onClick={() => toggle('spotlight')}
          aria-label="Search"
          title="Search (Ctrl+Space)"
        >
          <Search size={14} />
        </button>

        <button
          type="button"
          className="status-btn text-[12.5px]"
          data-open={widgetsOpen ? 'true' : 'false'}
          onClick={() => toggle('widgets')}
          title="Widgets & clock"
        >
          <Clock />
        </button>
      </div>
    </div>
  )
}

function titleFor(appId: string): string {
  const map: Record<string, string> = {
    files: 'Finder',
    terminal: 'Terminal',
    settings: 'Settings',
    taskmanager: 'Task Manager',
    about: 'About JohnLC AuraOS',
  }
  return map[appId] ?? appId
}
