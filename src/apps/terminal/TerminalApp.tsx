import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import { Copy, Plus, TerminalSquare, X } from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import type { SysInfo } from '../../../shared/bridge'
import { bridge } from '../../core/ipc/bridge'
import { appList, launchApp } from '../../core/apps/registry'
import { theme } from '../../core/theme/ThemeEngine'
import { ACCENTS } from '../../core/theme/accents'
import { useTheme } from '../../core/hooks'
import { bus, EVT } from '../../core/bus'

type LineKind = 'input' | 'out' | 'err' | 'sys'

interface Line {
  kind: LineKind
  text: string
}

interface Tab {
  id: number
  title: string
  cwd: string
  lines: Line[]
  history: string[]
  historyIndex: number
  busy: boolean
}

const BANNER = `  JohnLC AuraOS · Shell 0.1.0
  type "help" for built-ins`

const LOCAL_COMMANDS = [
  'help',
  'clear',
  'sysinfo',
  'neofetch',
  'theme',
  'accent',
  'open',
  'apps',
  'cd',
  'pwd',
  'echo',
  'date',
  'whoami',
  'history',
  'version',
]

function normalizePath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '') {
      if (out.length === 0) out.push('')
      continue
    }
    if (part === '.') continue
    if (part === '..') {
      if (out.length > 1) out.pop()
      continue
    }
    out.push(part)
  }
  const joined = out.join('/')
  return joined === '' ? '/' : joined
}

function resolvePath(cwd: string, arg: string, home: string): string {
  const p = arg.trim()
  if (!p || p === '~') return home
  if (p.startsWith('~/')) return normalizePath(`${home}${p.slice(1)}`)
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return normalizePath(p)
  return normalizePath(`${cwd}/${p}`)
}

