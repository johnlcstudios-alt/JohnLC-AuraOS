import type {
  ArchiveResult,
  AuraOSBridge,
  ConfigBag,
  DirEntry,
  DisplayInfo,
  FileStat,
  MessageOptions,
  MessageResult,
  MetricSample,
  OpenFileOptions,
  PowerStatus,
  ProcEntry,
  SaveFileOptions,
  SearchOptions,
  ShellResult,
  SysInfo,
} from '../../../shared/bridge'

/**
 * Browser fallback implementation of the AuraOS bridge.
 * Keeps the entire desktop environment usable (and demoable) without Electron:
 * fake but plausible filesystem, simulated telemetry and a small shell.
 *
 * Surfaces that fundamentally need the native host (screen capture, native
 * dialogs, real power control) are simulated honestly - they never pretend to
 * touch the real machine.
 */

const EXT = (name: string) => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

const now = Date.now()
const day = 86_400_000

interface MockFile {
  name: string
  kind: 'file' | 'dir'
  size: number
  mtime: number
  content?: string
}

const README = `# JohnLC AuraOS

Welcome to the AuraOS demo filesystem.

You are running the *web preview* of JohnLC AuraOS, so the filesystem you see here is
generated in memory. Launch the native host (npm run dev) to browse your real
disk, run real shell commands and watch real CPU/RAM telemetry.

## Highlights
- Window manager with snapping, minimize animations and dynamic z-indexing
- Dock with magnification, or a Windows 11 style centered taskbar
- Spotlight universal search (Ctrl/Cmd + Space)
- Control Center, Widgets and a live wallpaper engine
`

