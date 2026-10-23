import { useMemo } from 'react'
import { CloudSun, BatteryCharging, LayoutGrid, Search, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import { appList, launchApp, pinnedApps } from '../core/apps/registry'
import { appPins } from '../core/apps/pins'
import { previews } from '../core/previews'
import { wm } from '../core/wm/WindowManager'
import { useWindowManager } from '../core/wm/useWindowManager'
import { useStore, useSystem, useTheme } from '../core/hooks'
import { ui } from '../core/uiStore'
import { AppIconTile } from '../ui/controls'
import { Clock } from './TopBar'
import { openAppJumpList } from './jumpList'
import { useAppHover } from './useAppHover'

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="taskbar-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="#a06bff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#taskbar-logo)" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="#fff" strokeWidth="3" />
    </svg>
  )
}

/**
 * Windows 11 style centered taskbar (Personalization → shell mode "taskbar").
 * Start button, search pill, pinned/running app buttons with progressive
 * underlines, weather widget on the left, tray + clock on the right.
 */
export function Taskbar() {
  const { windows, focusedId } = useWindowManager()
  const themeState = useTheme()
  const system = useSystem()
  const uiState = useStore(ui)
  // subscribing to the pin store keeps pinned/unpinned apps in sync
  const pins = useStore(appPins)
  const preview = useStore(previews)
  const hover = useAppHover('taskbar')

  const pinned = useMemo(() => pinnedApps(), [pins])

  if (themeState.shellMode !== 'taskbar') return null

  const focusedWin = windows.find((w) => w.id === focusedId)
  const running = new Set(windows.map((w) => w.appId))
  const extras = appList().filter((a) => !a.pinned && running.has(a.id) && !pinned.some((p) => p.id === a.id))
  const items = [...pinned, ...extras]

  const activate = (appId: string) => {
    const top = wm.topOfApp(appId)
    if (top) wm.activateApp(appId)
    else launchApp(appId)
  }

  return (
    <div className="taskbar">
      {/* left: weather widget (Win11) */}
      <button
        type="button"
        className="task-btn !h-[40px] rounded-xl"
        data-active={uiState.widgets ? 'true' : 'false'}
        onClick={() => ui.toggle('widgets')}
        title="Widgets"
      >
        <CloudSun size={19} className="text-muted" />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[12px]">21°C</span>
          <span className="text-[10px] text-faint">Partly sunny</span>
        </span>
      </button>

      {/* center cluster */}
      <div className="task-center">
        <button
          type="button"
          className="task-btn !px-2.5"
          data-active={uiState.start ? 'true' : 'false'}
          onClick={() => ui.toggle('start')}
          title="Start"
          aria-label="Start"
        >
          <Logo />
        </button>

        <button
          type="button"
          className="task-btn !h-[34px] rounded-full border !px-3.5"
          style={{ width: 172, background: 'var(--hover)', borderColor: 'var(--line)' }}
          onClick={() => ui.toggle('spotlight')}
          title="Search"
        >
          <Search size={14} className="text-muted" />
          <span className="text-[12px] text-muted">Search</span>
        </button>

        <button
          type="button"
          className="task-btn !px-2.5"
          data-active={uiState['mission-control'] ? 'true' : 'false'}
          onClick={() => ui.toggle('mission-control')}
          title="Task View"
          aria-label="Task View"
        >
          <LayoutGrid size={18} className="text-muted" />
        </button>

        {items.map((app) => {
          const count = windows.filter((w) => w.appId === app.id).length
          const active = focusedWin?.appId === app.id
          return (
            <button
              key={app.id}
              type="button"
              className="task-btn !px-2.5"
              data-task-app={app.id}
              data-running={count > 0 ? 'true' : 'false'}
              data-active={active ? 'true' : 'false'}
              data-preview={preview?.appId === app.id ? 'true' : 'false'}
              title={count > 0 ? undefined : app.name}
              aria-label={app.name}
              onClick={() => activate(app.id)}
              onPointerOver={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hover.enter(app, e.currentTarget)
              }}
              onPointerOut={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hover.leave()
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                previews.hide(0)
                openAppJumpList(app, { x: e.clientX, y: e.clientY }, 'taskbar')
              }}
            >
              <AppIconTile icon={app.icon} tint={app.tint} size={25} radius={7} />
            </button>
          )
        })}
      </div>

      {/* right: tray */}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className="status-btn"
          data-open={uiState['control-center'] ? 'true' : 'false'}
          onClick={() => ui.toggle('control-center')}
          title="Quick settings"
        >
          {system.wifi ? <Wifi size={15} /> : <WifiOff size={15} className="opacity-55" />}
          {system.muted ? <VolumeX size={15} className="opacity-55" /> : <Volume2 size={15} />}
          <span className="flex items-center gap-1 text-[11.5px] text-muted">
            <BatteryCharging size={15} />
            {Math.round(system.battery)}%
          </span>
        </button>
        <button
          type="button"
          className="status-btn flex-col !items-end !gap-0 px-2 leading-tight"
          data-open={uiState.widgets ? 'true' : 'false'}
          onClick={() => ui.toggle('widgets')}
          title="Clock"
        >
          <span className="text-[12px] tabular-nums">
            <Clock />
          </span>
        </button>
      </div>
    </div>
  )
}