function prettyPath(path: string, home: string): string {
  if (path === home) return '~'
  if (home && path.startsWith(home + '/')) return `~${path.slice(home.length)}`
  return path
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function bytes(n: number): string {
  const gb = n / 1024 / 1024 / 1024
  return `${gb.toFixed(1)} GB`
}

/**
 * Terminal / Console.
 * Tabbed, acrylic, and wired to the real OS shell through the bridge.
 * Interactive TUIs are intentionally out of scope (line-based execution only),
 * but every ordinary command works plus a set of AuraOS built-ins.
 */
export function TerminalApp({ windowId }: AppProps) {
  const themeState = useTheme()
  const [home, setHome] = useState('~')
  const [info, setInfo] = useState<SysInfo | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 1, title: 'shell', cwd: '~', lines: [{ kind: 'sys', text: BANNER }], history: [], historyIndex: -1, busy: false },
  ])
  const [activeId, setActiveId] = useState(1)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tabSeq = useRef(1)

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  useEffect(() => {
    void bridge.fs
      .home()
      .then((h) => {
        setHome(h)
        setTabs((prev) => prev.map((t) => (t.cwd === '~' ? { ...t, cwd: h } : t)))
      })
      .catch(() => undefined)
    void bridge.system
      .info()
      .then(setInfo)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [active.lines.length, activeId])

  const push = useCallback((tabId: number, line: Line) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, lines: [...t.lines, line] } : t)))
  }, [])

  const patchTab = useCallback((tabId: number, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)))
  }, [])

  const prompt = useMemo(() => {
    const user = info?.user ?? 'user'
    const host = info?.hostname?.split('.')[0] ?? 'auraos'
    return `${user}@${host}`
  }, [info])

  const runLocal = useCallback(
    async (tabId: number, raw: string): Promise<boolean> => {
      const [cmd, ...rest] = raw.trim().split(/\s+/)
      const arg = rest.join(' ')
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab) return true

      switch (cmd) {
        case 'help':
          push(tabId, {
            kind: 'out',
            text: `AuraOS built-ins:\n  help                 show this help\n  clear                clear the screen\n  sysinfo | neofetch   system summary\n  theme [light|dark|auto]   change appearance\n  accent [id]          set accent colour\n  open <app>           launch an app\n  apps                 list installed apps\n  cd <path>            change directory (built-in)\n  pwd                  print working directory\n  echo <text>          print text\n  date                 current date and time\n  whoami               current user\n  history              command history\n  version              AuraOS version\n\nAny other command is executed by the host shell (${bridge.mode === 'native' ? 'PowerShell / cmd / bash' : 'unavailable in web preview'}).`,
          })
          return true

        case 'clear':
          patchTab(tabId, { lines: [] })
          return true

        case 'pwd':
          push(tabId, { kind: 'out', text: prettyPath(tab.cwd, home) })
          return true

        case 'echo':
          push(tabId, { kind: 'out', text: arg.replace(/^["']|["']$/g, '') })
          return true

        case 'date':
          push(tabId, { kind: 'out', text: new Date().toString() })
          return true

        case 'whoami':
          push(tabId, { kind: 'out', text: info?.user ?? 'user' })
          return true

        case 'version':
          push(tabId, { kind: 'out', text: `JohnLC AuraOS 0.1.0 · bridge=${bridge.mode} · electron=${info?.versions.electron ?? 'n/a'} · node=${info?.versions.node ?? 'n/a'}` })
          return true

        case 'history':
          push(tabId, { kind: 'out', text: tab.history.length ? tab.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join('\n') : '(no history yet)' })
          return true

        case 'apps':
          push(tabId, {
            kind: 'out',
            text: appList()
              .map((a) => `  ${a.id.padEnd(14)} ${a.name}`)
              .join('\n'),
          })
          return true

        case 'sysinfo':
        case 'neofetch': {
          if (!info) {
            push(tabId, { kind: 'out', text: 'Collecting system information…' })
            try {
              const fresh = await bridge.system.info()
              setInfo(fresh)
              push(tabId, { kind: 'out', text: renderSysInfo(fresh) })
            } catch (e) {
              push(tabId, { kind: 'err', text: e instanceof Error ? e.message : 'unavailable' })
            }
            return true
          }
          push(tabId, { kind: 'out', text: renderSysInfo(info) })
          return true
        }

        case 'theme': {
          const mode = arg.trim().toLowerCase()
          if (mode === 'light' || mode === 'dark' || mode === 'auto') {
            theme.set({ mode })
            push(tabId, { kind: 'out', text: `Appearance set to ${mode}.` })
          } else {
            theme.cycleMode()
            push(tabId, { kind: 'out', text: `Appearance cycled to ${theme.get('mode')}. Usage: theme [light|dark|auto]` })
          }
          return true
        }

        case 'accent': {
          const id = arg.trim().toLowerCase()
          if (!id) {
            push(tabId, {
              kind: 'out',
              text: `Current accent: ${theme.get('accent')}\nAvailable: ${ACCENTS.map((a) => a.id).join(', ')}`,
            })
            return true
          }
          const found = ACCENTS.find((a) => a.id === id || a.name.toLowerCase() === id)
          if (!found) {
            push(tabId, { kind: 'err', text: `accent: unknown accent "${id}". Try: ${ACCENTS.map((a) => a.id).join(', ')}` })
            return true
          }
          theme.set({ accent: found.id })
          push(tabId, { kind: 'out', text: `Accent set to ${found.name}.` })
          return true
        }

        case 'open': {
          const id = arg.trim().toLowerCase()
          const app = appList().find((a) => a.id === id || a.name.toLowerCase() === id)
          if (!app) {
            push(tabId, { kind: 'err', text: `open: unknown app "${id}". Try: ${appList().map((a) => a.id).join(', ')}` })
            return true
          }
          launchApp(app.id)
          push(tabId, { kind: 'out', text: `Launching ${app.name}…` })
          return true
        }

        case 'cd': {
          const target = resolvePath(tab.cwd, arg || '~', home)
          try {
            await bridge.fs.list(target)
            patchTab(tabId, { cwd: target })
            push(tabId, { kind: 'out', text: prettyPath(target, home) })
          } catch {
            push(tabId, { kind: 'err', text: `cd: no such directory: ${arg}` })
          }
          return true
        }

        default:
          return false
      }
    },
    [home, info, patchTab, push, tabs],
  )

  const submit = useCallback(async () => {
    const raw = draft
    setDraft('')
    const tabId = active.id
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return

    if (!raw.trim()) {
      push(tabId, { kind: 'input', text: '' })
      return
    }

    push(tabId, { kind: 'input', text: raw })
    patchTab(tabId, { history: [...tab.history, raw], historyIndex: -1 })

    const handled = await runLocal(tabId, raw)
    if (handled) return

    patchTab(tabId, { busy: true })
    try {
      const result = await bridge.shell.exec(raw, { cwd: tab.cwd, timeoutMs: 30_000 })
      if (result.stdout) push(tabId, { kind: 'out', text: result.stdout.replace(/\s+$/, '') })
      if (result.stderr) push(tabId, { kind: 'err', text: result.stderr.replace(/\s+$/, '') })
      if (result.timedOut) push(tabId, { kind: 'err', text: `Command timed out after 30s.` })
      if (!result.stdout && !result.stderr) {
        push(tabId, {
          kind: 'out',
          text: `(exit ${result.code ?? '?'} · ${result.durationMs} ms · no output)`,
        })
      }
    } catch (e) {
      push(tabId, { kind: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      patchTab(tabId, { busy: false })
    }
  }, [active.id, draft, patchTab, push, runLocal, tabs])

  const onKeyDown = (e: RKeyboardEvent<HTMLInputElement>) => {
    const tab = active
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!tab.history.length) return
      const nextIndex = tab.historyIndex < 0 ? tab.history.length - 1 : Math.max(0, tab.historyIndex - 1)
      patchTab(tab.id, { historyIndex: nextIndex })
      setDraft(tab.history[nextIndex])
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (tab.historyIndex < 0) return
      const nextIndex = tab.historyIndex + 1
      if (nextIndex >= tab.history.length) {
        patchTab(tab.id, { historyIndex: -1 })
        setDraft('')
      } else {
        patchTab(tab.id, { historyIndex: nextIndex })
        setDraft(tab.history[nextIndex])
      }
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const trimmed = draft.trim()
      if (!trimmed || trimmed.includes(' ')) return
      const matches = LOCAL_COMMANDS.filter((c) => c.startsWith(trimmed))
      if (matches.length === 1) setDraft(`${matches[0]} `)
      else if (matches.length > 1) push(tab.id, { kind: 'out', text: matches.join('   ') })
      return
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      patchTab(tab.id, { lines: [] })
      return
    }
    if (e.key === 'c' && e.ctrlKey && draft) {
      e.preventDefault()
      push(tab.id, { kind: 'input', text: `${draft}^C` })
      setDraft('')
    }
  }

  const newTab = () => {
    tabSeq.current += 1
    const id = tabSeq.current
    setTabs((prev) => [
      ...prev,
      { id, title: `shell ${id}`, cwd: home, lines: [], history: [], historyIndex: -1, busy: false },
    ])
    setActiveId(id)
    window.setTimeout(() => inputRef.current?.focus(), 30)
  }

  const closeTab = (id: number) => {
    setTabs((prev) => {
      if (prev.length === 1) return prev
      const next = prev.filter((t) => t.id !== id)
      if (activeId === id) setActiveId(next[next.length - 1].id)
      return next
    })
  }

  return (
    <div
      className="flex h-full w-full min-h-0 flex-col"
      style={{ background: 'rgb(8 10 14 / 0.72)', backdropFilter: 'blur(26px) saturate(160%)' }}
      onPointerDown={() => inputRef.current?.focus()}
    >
      {/* tab strip */}
      <div className="tab-strip" style={{ borderBottom: '1px solid var(--line)' }}>
        <TerminalSquare size={14} className="mr-1 shrink-0 text-muted" />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="tab"
            data-active={tab.id === activeId ? 'true' : 'false'}
            onClick={() => setActiveId(tab.id)}
          >
            <span className="max-w-[150px] truncate">{prettyPath(tab.cwd, home) === '~' ? tab.title : prettyPath(tab.cwd, home).split('/').pop()}</span>
            {tabs.length > 1 ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Close tab"
                className="grid h-[16px] w-[16px] place-items-center rounded hover:bg-[var(--active)]"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                <X size={11} />
              </span>
            ) : null}
          </button>
        ))}
        <button type="button" className="icon-btn ml-1 !h-[22px] !w-[22px]" onClick={newTab} title="New tab">
          <Plus size={13} />
        </button>
        <button
          type="button"
          className="icon-btn !h-[22px] !w-[22px]"
          title="Copy visible buffer"
          onClick={() => {
            const text = active.lines.map((l) => l.text).join('\n')
            void navigator.clipboard?.writeText(text).then(
              () => bus.emit(EVT.TOAST, { text: 'Terminal buffer copied', kind: 'success' }),
              () => bus.emit(EVT.TOAST, { text: 'Clipboard unavailable', kind: 'warn' }),
            )
          }}
        >
          <Copy size={12} />
        </button>
      </div>

      {/* scrollback */}
      <div
        ref={scrollRef}
        className="mono min-h-0 flex-1 overflow-y-auto px-3 py-2.5 text-[12.5px] leading-[1.6]"
        style={{ userSelect: 'text' }}
      >
        {active.lines.length === 0 ? (
          <div className="text-faint">Last login: {new Date().toLocaleString()}</div>
        ) : null}
        {active.lines.map((line, i) => {
          if (line.kind === 'input') {
            return (
              <div key={i} className="whitespace-pre-wrap break-words">
                <span style={{ color: 'var(--success)' }}>{prompt}</span>
                <span className="text-faint">:</span>
                <span style={{ color: 'var(--accent)' }}>{prettyPath(active.cwd, home)}</span>
                <span className="text-faint">$ </span>
                <span>{line.text}</span>
              </div>
            )
          }
          return (
            <div
              key={i}
              className="whitespace-pre-wrap break-words"
              style={{
                color:
                  line.kind === 'err'
                    ? 'var(--danger)'
                    : line.kind === 'sys'
                      ? 'var(--accent)'
                      : 'var(--text-muted)',
              }}
            >
              {line.text}
            </div>
          )
        })}

        {/* live prompt */}
        <div className="flex items-baseline">
          <span className="shrink-0" style={{ color: 'var(--success)' }}>
            {prompt}
          </span>
          <span className="shrink-0 text-faint">:</span>
          <span className="shrink-0" style={{ color: 'var(--accent)' }}>
            {prettyPath(active.cwd, home)}
          </span>
          <span className="shrink-0 text-faint">$&nbsp;</span>
          <input
            ref={inputRef}
            className="mono w-full flex-1 border-none bg-transparent p-0 text-[12.5px] outline-none"
            style={{ color: 'var(--text)' }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            disabled={active.busy}
            aria-label="Terminal input"
          />
        </div>

        {active.busy ? <div className="text-faint">running…</div> : null}
        <div className="h-2" />
      </div>

      {/* status bar */}
      <div
        className="flex items-center justify-between px-3 py-1 text-[10.5px] text-faint"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <span>
          {bridge.mode === 'native' ? `native host · ${info?.platform ?? ''}` : 'web preview · mock shell'}
        </span>
        <span>
          {themeState.mode} · {tabs.length} tab{tabs.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}

function renderSysInfo(info: SysInfo): string {
  return [
    `${info.user}@${info.hostname}`,
    `-----------------`,
    `OS:        ${info.os}`,
    `Kernel:    ${info.kernel}`,
    `Platform:  ${info.platform} (${info.arch})`,
    `CPU:       ${info.cpuModel} · ${info.cpuCores} cores`,
    `Memory:    ${bytes(info.totalMem - info.freeMem)} used / ${bytes(info.totalMem)}`,
    `Uptime:    ${formatUptime(info.uptime)}`,
    `Versions:  auraos ${info.versions.auraos ?? info.appVersion}${info.versions.electron ? ` · electron ${info.versions.electron}` : ''}${info.versions.node ? ` · node ${info.versions.node}` : ''}`,
  ].join('\n')
}

export default TerminalApp