const TREE: Record<string, MockFile[]> = {
  '~': [
    { name: 'Desktop', kind: 'dir', size: 4096, mtime: now - day },
    { name: 'Documents', kind: 'dir', size: 4096, mtime: now - day * 4 },
    { name: 'Downloads', kind: 'dir', size: 4096, mtime: now - 3600_000 },
    { name: 'Pictures', kind: 'dir', size: 4096, mtime: now - day * 5 },
    { name: 'Music', kind: 'dir', size: 4096, mtime: now - day * 30 },
    { name: 'Videos', kind: 'dir', size: 4096, mtime: now - day * 8 },
    { name: 'Projects', kind: 'dir', size: 4096, mtime: now - 60_000 },
  ],
  '~/Desktop': [
    { name: 'Projects', kind: 'dir', size: 4096, mtime: now - day },
    { name: 'Notes.md', kind: 'file', size: 1284, mtime: now - day * 2, content: '# Notes\n\n- Try Snap Layouts by hovering the green maximize button\n- Ctrl+Space opens Spotlight\n- Terminal: type `sysinfo`\n' },
    { name: 'screenshot.png', kind: 'file', size: 486_233, mtime: now - day * 3 },
  ],
  '~/Documents': [
    { name: 'Work', kind: 'dir', size: 4096, mtime: now - day * 4 },
    { name: 'Invoices', kind: 'dir', size: 4096, mtime: now - day * 9 },
    { name: 'design-spec.md', kind: 'file', size: 8421, mtime: now - day, content: '# Design spec\n\nGlass panels use a 30px backdrop blur with 180% saturation.\n' },
    { name: 'budget.csv', kind: 'file', size: 2048, mtime: now - day * 6, content: 'item,cost\nblur,120\nshadows,80\n' },
  ],
  '~/Documents/Work': [
    { name: 'roadmap.md', kind: 'file', size: 3120, mtime: now - day, content: '# Roadmap\n\nQ1 - window manager\nQ2 - theming\n' },
    { name: 'standup.txt', kind: 'file', size: 640, mtime: now - day * 2, content: 'Standup notes\n- snapping done\n- dock magnification in progress\n' },
  ],
  '~/Documents/Invoices': [
    { name: '2026-01.pdf', kind: 'file', size: 91_233, mtime: now - day * 20 },
    { name: '2026-02.pdf', kind: 'file', size: 88_004, mtime: now - day * 12 },
  ],
  '~/Downloads': [
    { name: 'auraos-0.1.0.zip', kind: 'file', size: 42_881_233, mtime: now - 3600_000 },
    { name: 'wallpaper-pack.tar', kind: 'file', size: 18_221_004, mtime: now - 7200_000 },
    { name: 'installer.log', kind: 'file', size: 14_820, mtime: now - 900_000, content: 'npm install\nadded 258 packages in 49s\n' },
  ],
  '~/Pictures': [
    { name: 'aurora.jpg', kind: 'file', size: 2_881_233, mtime: now - day * 5 },
    { name: 'nebula.jpg', kind: 'file', size: 3_442_001, mtime: now - day * 11 },
    { name: 'gradient.svg', kind: 'file', size: 902, mtime: now - day * 3, content: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g"><stop offset="0" stop-color="#6aa8ff"/><stop offset="1" stop-color="#a06bff"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>' },
  ],
  '~/Music': [{ name: 'ambient-loop.mp3', kind: 'file', size: 8_112_004, mtime: now - day * 30 }],
  '~/Videos': [{ name: 'demo-capture.mp4', kind: 'file', size: 120_442_001, mtime: now - day * 8 }],
  '~/Projects': [
    { name: 'auraos', kind: 'dir', size: 4096, mtime: now - 60_000 },
    { name: 'notes.txt', kind: 'file', size: 512, mtime: now - day, content: 'ideas: quick settings, widgets panel, live wallpapers\n' },
  ],
  '~/Projects/auraos': [
    { name: 'src', kind: 'dir', size: 4096, mtime: now - 60_000 },
    { name: 'package.json', kind: 'file', size: 1204, mtime: now - 60_000, content: '{\n  "name": "johnlc-auraos",\n  "version": "0.1.0"\n}\n' },
    { name: 'README.md', kind: 'file', size: README.length, mtime: now - 60_000, content: README },
  ],
  '~/Projects/auraos/src': [
    { name: 'core', kind: 'dir', size: 4096, mtime: now - 60_000 },
    { name: 'main.tsx', kind: 'file', size: 402, mtime: now - 60_000, content: "import { createRoot } from 'react-dom/client'\n" },
  ],
  '~/Projects/auraos/src/core': [
    { name: 'wm', kind: 'dir', size: 4096, mtime: now - 60_000 },
    { name: 'theme', kind: 'dir', size: 4096, mtime: now - 60_000 },
  ],
  '~/Projects/auraos/src/core/wm': [
    { name: 'WindowManager.ts', kind: 'file', size: 12_004, mtime: now - 60_000, content: '// the AuraOS window manager state machine\n' },
    { name: 'snap.ts', kind: 'file', size: 4402, mtime: now - 60_000, content: '// snap regions and layouts\n' },
  ],
  '~/Projects/auraos/src/core/theme': [
    { name: 'ThemeEngine.ts', kind: 'file', size: 6204, mtime: now - 60_000, content: '// theme + accent + wallpaper engine\n' },
  ],
}

const HOME = '~'

function mockPath(name: string, dir: string): string {
  const base = dir === '~' ? '~' : dir.replace(/\/$/, '')
  return `${base}/${name}`
}

function entriesOf(dir: string): MockFile[] {
  const normalized = dir === HOME || dir === '' ? HOME : dir.replace(/\/$/, '')
  return TREE[normalized] ?? []
}

function toDirEntry(file: MockFile, dir: string): DirEntry {
  return {
    name: file.name,
    path: mockPath(file.name, dir),
    kind: file.kind,
    size: file.kind === 'dir' ? 4096 : file.size,
    mtime: file.mtime,
    ext: file.kind === 'dir' ? '' : EXT(file.name),
  }
}

function findEntry(path: string): { entry: MockFile; dir: string } | null {
  const clean = path.replace(/\/$/, '')
  const slash = clean.lastIndexOf('/')
  const dir = slash <= 0 ? HOME : clean.slice(0, slash)
  const name = clean.slice(slash + 1)
  const found = entriesOf(dir).find((f) => f.name === name)
  return found ? { entry: found, dir } : null
}

const TEXT_EXT = new Set(['txt', 'md', 'json', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'csv', 'log', 'svg', 'yml', 'yaml'])

function svgPreview(label: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="480" height="320" rx="16" fill="url(#g)"/><text x="50%" y="52%" fill="rgba(255,255,255,.92)" font-family="Segoe UI,sans-serif" font-size="22" text-anchor="middle">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Pick a file/folder name for a fake directory. */
function placeFile(path: string, kind: 'file' | 'dir', content?: string): MockFile {
  const clean = path.replace(/\/$/, '')
  const slash = clean.lastIndexOf('/')
  const dir = slash <= 0 ? HOME : clean.slice(0, slash)
  const name = clean.slice(slash + 1)
  const file: MockFile = {
    name,
    kind,
    size: kind === 'dir' ? 4096 : (content?.length ?? 0),
    mtime: Date.now(),
    content,
  }
  TREE[dir] = TREE[dir] ?? []
  TREE[dir] = TREE[dir].filter((f) => f.name !== name)
  TREE[dir].push(file)
  if (kind === 'dir') TREE[clean] = TREE[clean] ?? []
  return file
}

function removePath(path: string): void {
  const clean = path.replace(/\/$/, '')
  const found = findEntry(clean)
  if (found) TREE[found.dir] = entriesOf(found.dir).filter((f) => f.name !== found.entry.name)
  for (const key of Object.keys(TREE)) {
    if (key === clean || key.startsWith(`${clean}/`)) delete TREE[key]
  }
}

/** Recursively collect entries for the mock search. */
function walkEntries(dir: string, depth: number, maxDepth: number, out: DirEntry[]): void {
  if (depth > maxDepth) return
  for (const file of entriesOf(dir)) {
    out.push(toDirEntry(file, dir))
    if (file.kind === 'dir' && depth < maxDepth) walkEntries(mockPath(file.name, dir), depth + 1, maxDepth, out)
  }
}

interface WebBatteryManager extends EventTarget {
  charging: boolean
  level: number
}
interface WebNavigator extends Navigator {
  getBattery?: () => Promise<WebBatteryManager>
}

export function createMockBridge(): AuraOSBridge {
  const listeners = new Set<(s: MetricSample) => void>()
  const started = Date.now()
  const cores = Math.max(4, Math.min(16, navigator.hardwareConcurrency || 8))
  const memTotal = 16 * 1024 * 1024 * 1024

  let cpu = 12
  let memUsed = 5.4 * 1024 * 1024 * 1024
  let timer: ReturnType<typeof setInterval> | null = null
  let wakeLock: WakeLockSentinel | null = null
  let clipText = ''
  let clipImage: string | null = null

  const sample = (): MetricSample => {
    cpu = Math.min(96, Math.max(3, cpu + (Math.random() - 0.48) * 14))
    memUsed = Math.min(memTotal - 1e9, Math.max(2e9, memUsed + (Math.random() - 0.5) * 2.2e8))
    const coreSamples = Array.from({ length: cores }, () =>
      Math.min(100, Math.max(1, cpu + (Math.random() - 0.5) * 32)),
    )
    return {
      ts: Date.now(),
      cpu,
      cores: coreSamples,
      memUsed,
      memTotal,
      uptime: Math.floor((Date.now() - started) / 1000),
    }
  }

  const ensureSampler = () => {
    if (timer) return
    timer = setInterval(() => {
      const s = sample()
      listeners.forEach((fn) => fn(s))
    }, 1500)
  }

  const configKey = (key: string) => `auraos.${key}`

  const processes: ProcEntry[] = [
    { pid: 1, name: 'auraos-shell', cpu: 3.4, mem: 268 },
    { pid: 412, name: 'window-manager', cpu: 5.1, mem: 184 },
    { pid: 908, name: 'compositor', cpu: 7.8, mem: 322 },
    { pid: 1204, name: 'theme-engine', cpu: 0.9, mem: 96 },
    { pid: 1533, name: 'dock', cpu: 1.2, mem: 128 },
    { pid: 1711, name: 'spotlight-indexer', cpu: 2.6, mem: 210 },
    { pid: 2033, name: 'electron', cpu: 6.4, mem: 512 },
    { pid: 2401, name: 'terminal', cpu: 0.4, mem: 74 },
    { pid: 2677, name: 'files', cpu: 0.6, mem: 118 },
    { pid: 3012, name: 'settings', cpu: 0.3, mem: 132 },
    { pid: 3390, name: 'taskmanager', cpu: 1.8, mem: 158 },
  ]

  const shellHelp = `AuraOS shell (web preview)

Built-in commands:
  help            show this message
  ls [path]       list a directory
  cd <path>       change directory
  pwd             print working directory
  cat <file>      print a text file
  echo <text>     print text
  date            current date/time
  whoami          current user
  ps              list processes
  df              disk usage
  clear           clear the screen

Native commands like git, npm or rg work when running the Electron host.`

  const interpreter = (command: string, cwd: string): ShellResult => {
    const started2 = Date.now()
    const [rawCmd, ...rest] = command.trim().split(/\s+/)
    const arg = rest.join(' ')
    const ok = (stdout: string): ShellResult => ({ code: 0, stdout, stderr: '', durationMs: Date.now() - started2 })

    switch (rawCmd) {
      case 'help':
        return ok(shellHelp)
      case 'echo':
        return ok(arg.replace(/^["']|["']$/g, ''))
      case 'pwd':
        return ok(cwd)
      case 'whoami':
        return ok('lcc24')
      case 'date':
        return ok(new Date().toString())
      case 'clear':
        return ok('\u0000CLEAR')
      case 'ls': {
        const target = arg || cwd
        const list = entriesOf(target)
        if (!list.length) return { code: 1, stdout: '', stderr: `ls: ${target}: No such directory`, durationMs: Date.now() - started2 }
        return ok(list.map((f) => (f.kind === 'dir' ? `${f.name}/` : f.name)).join('  '))
      }
      case 'cat': {
        const found = findEntry(arg.startsWith('~/') || arg.startsWith('/') ? arg : `${cwd}/${arg}`)
        if (!found) return { code: 1, stdout: '', stderr: `cat: ${arg}: No such file`, durationMs: Date.now() - started2 }
        if (found.entry.kind === 'dir') return { code: 1, stdout: '', stderr: `cat: ${arg}: Is a directory`, durationMs: Date.now() - started2 }
        return ok(found.entry.content ?? `<binary file, ${found.entry.size} bytes>`)
      }
      case 'ps':
        return ok(processes.map((p) => `${String(p.pid).padStart(6)}  ${p.cpu.toFixed(1).padStart(5)}  ${p.name}`).join('\n'))
      case 'df':
        return ok('Filesystem      Size  Used  Avail  Use%\n/dev/nvme0n1p2  512G  218G   294G   43%')
      default:
        return {
          code: 127,
          stdout: '',
          stderr: `${rawCmd}: command not found (web preview). Run the Electron host for real shell access.`,
          durationMs: Date.now() - started2,
        }
    }
  }

  const pickFiles = (opts: OpenFileOptions): Promise<string[] | null> =>
    new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = !!opts.multi
      if (opts.directory) {
        // the web platform cannot hand us a real folder path
        resolve(null)
        return
      }
      input.onchange = () => {
        const files = Array.from(input.files ?? [])
        resolve(files.length ? files.map((f) => `~/Downloads/${f.name}`) : null)
      }
      input.click()
    })

  const screenCapturePlaceholder = (label: string): string =>
    svgPreview(label, '#1b2a5e', '#3b1e6e')

  return {
    mode: 'web',
    platform: 'web',

    system: {
      async info(): Promise<SysInfo> {
        return {
          os: 'JohnLC AuraOS (web preview)',
          platform: 'browser',
          arch: 'wasm',
          kernel: 'chromium',
          hostname: 'auraos-preview',
          user: 'lcc24',
          uptime: Math.floor((Date.now() - started) / 1000),
          totalMem: memTotal,
          freeMem: memTotal - memUsed,
          cpuModel: 'Simulated CPU @ 3.2GHz',
          cpuCores: cores,
          versions: { auraos: '0.1.0', renderer: 'web', bridge: 'mock' },
          appVersion: '0.1.0',
        }
      },
      async metrics() {
        return sample()
      },
      onMetrics(cb) {
        ensureSampler()
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      async processes() {
        return processes.map((p) => ({
          ...p,
          cpu: Math.max(0.1, p.cpu + (Math.random() - 0.5) * 4),
          mem: Math.max(24, p.mem + (Math.random() - 0.5) * 40),
        }))
      },
      async kill(pid) {
        const idx = processes.findIndex((p) => p.pid === pid)
        if (idx >= 0) processes.splice(idx, 1)
        return { ok: idx >= 0, error: idx < 0 ? 'Process not found' : undefined }
      },
      async openPath() {
        return { ok: false, error: 'Opening files needs the native host' }
      },
      async beep() {
        try {
          const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          if (Ctor) {
            const ctx = new Ctor()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            gain.gain.value = 0.05
            osc.connect(gain).connect(ctx.destination)
            osc.frequency.value = 880
            osc.start()
            osc.stop(ctx.currentTime + 0.08)
            window.setTimeout(() => void ctx.close(), 200)
          }
        } catch {
          /* audio blocked until first gesture */
        }
      },
      async print() {
        window.print()
      },
      async setBadge(text) {
        document.title = text ? `(${text}) JohnLC AuraOS` : 'JohnLC AuraOS'
      },
      async flashFrame() {
        /* no host window in the browser */
      },
    },

    fs: {
      async home() {
        return HOME
      },
      async list(dir) {
        const entries = entriesOf(dir)
        if (!entries.length) {
          const exists = TREE[dir.replace(/\/$/, '')]
          if (!exists) throw new Error(`ENOENT: no such directory, scandir '${dir}'`)
        }
        return entries
          .map((f) => toDirEntry(f, dir))
          .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
      },
      async stat(path) {
        if (path === HOME || path === '~/' || path === '') {
          return { name: 'Home', path: HOME, kind: 'dir', size: 4096, mtime: now, ext: '', created: now }
        }
        const found = findEntry(path)
        if (!found) throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
        return { ...toDirEntry(found.entry, found.dir), created: found.entry.mtime - day }
      },
      async readText(path, maxBytes = 512 * 1024) {
        if (path.endsWith('README.md') || path.includes('auraos/README')) return README.slice(0, maxBytes)
        const found = findEntry(path)
        if (!found) throw new Error(`ENOENT: no such file or directory, open '${path}'`)
        const entry = found.entry
        if (entry.kind === 'dir') throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`)
        if (!TEXT_EXT.has(EXT(entry.name))) throw new Error(`Cannot read binary file '${path}'`)
        return (entry.content ?? '').slice(0, maxBytes)
      },
      async writeText(path, text) {
        placeFile(path, 'file', text)
      },
      async readDataUrl(path) {
        const found = findEntry(path)
        const ext = EXT(found?.entry.name ?? path)
        if (ext === 'svg') {
          const content = found?.entry.content
          if (content) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`
          return svgPreview(found?.entry.name ?? 'image', '#6aa8ff', '#a06bff')
        }
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)) {
          const palette: Record<string, [string, string]> = {
            png: ['#ff9f43', '#ff5c9d'],
            jpg: ['#4f8cff', '#a06bff'],
            jpeg: ['#4f8cff', '#a06bff'],
            webp: ['#2ecf7f', '#22c9c9'],
            gif: ['#f5c542', '#ff5f57'],
            bmp: ['#8a93a6', '#3a3f4b'],
          }
          const [from, to] = palette[ext] ?? ['#4f8cff', '#a06bff']
          return svgPreview(found?.entry.name ?? 'image', from, to)
        }
        return null
      },
      async readMediaUrl(path) {
        // The in-memory mock has no real audio/video bytes: return null so the
        // Music/Videos apps can be honest about needing the native host.
        void path
        return null
      },
      async writeTempMedia() {
        // Browsers play blob: URLs fine, so the caller keeps its blob URL.
        return null
      },
      async writeDataUrl(path) {
        placeFile(path, 'file', '')
      },
      async mkdir(path) {
        const slash = path.lastIndexOf('/')
        const dir = slash <= 0 ? HOME : path.slice(0, slash)
        const name = path.slice(slash + 1)
        TREE[dir] = TREE[dir] ?? []
        if (!TREE[dir].some((f) => f.name === name)) {
          TREE[dir].push({ name, kind: 'dir', size: 4096, mtime: Date.now() })
        }
        TREE[path] = TREE[path] ?? []
      },
      async remove(path) {
        removePath(path)
      },
      async pickImage() {
        return null
      },
      async copy(src, dest) {
        const found = findEntry(src)
        if (!found) throw new Error(`ENOENT: no such file or directory, copy '${src}'`)
        if (found.entry.kind === 'dir') {
          const name = dest.split('/').pop() ?? found.entry.name
          TREE[dest.replace(/\/$/, '')] = entriesOf(src).map((f) => ({ ...f }))
          placeFile(dest, 'dir')
          void name
          return
        }
        placeFile(dest, 'file', found.entry.content)
      },
      async move(src, dest) {
        const found = findEntry(src)
        if (!found) throw new Error(`ENOENT: no such file or directory, move '${src}'`)
        const clone = { ...found.entry }
        removePath(src)
        if (clone.kind === 'dir') placeFile(dest, 'dir')
        else placeFile(dest, 'file', clone.content)
      },
      async trash(path) {
        removePath(path)
      },
      async search(root, query, opts: SearchOptions = {}) {
        const all: DirEntry[] = []
        walkEntries(root, 0, opts.maxDepth ?? 6, all)
        const needle = (opts.caseSensitive ? query : query.toLowerCase()).trim()
        if (!needle) return []
        const exts = opts.extensions?.map((e) => e.toLowerCase())
        return all
          .filter((e) => {
            if (e.kind === 'dir' && !opts.includeDirs) return false
            if (exts && e.kind !== 'dir' && !exts.includes(e.ext)) return false
            const hay = opts.caseSensitive ? e.name : e.name.toLowerCase()
            return hay.includes(needle)
          })
          .slice(0, opts.maxResults ?? 200)
      },
      async reveal() {
        /* no OS file manager in the browser */
      },
      async openWith() {
        return { ok: false, error: 'Opening files needs the native host' }
      },
      async zip(paths, dest): Promise<ArchiveResult> {
        placeFile(dest, 'file', `# simulated archive of ${paths.length} item(s)`)
        return { ok: true, output: dest }
      },
      async unzip(archive, dest): Promise<ArchiveResult> {
        return { ok: false, output: dest, error: `Simulated: cannot extract ${archive.split('/').pop() ?? 'archive'} in the web preview` }
      },
    },

    clipboard: {
      async readText() {
        try {
          const text = await navigator.clipboard.readText()
          clipText = text
        } catch {
          /* permission denied: fall back to the last text we wrote */
        }
        return clipText
      },
      async writeText(text) {
        clipText = text
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          /* ignore */
        }
      },
      async readImage() {
        try {
          const items = await navigator.clipboard.read()
          for (const item of items) {
            const type = item.types.find((t) => t.startsWith('image/'))
            if (!type) continue
            const blob = await item.getType(type)
            return await new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onload = () => {
                clipImage = String(reader.result)
                resolve(clipImage)
              }
              reader.onerror = () => resolve(clipImage ?? '')
              reader.readAsDataURL(blob)
            })
          }
        } catch {
          /* permission denied */
        }
        return clipImage
      },
      async writeImage(dataUrl) {
        clipImage = dataUrl
        try {
          const blob = await (await fetch(dataUrl)).blob()
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        } catch {
          /* ignore */
        }
      },
    },

    screen: {
      async listDisplays(): Promise<DisplayInfo[]> {
        const w = window.screen.width
        const h = window.screen.height
        return [
          {
            id: '0',
            label: 'Browser display',
            bounds: { x: 0, y: 0, w, h },
            workArea: { x: 0, y: 0, w, h: Math.max(1, h - 48) },
            scaleFactor: window.devicePixelRatio || 1,
            rotation: 0,
            primary: true,
            internal: true,
          },
        ]
      },
      async captureDisplay() {
        return screenCapturePlaceholder('Screen capture needs the native host')
      },
    },

    power: {
      async status(): Promise<PowerStatus> {
        let onBattery = false
        let percent: number | null = null
        try {
          const nav = navigator as WebNavigator
          const battery = await nav.getBattery?.()
          if (battery) {
            onBattery = !battery.charging
            percent = Math.round(battery.level * 100)
          }
        } catch {
          /* not supported */
        }
        return {
          onBattery,
          percent,
          charging: !onBattery,
          state: 'active',
          platform: 'web',
          canSuspend: false,
          canLock: false,
          canRestart: false,
          canShutdown: false,
        }
      },
      async lock() {
        /* no OS session lock in the browser */
      },
      async sleep() {
        /* no-op */
      },
      async restart() {
        /* no-op */
      },
      async shutdown() {
        /* no-op */
      },
      async preventSleep(enable) {
        try {
          if (enable && 'wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen')
          } else if (!enable && wakeLock) {
            await wakeLock.release()
            wakeLock = null
          }
        } catch {
          /* wake lock denied */
        }
      },
    },

    dialog: {
      async openFile(opts = {}) {
        if (opts.directory) return null
        return pickFiles(opts)
      },
      async saveFile(opts: SaveFileOptions = {}) {
        // prompt for a target name, then hand back a plausible path
        const name = window.prompt('Save as (file name):', opts.defaultPath?.split('/').pop() ?? 'untitled.txt')
        if (!name) return null
        return `~/Downloads/${name}`
      },
      async message(opts: MessageOptions): Promise<MessageResult> {
        const buttons = opts.buttons ?? ['OK']
        const text = opts.detail ? `${opts.message}\n\n${opts.detail}` : opts.message
        let response = 0
        if (buttons.length <= 2) {
          const okDefault = opts.defaultId ?? 0
          const accepted = window.confirm(text)
          response = accepted ? okDefault : opts.cancelId ?? (buttons.length - 1)
        } else {
          const answer = window.prompt(`${text}\n\n${buttons.map((b, i) => `${i + 1}. ${b}`).join('\n')}`, '1')
          const idx = Number(answer) - 1
          response = Number.isInteger(idx) && idx >= 0 && idx < buttons.length ? idx : opts.cancelId ?? 0
        }
        return { response, checkboxChecked: false }
      },
    },

    shell: {
      async exec(command, opts) {
        return interpreter(command, opts?.cwd ?? HOME)
      },
    },

    config: {
      async all(): Promise<ConfigBag> {
        try {
          const raw = localStorage.getItem('auraos.config')
          return raw ? (JSON.parse(raw) as ConfigBag) : {}
        } catch {
          return {}
        }
      },
      async get<T>(key: string, fallback: T): Promise<T> {
        try {
          const raw = localStorage.getItem(configKey(key))
          return raw ? (JSON.parse(raw) as T) : fallback
        } catch {
          return fallback
        }
      },
      async set(key, value) {
        try {
          localStorage.setItem(configKey(key), JSON.stringify(value))
        } catch {
          /* quota / disabled storage: ignore */
        }
      },
    },

    app: {
      async quit() {
        // eslint-disable-next-line no-console
        console.info('[AuraOS] quit requested (web preview) - close the tab to exit')
      },
      async openExternal(url) {
        window.open(url, '_blank', 'noopener')
      },
      async getAutoLaunch() {
        return { supported: false, enabled: false, detail: 'Available after installing JohnLC AuraOS' }
      },
      async setAutoLaunch() {
        return { supported: false, enabled: false, detail: 'Available after installing JohnLC AuraOS' }
      },
    },
  }
}
