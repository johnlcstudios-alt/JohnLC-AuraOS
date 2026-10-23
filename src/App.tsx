import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Shell } from './shell/Shell'
import { theme } from './core/theme/ThemeEngine'
import { system } from './core/system/systemStore'
import { launchApp } from './core/apps/registry'
import { hotCorners } from './core/hotCorners'
import { session } from './core/session'
import { appPins } from './core/apps/pins'
import { bridge } from './core/ipc/bridge'
import { wm } from './core/wm/WindowManager'

let desktopSeeded = false

function BootSplash() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5" style={{ background: 'var(--surface)' }}>
      <motion.svg
        width="76"
        height="76"
        viewBox="0 0 32 32"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <defs>
          <linearGradient id="boot-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="#a06bff" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#boot-logo)" />
        <circle cx="16" cy="16" r="7" fill="none" stroke="#fff" strokeWidth="3" />
      </motion.svg>
      <div className="text-[13px] text-muted">Starting JohnLC AuraOS…</div>
      <div className="h-[3px] w-[180px] overflow-hidden rounded-full" style={{ background: 'var(--line-strong)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--accent)' }}
          initial={{ width: '8%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
        />
      </div>
    </div>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      await Promise.allSettled([theme.init(), system.init()])
      // Dock/Taskbar pin overrides are needed before the first paint
      await appPins.init().catch(() => undefined)
      // hot corners persist through the same config store
      await hotCorners.init(
        (key, fallback) => bridge.config.get(key, fallback),
        (key, value) => bridge.config.set(key, value),
      )
      // restore the previous desktop layout before anything else
      await session.start().catch(() => undefined)
      if (cancelled) return
      setReady(true)
      // seed a window so the first run feels like a real desktop
      // (guarded: React StrictMode mounts effects twice in dev)
      if (!desktopSeeded) {
        desktopSeeded = true
        if (wm.windows.length === 0) window.setTimeout(() => launchApp('files'), 500)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) return <BootSplash />
  return <Shell />
}
