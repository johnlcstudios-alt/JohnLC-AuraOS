import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BatteryCharging,
  Bluetooth,
  Check,
  Cpu,
  HardDrive,
  Image as ImageIcon,
  Keyboard,
  Laptop,
  LayoutGrid,
  Lock,
  MemoryStick,
  Monitor,
  Moon,
  Palette,
  PanelTop,
  Pin,
  Power,
  Rocket,
  RotateCcw,
  Signal,
  Sun,
  Trash2,
  Volume2,
  Wifi,
  X,
} from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import type { AutoLaunchStatus, SysInfo } from '../../../shared/bridge'
import type { SettingsSectionId } from './sections'
import { SETTINGS_SECTIONS } from './sections'
import { bridge } from '../../core/ipc/bridge'
import { bus, EVT, type AppArgsEvent } from '../../core/bus'
import { theme } from '../../core/theme/ThemeEngine'
import type { ChromeStyle, ShellMode, ThemeMode } from '../../core/theme/ThemeEngine'
import { system } from '../../core/system/systemStore'
import { useSystem, useTheme, useStore } from '../../core/hooks'
import { ACCENTS } from '../../core/theme/accents'
import { WALLPAPERS } from '../../core/theme/wallpapers'
import { Segmented, Slider, Toggle } from '../../ui/controls'
import { shortcuts, prettyCombo, eventCombo } from '../../core/shortcuts'
import { hotCorners, type HotCornerConfig } from '../../core/hotCorners'
import { session } from '../../core/session'
import { wm } from '../../core/wm/WindowManager'
import { useWindowManager } from '../../core/wm/useWindowManager'
import { notifications } from '../../core/notifications'

function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card mb-3">
      {title ? (
        <div className="mb-3">
          <div className="text-[13px] font-medium">{title}</div>
          {subtitle ? <div className="mt-0.5 text-[11.5px] text-faint">{subtitle}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

function SettingRow({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: typeof Sun
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b py-2.5 last:border-b-0" style={{ borderColor: 'var(--line)' }}>
      <span
        className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px]"
        style={{ background: 'rgb(var(--accent-rgb) / 0.14)', color: 'var(--accent)' }}
      >
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px]">{label}</span>
        {hint ? <span className="block truncate text-[11px] text-faint">{hint}</span> : null}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  )
}

/** Inline key recorder used to rebind a global shortcut. */
function ShortcutRecorder({ actionId, onDone }: { actionId: string; onDone: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        shortcuts.resetBinding(actionId)
        onDone()
        return
      }
      const combo = eventCombo(e)
      if (!combo) return // a bare modifier: keep waiting
      if (!combo.includes('+')) return // require at least one modifier
      shortcuts.setBinding(actionId, combo)
      onDone()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [actionId, onDone])
  return (
    <span className="mono rounded-md border px-2 py-1 text-[11px] animate-pulse" style={{ borderColor: 'var(--accent)', background: 'var(--hover)' }}>
      Press keys…
    </span>
  )
}

function bytes(n: number): string {
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d > 0 ? `${d} days ${h} h ${m} min` : h > 0 ? `${h} h ${m} min` : `${m} min`
}

const NETWORKS = [
  { ssid: 'AuraOS-5G', signal: 4, secure: true },
  { ssid: 'AuraOS-2.4G', signal: 3, secure: true },
  { ssid: 'Studio-Guest', signal: 2, secure: false },
  { ssid: 'Neighbour_5G', signal: 1, secure: true },
]

const BLUETOOTH_DEVICES = [
  { name: 'AirPods Pro', kind: 'Headphones', connected: true },
  { name: 'Magic Keyboard', kind: 'Keyboard', connected: true },
  { name: 'MX Master 3S', kind: 'Mouse', connected: false },
]

const AUDIO_OUTPUTS = ['Studio Display Speakers', 'AirPods Pro', 'System Default', 'HDMI Output']

