import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, ExternalLink, Heart, RefreshCw, ShieldCheck } from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import type { SysInfo } from '../../../shared/bridge'
import { bridge } from '../../core/ipc/bridge'
import { bus, EVT } from '../../core/bus'
import { useTheme } from '../../core/hooks'
import { Spinner } from '../../ui/controls'

const REPO_URL = 'https://github.com/johnlcstudios-alt/JohnLC-AuraOS'

function bytes(n: number): string {
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d > 0 ? `${d} d ${h} h ${m} min` : h > 0 ? `${h} h ${m} min` : `${m} min`
}

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[5px]">
      <span className="text-[11.5px] text-faint">{label}</span>
      <span className={`min-w-0 truncate text-right text-[12px] ${mono ? 'mono' : ''}`} title={value}>
        {value}
      </span>
    </div>
  )
}

/** About JohnLC AuraOS — version, host details and credits. */
export function AboutApp(_props: AppProps) {
  const themeState = useTheme()
  const [info, setInfo] = useState<SysInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void bridge.system
      .info()
      .then(setInfo)
      .catch(() => undefined)
  }, [])

  const checkForUpdates = async () => {
    setChecking(true)
    await new Promise((r) => window.setTimeout(r, 900))
    setChecking(false)
    bus.emit(EVT.TOAST, { text: 'JohnLC AuraOS is up to date (0.1.0)', kind: 'success' })
  }

  const copyDiagnostics = async () => {
    const text = info
      ? [
          `JohnLC AuraOS ${info.appVersion}`,
          `Bridge: ${bridge.mode}`,
          `OS: ${info.os}`,
          `Kernel: ${info.kernel}`,
          `Platform: ${info.platform} (${info.arch})`,
          `CPU: ${info.cpuModel} (${info.cpuCores} cores)`,
          `Memory: ${bytes(info.totalMem)}`,
          `Theme: ${themeState.mode} / ${themeState.accent}`,
        ].join('\n')
      : 'JohnLC AuraOS diagnostics unavailable'
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
      bus.emit(EVT.TOAST, { text: 'Diagnostics copied to clipboard', kind: 'success' })
    } catch {
      bus.emit(EVT.TOAST, { text: 'Clipboard unavailable', kind: 'warn' })
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center overflow-y-auto px-6 py-7 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative grid h-[86px] w-[86px] place-items-center rounded-[22px] text-white"
        style={{
          backgroundImage: 'linear-gradient(150deg, var(--accent), #a06bff)',
          boxShadow: '0 16px 40px rgb(var(--accent-rgb) / 0.35), inset 0 1px 0 rgba(255,255,255,.4)',
        }}
      >
        <svg width="44" height="44" viewBox="0 0 32 32" aria-hidden>
          <circle cx="16" cy="16" r="9" fill="none" stroke="#fff" strokeWidth="3" />
          <circle cx="16" cy="16" r="3" fill="#fff" />
        </svg>
      </motion.div>

      <h1 className="mt-4 text-[21px] font-semibold">JohnLC AuraOS</h1>
      <p className="text-[12.5px] text-muted">Version {info?.appVersion ?? '0.1.0'}</p>
      <p className="mt-1 max-w-[360px] text-[11.5px] text-faint">
        An open-source hybrid desktop environment that blends the macOS Dock with the Windows 11 Snap experience.
      </p>

      <div className="mt-5 w-full max-w-[380px] rounded-[14px] p-4 text-left" style={{ background: 'var(--hover)' }}>
        {info ? (
          <>
            <Row label="Operating system" value={info.os} mono={false} />
            <Row label="Kernel" value={info.kernel} />
            <Row label="Platform" value={`${info.platform} · ${info.arch}`} />
            <Row label="Host" value={info.hostname} />
            <Row label="User" value={info.user} />
            <Row label="Processor" value={`${info.cpuModel} (${info.cpuCores} cores)`} mono={false} />
            <Row label="Memory" value={bytes(info.totalMem)} />
            <Row label="Uptime" value={uptime(info.uptime)} mono={false} />
            <Row label="Bridge" value={bridge.mode} />
            {info.versions.electron ? <Row label="Electron" value={info.versions.electron} /> : null}
            {info.versions.chrome ? <Row label="Chromium" value={info.versions.chrome} /> : null}
            {info.versions.node ? <Row label="Node" value={info.versions.node} /> : null}
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-muted">
            <Spinner size={14} /> Gathering system details…
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="btn" onClick={() => void checkForUpdates()} disabled={checking}>
          {checking ? <Spinner size={13} /> : <RefreshCw size={13} />} Check for updates
        </button>
        <button type="button" className="btn" onClick={() => void copyDiagnostics()}>
          {copied ? <Check size={13} /> : <Copy size={13} />} Copy diagnostics
        </button>
        <button type="button" className="btn" onClick={() => void bridge.app.openExternal(REPO_URL)}>
          <ExternalLink size={13} /> Project page
        </button>
      </div>

      <div className="mt-6 flex flex-col items-center gap-1.5 text-[10.5px] text-faint">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={12} /> MIT licensed · sandboxed renderer · context isolation on
        </div>
        <div className="flex items-center gap-1.5">
          Built with <Heart size={11} style={{ color: 'var(--accent)' }} /> using Electron, React and TypeScript
        </div>
        <div>© {new Date().getFullYear()} The JohnLC AuraOS contributors</div>
      </div>
    </div>
  )
}

export default AboutApp