export function SettingsApp({ windowId, args }: AppProps) {
  const themeState = useTheme()
  const systemState = useSystem()
  const [section, setSection] = useState<SettingsSectionId>(
    (typeof args.section === 'string' ? (args.section as SettingsSectionId) : 'appearance'),
  )
  const [info, setInfo] = useState<SysInfo | null>(null)
  const [autoLaunch, setAutoLaunch] = useState<AutoLaunchStatus | null>(null)
  const [autoLaunchBusy, setAutoLaunchBusy] = useState(false)
  const [audioOut, setAudioOut] = useState(AUDIO_OUTPUTS[0])
  const [recording, setRecording] = useState<string | null>(null)
  const bindings = useStore(shortcuts)
  const hotCornerState = useStore(hotCorners)
  const wmState = useWindowManager()
  const notifItems = useStore(notifications)

  useEffect(() => {
    void bridge.system
      .info()
      .then(setInfo)
      .catch(() => undefined)
    void bridge.app
      .getAutoLaunch()
      .then(setAutoLaunch)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const off = bus.on<AppArgsEvent>(EVT.APP_ARGS, (event) => {
      if (event.windowId !== windowId) return
      if (typeof event.args.section === 'string') setSection(event.args.section as SettingsSectionId)
    })
    return off
  }, [windowId])

  const memoryPct = info ? ((info.totalMem - info.freeMem) / info.totalMem) * 100 : 0

  const updateAutoLaunch = async (next: boolean) => {
    if (!autoLaunch?.supported) return
    setAutoLaunchBusy(true)
    try {
      const status = await bridge.app.setAutoLaunch(next)
      setAutoLaunch(status)
      if (!status.supported) {
        bus.emit(EVT.TOAST, { text: status.detail, kind: 'warn' })
      } else {
        bus.emit(EVT.TOAST, {
          text: status.enabled ? 'JohnLC AuraOS will open when you sign in' : 'Auto-start disabled',
          kind: 'success',
        })
      }
    } catch {
      bus.emit(EVT.TOAST, { text: 'Could not update auto-start', kind: 'warn' })
    } finally {
      setAutoLaunchBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full min-h-0">
      <div className="sidebar !w-[196px] !flex-[0_0_196px]">
        <div className="mb-3 flex items-center gap-2.5 px-2 pt-1">
          <span
            className="grid h-[38px] w-[38px] place-items-center rounded-full text-[15px] font-semibold text-white"
            style={{ backgroundImage: 'linear-gradient(145deg, var(--accent), #a06bff)' }}
          >
            {(info?.user ?? 'U').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium">{info?.user ?? 'Local user'}</span>
            <span className="block truncate text-[10.5px] text-faint">{info?.hostname ?? 'auraos'}</span>
          </span>
        </div>
        {SETTINGS_SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              type="button"
              className="side-item"
              data-active={section === s.id ? 'true' : 'false'}
              onClick={() => setSection(s.id)}
            >
              <Icon size={15} />
              <span className="truncate">{s.name}</span>
            </button>
          )
        })}
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
          <h1 className="mb-4 text-[19px] font-semibold">{SETTINGS_SECTIONS.find((s) => s.id === section)?.name}</h1>

          {section === 'appearance' ? (
            <>
              <Card title="Appearance" subtitle="Choose how JohnLC AuraOS looks across every window.">
                <SettingRow icon={themeState.resolved === 'dark' ? Moon : Sun} label="Theme" hint="Light, dark or follow the system">
                  <Segmented<ThemeMode>
                    value={themeState.mode}
                    onChange={(mode) => theme.set({ mode })}
                    options={[
                      { value: 'light', label: 'Light', icon: Sun },
                      { value: 'dark', label: 'Dark', icon: Moon },
                      { value: 'auto', label: 'Auto' },
                    ]}
                  />
                </SettingRow>
                <SettingRow icon={Palette} label="Window controls" hint="Traffic lights or Windows 11 style buttons">
                  <Segmented<ChromeStyle>
                    value={themeState.windowChrome}
                    onChange={(windowChrome) => theme.set({ windowChrome })}
                    options={[
                      { value: 'macos', label: 'macOS' },
                      { value: 'windows', label: 'Windows' },
                    ]}
                  />
                </SettingRow>
                <SettingRow icon={Laptop} label="Translucent materials" hint="Acrylic panels, glass menus and blurred windows">
                  <Toggle checked={themeState.transparency} onChange={(transparency) => theme.set({ transparency })} label="Translucency" />
                </SettingRow>
                <SettingRow icon={RotateCcw} label="Reduce motion" hint="Minimise window and overlay animations">
                  <Toggle checked={themeState.reduceMotion} onChange={(reduceMotion) => theme.set({ reduceMotion })} label="Reduce motion" />
                </SettingRow>
              </Card>

              <Card title="Accent colour" subtitle="Used for highlights, focus rings, sliders and the taskbar underline.">
                <div className="flex flex-wrap gap-2.5">
                  {ACCENTS.map((accent) => (
                    <button
                      key={accent.id}
                      type="button"
                      title={accent.name}
                      aria-label={`Accent ${accent.name}`}
                      className="relative h-[30px] w-[30px] rounded-full transition-transform hover:scale-105"
                      style={{
                        background: accent.hex,
                        boxShadow: themeState.accent === accent.id ? '0 0 0 2.5px var(--panel), 0 0 0 4px var(--text-muted)' : 'inset 0 1px 0 rgba(255,255,255,.45)',
                      }}
                      onClick={() => theme.set({ accent: accent.id })}
                    >
                      {themeState.accent === accent.id ? <Check size={14} className="absolute inset-0 m-auto text-white" /> : null}
                    </button>
                  ))}
                </div>
              </Card>
            </>
          ) : null}

          {section === 'personalization' ? (
            <>
              <Card title="Shell" subtitle="Switch between a macOS style Dock and a Windows 11 style Taskbar.">
                <SettingRow icon={Laptop} label="Shell mode" hint="Dock (bottom, floating) or Taskbar (centred, full width)">
                  <Segmented<ShellMode>
                    value={themeState.shellMode}
                    onChange={(shellMode) => theme.set({ shellMode })}
                    options={[
                      { value: 'dock', label: 'Dock' },
                      { value: 'taskbar', label: 'Taskbar' },
                    ]}
                  />
                </SettingRow>
                <SettingRow icon={ImageIcon} label="Dock magnification" hint="Icons grow as the pointer approaches">
                  <Toggle checked={themeState.dockMagnify} onChange={(dockMagnify) => theme.set({ dockMagnify })} label="Dock magnification" />
                </SettingRow>
              </Card>

              <Card title="Wallpaper" subtitle="CSS rendered presets (optionally animated) or your own image.">
                <div className="mb-3 grid grid-cols-3 gap-2.5">
                  {WALLPAPERS.map((wp) => {
                    const active = !themeState.customWallpaper && themeState.wallpaper === wp.id
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        className="group relative h-[74px] overflow-hidden rounded-[10px] border transition-transform hover:scale-[1.02]"
                        style={{ background: wp.swatch, borderColor: active ? 'var(--accent)' : 'var(--line)', boxShadow: active ? '0 0 0 2px rgb(var(--accent-rgb) / .35)' : 'none' }}
                        onClick={() => theme.set({ wallpaper: wp.id, customWallpaper: null, customWallpaperData: null })}
                      >
                        <span className="absolute inset-x-0 bottom-0 bg-black/45 px-2 py-1 text-left text-[10.5px] text-white backdrop-blur-sm">
                          {wp.name}
                          {wp.live ? ' · live' : ''}
                        </span>
                        {active ? (
                          <span className="absolute right-1.5 top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full" style={{ background: 'var(--accent)' }}>
                            <Check size={11} className="text-white" />
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
                <SettingRow icon={Sun} label="Live wallpaper" hint="Subtle drifting light across the background">
                  <Toggle checked={themeState.liveWallpaper} onChange={(liveWallpaper) => theme.set({ liveWallpaper })} label="Live wallpaper" />
                </SettingRow>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      const path = await bridge.fs.pickImage()
                      if (!path) {
                        bus.emit(EVT.TOAST, { text: bridge.mode === 'native' ? 'No image selected' : 'Image picking needs the native host', kind: 'warn' })
                        return
                      }
                      await theme.setCustomWallpaper(path)
                      bus.emit(EVT.TOAST, { text: 'Wallpaper updated', kind: 'success' })
                    }}
                  >
                    <ImageIcon size={14} /> Choose image…
                  </button>
                  {themeState.customWallpaper ? (
                    <button type="button" className="btn" onClick={() => void theme.setCustomWallpaper(null)}>
                      <Trash2 size={14} /> Use a preset instead
                    </button>
                  ) : null}
                  {themeState.customWallpaper ? (
                    <span className="text-[11px] text-faint">Custom: {themeState.customWallpaper.split('/').pop()}</span>
                  ) : null}
                </div>
              </Card>
            </>
          ) : null}

          {section === 'display' ? (
            <>
              <Card title="Brightness & colour">
                <SettingRow icon={Sun} label="Brightness" hint="Dims the whole desktop">
                  <div className="w-[180px]">
                    <Slider value={systemState.brightness} min={0.25} max={1} onChange={(v) => system.set('brightness', Math.round(v * 100) / 100)} ariaLabel="Brightness" />
                  </div>
                </SettingRow>
                <SettingRow icon={Moon} label="Night Light" hint="Warmer colours after sunset">
                  <Toggle checked={systemState.nightLight} onChange={(v) => system.set('nightLight', v)} label="Night light" />
                </SettingRow>
              </Card>
              <Card title="Display" subtitle="Detected from the host window.">
                <SettingRow icon={Monitor} label="Resolution" hint={`${window.innerWidth} × ${window.innerHeight} CSS pixels`}>
                  <span className="text-[12px] text-muted">{window.innerWidth} × {window.innerHeight}</span>
                </SettingRow>
                <SettingRow icon={Monitor} label="Pixel density" hint="devicePixelRatio reported by Chromium">
                  <span className="text-[12px] text-muted">{window.devicePixelRatio.toFixed(2)}×</span>
                </SettingRow>
                <SettingRow icon={RotateCcw} label="Refresh rate" hint="Inherited from the host monitor">
                  <span className="text-[12px] text-muted">60 Hz</span>
                </SettingRow>
              </Card>
            </>
          ) : null}

          {section === 'sound' ? (
            <>
              <Card title="Output">
                <SettingRow icon={Volume2} label="Master volume" hint={systemState.muted ? 'Muted' : `${Math.round(systemState.volume * 100)}%`}>
                  <div className="w-[180px]">
                    <Slider
                      value={systemState.muted ? 0 : systemState.volume}
                      onChange={(v) => {
                        system.set('volume', Math.round(v * 100) / 100)
                        if (systemState.muted && v > 0) system.set('muted', false)
                      }}
                      ariaLabel="Volume"
                    />
                  </div>
                </SettingRow>
                <SettingRow icon={Volume2} label="Mute" hint="Silence all output">
                  <Toggle checked={systemState.muted} onChange={(v) => system.set('muted', v)} label="Mute" />
                </SettingRow>
              </Card>
              <Card title="Output device">
                {AUDIO_OUTPUTS.map((device) => (
                  <button
                    key={device}
                    type="button"
                    className="list-row w-full"
                    data-selected={audioOut === device ? 'true' : 'false'}
                    onClick={() => setAudioOut(device)}
                  >
                    <Volume2 size={15} className="text-muted" />
                    <span className="flex-1 truncate text-[12.5px]">{device}</span>
                    {audioOut === device ? <Check size={14} style={{ color: 'var(--accent)' }} /> : null}
                  </button>
                ))}
              </Card>
            </>
          ) : null}

          {section === 'network' ? (
            <>
              <Card title="Wi-Fi">
                <SettingRow icon={Wifi} label="Wi-Fi" hint={systemState.wifi ? `Connected to ${systemState.activeNetwork ?? 'a network'}` : 'Off'}>
                  <Toggle checked={systemState.wifi} onChange={(v) => system.set('wifi', v)} label="Wi-Fi" />
                </SettingRow>
                <div className="mt-2">
                  {NETWORKS.map((net) => {
                    const connected = systemState.wifi && systemState.activeNetwork === net.ssid
                    return (
                      <button
                        key={net.ssid}
                        type="button"
                        className="list-row w-full"
                        data-selected={connected ? 'true' : 'false'}
                        onClick={() => {
                          if (!systemState.wifi) system.set('wifi', true)
                          system.set('activeNetwork', net.ssid)
                          bus.emit(EVT.TOAST, { text: `Connected to ${net.ssid}`, kind: 'success' })
                        }}
                      >
                        <Signal size={15} style={{ opacity: 0.4 + net.signal * 0.15, color: connected ? 'var(--accent)' : 'var(--text-muted)' }} />
                        <span className="flex-1 truncate text-[12.5px]">{net.ssid}</span>
                        {net.secure ? <Lock size={12} className="text-faint" /> : null}
                        <span className="flex items-end gap-[2px]">
                          {[1, 2, 3, 4].map((bar) => (
                            <span
                              key={bar}
                              className="w-[3px] rounded-sm"
                              style={{
                                height: 3 + bar * 3,
                                background: bar <= net.signal ? (connected ? 'var(--accent)' : 'var(--text-muted)') : 'var(--line-strong)',
                              }}
                            />
                          ))}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Card>
              <Card title="Bluetooth">
                <SettingRow icon={Bluetooth} label="Bluetooth" hint={systemState.bluetooth ? 'Discoverable' : 'Off'}>
                  <Toggle checked={systemState.bluetooth} onChange={(v) => system.set('bluetooth', v)} label="Bluetooth" />
                </SettingRow>
                <div className="mt-2">
                  {BLUETOOTH_DEVICES.map((device) => (
                    <div key={device.name} className="list-row">
                      <Bluetooth size={15} className="text-muted" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[12.5px]">{device.name}</span>
                        <span className="text-[11px] text-faint">{device.kind}</span>
                      </span>
                      <span className="text-[11px]" style={{ color: device.connected && systemState.bluetooth ? 'var(--accent)' : 'var(--text-faint)' }}>
                        {device.connected && systemState.bluetooth ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : null}

          {section === 'shortcuts' ? (
            <>
              <Card
                title="Keyboard shortcuts"
                subtitle="Global shortcuts work no matter which window has focus. Click a shortcut to rebind it; press Escape to restore the default."
              >
                {(() => {
                  const list = shortcuts.list()
                  const categories = Array.from(new Set(list.map((s) => s.category)))
                  return categories.map((category) => (
                    <div key={category} className="mb-4 last:mb-0">
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">{category}</div>
                      {list
                        .filter((s) => s.category === category)
                        .map((s) => (
                          <div
                            key={s.actionId}
                            className="flex items-center justify-between border-b py-2 last:border-b-0"
                            style={{ borderColor: 'var(--line)' }}
                          >
                            <span className="min-w-0 truncate pr-3 text-[12.5px] text-muted">{s.title}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {s.custom ? (
                                <button
                                  type="button"
                                  className="menu-item w-auto p-1 text-[11px]"
                                  title="Restore default"
                                  onClick={() => shortcuts.resetBinding(s.actionId)}
                                >
                                  <RotateCcw size={12} />
                                </button>
                              ) : null}
                              {recording === s.actionId ? (
                                <ShortcutRecorder actionId={s.actionId} onDone={() => setRecording(null)} />
                              ) : (
                                <button
                                  type="button"
                                  className="mono rounded-md border px-2 py-0.5 text-[11px] transition-colors"
                                  style={{ borderColor: 'var(--line)', background: 'var(--hover)' }}
                                  onClick={() => setRecording(s.actionId)}
                                  title="Click to rebind"
                                >
                                  {prettyCombo(bindings[s.actionId] ?? s.combo)}
                                </button>
                              )}
                            </span>
                          </div>
                        ))}
                    </div>
                  ))
                })()}
                <div className="mt-2 flex justify-end">
                  <button type="button" className="btn" onClick={() => shortcuts.resetAll()}>
                    <RotateCcw size={13} /> Restore all defaults
                  </button>
                </div>
              </Card>

              <Card title="System" subtitle="Always-available bindings handled by the shell.">
                {[
                  ['Escape', 'Dismiss the top overlay (Spotlight, Mission Control…)'],
                  ['Ctrl+Tab', 'Hold to cycle windows, release to focus'],
                  ['F11', 'Toggle host full screen'],
                  ['F12', 'Toggle developer tools'],
                ].map(([keys, description]) => (
                  <div key={keys} className="flex items-center justify-between border-b py-2 last:border-b-0" style={{ borderColor: 'var(--line)' }}>
                    <span className="text-[12.5px] text-muted">{description}</span>
                    <span className="mono rounded-md border px-2 py-0.5 text-[11px]" style={{ borderColor: 'var(--line)', background: 'var(--hover)' }}>
                      {keys}
                    </span>
                  </div>
                ))}
              </Card>
            </>
          ) : null}

          {section === 'desktop' ? (
            <>
              <Card title="Desktops" subtitle="Virtual desktops (Spaces) let you group windows onto separate screens.">
                <SettingRow icon={LayoutGrid} label="Desktops open" hint="Add, rename and switch from the pager above the Dock or Mission Control">
                  <span className="text-[12px] text-muted">{wmState.desktops.length}</span>
                </SettingRow>
                <div className="mt-2 flex flex-wrap gap-2">
                  {wmState.desktops.map((d) => {
                    const count = wmState.windows.filter((w) => w.desktop === d.id).length
                    const active = d.id === wmState.activeDesktop
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className="list-row !w-auto gap-2 px-3"
                        data-selected={active ? 'true' : 'false'}
                        onClick={() => wm.switchDesktop(d.id)}
                      >
                        <span className="text-[12px]">{d.name}</span>
                        <span className="text-[10.5px] text-faint">{count}</span>
                        {wmState.desktops.length > 1 ? (
                          <span
                            role="button"
                            aria-label={`Close ${d.name}`}
                            className="text-faint hover:text-ink"
                            onClick={(e) => {
                              e.stopPropagation()
                              wm.removeDesktop(d.id)
                            }}
                          >
                            <X size={12} />
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                  <button type="button" className="list-row !w-auto gap-2 px-3" onClick={() => wm.addDesktop()}>
                    + New desktop
                  </button>
                </div>
              </Card>

              <Card title="Hot corners" subtitle="Hover a screen corner to run an action.">
                <SettingRow icon={PanelTop} label="Enable hot corners" hint="Also configurable by right-clicking any corner">
                  <Toggle
                    checked={hotCornerState.enabled}
                    onChange={(enabled) => hotCorners.update({ enabled })}
                    label="Hot corners"
                  />
                </SettingRow>
                {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
                  const labels: Record<string, string> = {
                    tl: 'Top left',
                    tr: 'Top right',
                    bl: 'Bottom left',
                    br: 'Bottom right',
                  }
                  const options: Array<[string, string]> = [
                    ['missionControl.toggle', 'Mission Control'],
                    ['notificationCenter.toggle', 'Notifications'],
                    ['desktop.showDesktop', 'Show Desktop'],
                    ['widgets.open', 'Widgets'],
                    ['clipboardHistory.toggle', 'Clipboard'],
                    ['none', 'Do nothing'],
                  ]
                  return (
                    <SettingRow key={corner} icon={Pin} label={labels[corner]}>
                      <select
                        className="field !w-[170px]"
                        value={hotCornerState[corner]}
                        disabled={!hotCornerState.enabled}
                        onChange={(e) => {
                          const patch: Partial<HotCornerConfig> = {}
                          ;(patch as Record<string, string>)[corner] = e.target.value
                          hotCorners.update(patch)
                        }}
                      >
                        {options.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </SettingRow>
                  )
                })}
              </Card>

              <Card title="Session" subtitle="JohnLC AuraOS can bring your windows back the next time you launch it.">
                <SettingRow icon={RotateCcw} label="Restore windows on launch" hint="Remembers open windows, their positions and desktops">
                  <Toggle
                    checked={session.isEnabled}
                    onChange={(v) => void session.setEnabled(v)}
                    label="Restore session"
                  />
                </SettingRow>
                <SettingRow icon={Trash2} label="Forget saved session" hint="Start with a clean desktop next launch">
                  <button type="button" className="btn" onClick={() => void session.clear()} disabled={!session.isEnabled}>
                    Clear
                  </button>
                </SettingRow>
              </Card>

              <Card title="Notifications" subtitle="History of alerts raised by apps and the system.">
                <SettingRow icon={PanelTop} label="Saved notifications" hint="Stored in memory for this session">
                  <span className="text-[12px] text-muted">{notifItems.length}</span>
                </SettingRow>
                <SettingRow icon={Trash2} label="Clear all notifications">
                  <button type="button" className="btn" onClick={() => notifications.clear()} disabled={notifItems.length === 0}>
                    Clear
                  </button>
                </SettingRow>
              </Card>
            </>
          ) : null}

          {section === 'system' ? (
            <>
              <Card title={info?.os ?? 'JohnLC AuraOS'} subtitle={`Hostname ${info?.hostname ?? '—'} · uptime ${info ? uptime(info.uptime) : '—'}`}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[12px] p-3" style={{ background: 'var(--hover)' }}>
                    <div className="flex items-center gap-2 text-[11.5px] text-muted"><Cpu size={13} /> Processor</div>
                    <div className="mt-1 text-[12.5px]">{info?.cpuModel ?? '—'}</div>
                    <div className="text-[11px] text-faint">{info?.cpuCores ?? 0} logical cores</div>
                  </div>
                  <div className="rounded-[12px] p-3" style={{ background: 'var(--hover)' }}>
                    <div className="flex items-center gap-2 text-[11.5px] text-muted"><MemoryStick size={13} /> Memory</div>
                    <div className="mt-1 text-[12.5px]">
                      {info ? `${bytes(info.totalMem - info.freeMem)} of ${bytes(info.totalMem)}` : '—'}
                    </div>
                    <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full" style={{ background: 'var(--line-strong)' }}>
                      <div className="h-full rounded-full" style={{ width: `${memoryPct}%`, background: 'var(--accent)' }} />
                    </div>
                  </div>
                  <div className="rounded-[12px] p-3" style={{ background: 'var(--hover)' }}>
                    <div className="flex items-center gap-2 text-[11.5px] text-muted"><HardDrive size={13} /> Storage</div>
                    <div className="mt-1 text-[12.5px]">512 GB SSD</div>
                    <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full" style={{ background: 'var(--line-strong)' }}>
                      <div className="h-full rounded-full" style={{ width: '43%', background: 'var(--accent)' }} />
                    </div>
                    <div className="mt-1 text-[11px] text-faint">218 GB used · 294 GB free</div>
                  </div>
                  <div className="rounded-[12px] p-3" style={{ background: 'var(--hover)' }}>
                    <div className="flex items-center gap-2 text-[11.5px] text-muted"><BatteryCharging size={13} /> Battery</div>
                    <div className="mt-1 text-[12.5px]">{Math.round(systemState.battery)}%</div>
                    <div className="text-[11px] text-faint">{systemState.charging ? 'Charging' : 'On battery power'}</div>
                  </div>
                </div>
              </Card>

              <Card title="Software">
                {[
                  ['JohnLC AuraOS', info?.versions.auraos ?? info?.appVersion ?? '0.1.0'],
                  ['Bridge', bridge.mode],
                  ['Platform', `${info?.platform ?? '—'} (${info?.arch ?? '—'})`],
                  ['Kernel', info?.kernel ?? '—'],
                  ['Electron', info?.versions.electron ?? '—'],
                  ['Chromium', info?.versions.chrome ?? '—'],
                  ['Node', info?.versions.node ?? '—'],
                  ['V8', info?.versions.v8 ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between border-b py-2 last:border-b-0" style={{ borderColor: 'var(--line)' }}>
                    <span className="text-[12.5px] text-muted">{label}</span>
                    <span className="mono text-[11.5px]">{value}</span>
                  </div>
                ))}
              </Card>

              <Card title="Startup" subtitle="Launch JohnLC AuraOS automatically when you sign in to this PC.">
                <div data-auto-launch={!autoLaunch ? 'loading' : autoLaunch.supported ? (autoLaunch.enabled ? 'on' : 'off') : 'unavailable'}>
                  <SettingRow
                    icon={Rocket}
                    label="Open at login"
                    hint={autoLaunch?.detail ?? 'Checking startup status…'}
                  >
                    <Toggle
                      checked={autoLaunch?.enabled ?? false}
                      disabled={!autoLaunch?.supported || autoLaunchBusy}
                      onChange={(next) => void updateAutoLaunch(next)}
                      label="Open JohnLC AuraOS at login"
                    />
                  </SettingRow>
                </div>
              </Card>

              <Card title="Power & maintenance">
                <SettingRow icon={RotateCcw} label="Reload the shell" hint="Restart the renderer without quitting the host">
                  <button type="button" className="btn" onClick={() => window.location.reload()}>
                    Reload
                  </button>
                </SettingRow>
                <SettingRow icon={Keyboard} label="Reset appearance" hint="Back to the default theme, accent and wallpaper">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      theme.set({ mode: 'dark', accent: 'blue', wallpaper: 'aurora', customWallpaper: null, customWallpaperData: null, liveWallpaper: true })
                      bus.emit(EVT.TOAST, { text: 'Appearance reset', kind: 'success' })
                    }}
                  >
                    Reset
                  </button>
                </SettingRow>
                <SettingRow icon={Power} label="Quit JohnLC AuraOS" hint="Shut down the desktop environment">
                  <button type="button" className="btn" data-variant="accent" onClick={() => void bridge.app.quit()}>
                    Quit
                  </button>
                </SettingRow>
              </Card>
            </>
          ) : null}
        </motion.div>
      </div>
    </div>
  )
}

export default SettingsApp
