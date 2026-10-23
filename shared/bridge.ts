/**
 * The JohnLC AuraOS bridge contract.
 *
 * The renderer NEVER talks to Node directly. It only sees the object exposed on
 * `window.auraos` by the Electron preload script (sandboxed, contextIsolation on).
 * When AuraOS runs in a plain browser (`npm run dev:web`) the same interface is
 * fulfilled by `src/core/ipc/mockBridge.ts`, so every UI feature stays runnable.
 */

export type BridgeMode = 'native' | 'web'

export interface DirEntry {
  name: string
  /** absolute path, always using forward slashes for portability */
  path: string
  kind: 'file' | 'dir' | 'link'
  size: number
  /** epoch ms */
  mtime: number
  /** lowercase extension without the dot ('' for folders) */
  ext: string
}

export interface FileStat extends DirEntry {
  created: number
}

export interface BridgeRect {
  x: number
  y: number
  w: number
  h: number
}

export interface SysInfo {
  os: string
  platform: string
  arch: string
  kernel: string
  hostname: string
  user: string
  /** seconds */
  uptime: number
  totalMem: number
  freeMem: number
  cpuModel: string
  cpuCores: number
  versions: Record<string, string>
  appVersion: string
}

export interface MetricSample {
  ts: number
  /** 0..100 */
  cpu: number
  /** per logical core, 0..100 */
  cores: number[]
  memUsed: number
  memTotal: number
  /** seconds */
  uptime: number
}

export interface ProcEntry {
  pid: number
  name: string
  /** percent */
  cpu: number
  /** megabytes */
  mem: number
  user?: string
}

export interface ShellResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut?: boolean
  durationMs: number
}

export interface DisplayInfo {
  /** stable numeric id ('' when unknown) */
  id: string
  label: string
  bounds: BridgeRect
  workArea: BridgeRect
  scaleFactor: number
  rotation: number
  primary: boolean
  internal: boolean
}

export interface AutoLaunchStatus {
  /** false in browser/dev builds — only an installed build can register itself */
  supported: boolean
  /** true when the OS will start the app after sign-in */
  enabled: boolean
  /** human-readable explanation for the Settings UI */
  detail: string
}

export interface PowerStatus {
  onBattery: boolean
  /** 0..100, or null when unknown */
  percent: number | null
  charging: boolean
  /** 'active' | 'idle' | 'locked' | 'unknown' */
  state: string
  platform: string
  canSuspend: boolean
  canLock: boolean
  canRestart: boolean
  canShutdown: boolean
}

export interface DialogFilter {
  name: string
  extensions: string[]
}

export interface OpenFileOptions {
  title?: string
  defaultPath?: string
  filters?: DialogFilter[]
  /** allow selecting more than one file */
  multi?: boolean
  /** allow selecting directories instead of files */
  directory?: boolean
}

export interface SaveFileOptions {
  title?: string
  defaultPath?: string
  filters?: DialogFilter[]
  buttonLabel?: string
}

export type MessageType = 'none' | 'info' | 'error' | 'question' | 'warning'

export interface MessageOptions {
  title?: string
  message: string
  detail?: string
  type?: MessageType
  buttons?: string[]
  defaultId?: number
  cancelId?: number
  checkboxLabel?: string
}

export interface MessageResult {
  response: number
  checkboxChecked: boolean
}

export interface SearchOptions {
  maxResults?: number
  maxDepth?: number
  caseSensitive?: boolean
  /** include directories in the results (default false) */
  includeDirs?: boolean
  /** restrict to these lowercase extensions, e.g. ['md','ts'] */
  extensions?: string[]
}

export interface ArchiveResult {
  ok: boolean
  /** list of produced files, or the extracted root */
  output: string
  error?: string
}

export type ConfigBag = Record<string, unknown>

export interface AuraOSBridge {
  readonly mode: BridgeMode
  readonly platform: string

  system: {
    info(): Promise<SysInfo>
    metrics(): Promise<MetricSample>
    /** subscribe to the main-process sampler; returns an unsubscribe fn */
    onMetrics(cb: (sample: MetricSample) => void): () => void
    processes(): Promise<ProcEntry[]>
    kill(pid: number): Promise<{ ok: boolean; error?: string }>
    /** open a path with the OS default handler */
    openPath(path: string): Promise<{ ok: boolean; error?: string }>
    /** short system beep */
    beep(): Promise<void>
    /** open the native print dialog for the host window */
    print(): Promise<void>
    /** badge count on the taskbar/dock icon ('' clears) */
    setBadge(text: string): Promise<void>
    /** bounce the dock icon / flash the taskbar to demand attention */
    flashFrame(on: boolean): Promise<void>
  }

  fs: {
    home(): Promise<string>
    list(dir: string): Promise<DirEntry[]>
    stat(path: string): Promise<FileStat>
    readText(path: string, maxBytes?: number): Promise<string>
    writeText(path: string, text: string): Promise<void>
    /** base64 data-url, or null when the file is not a previewable image */
    readDataUrl(path: string): Promise<string | null>
    /**
     * A URL an audio/video element can load for `path`, or null when the file is
     * not supported. Native returns a `file://` URL (Chromium rejects
     * `data:`/`blob:` media on `file://` pages); the browser mock returns null
     * because it has no real bytes.
     */
    readMediaUrl(path: string): Promise<string | null>
    /**
     * Persist an in-memory audio blob (a generated station) to a temp file and
     * return a loadable URL. Native only; the browser uses blob URLs directly,
     * so the mock returns null.
     */
    writeTempMedia(dataUrl: string): Promise<string | null>
    /** persist a base64 data-url (e.g. a screenshot) to disk */
    writeDataUrl(path: string, dataUrl: string): Promise<void>
    mkdir(path: string): Promise<void>
    remove(path: string): Promise<void>
    /** native file picker for wallpapers; resolves to null when cancelled */
    pickImage(): Promise<string | null>
    /** copy a file or directory tree */
    copy(src: string, dest: string): Promise<void>
    /** move / rename a file or directory */
    move(src: string, dest: string): Promise<void>
    /** move to the OS trash when available (falls back to delete) */
    trash(path: string): Promise<void>
    /** recursive filename search under `root` */
    search(root: string, query: string, opts?: SearchOptions): Promise<DirEntry[]>
    /** reveal in the OS file manager */
    reveal(path: string): Promise<void>
    /** open with the OS default application */
    openWith(path: string): Promise<{ ok: boolean; error?: string }>
    /** create a .zip archive containing `paths` */
    zip(paths: string[], dest: string): Promise<ArchiveResult>
    /** extract an archive into `dest` */
    unzip(archive: string, dest: string): Promise<ArchiveResult>
  }

  clipboard: {
    readText(): Promise<string>
    writeText(text: string): Promise<void>
    /** PNG data-url of the clipboard image, or null */
    readImage(): Promise<string | null>
    writeImage(dataUrl: string): Promise<void>
  }

  screen: {
    listDisplays(): Promise<DisplayInfo[]>
    /** PNG data-url of a display (primary when id omitted) */
    captureDisplay(id?: string): Promise<string | null>
  }

  power: {
    status(): Promise<PowerStatus>
    lock(): Promise<void>
    sleep(): Promise<void>
    restart(): Promise<void>
    shutdown(): Promise<void>
    /** block the display/system from sleeping (e.g. during media playback) */
    preventSleep(enable: boolean, reason?: string): Promise<void>
  }

  dialog: {
    openFile(opts?: OpenFileOptions): Promise<string[] | null>
    saveFile(opts?: SaveFileOptions): Promise<string | null>
    message(opts: MessageOptions): Promise<MessageResult>
  }

  shell: {
    exec(command: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<ShellResult>
  }

  config: {
    all(): Promise<ConfigBag>
    get<T>(key: string, fallback: T): Promise<T>
    set(key: string, value: unknown): Promise<void>
  }

  app: {
    quit(): Promise<void>
    openExternal(url: string): Promise<void>
    getAutoLaunch(): Promise<AutoLaunchStatus>
    setAutoLaunch(enabled: boolean): Promise<AutoLaunchStatus>
  }
}

declare global {
  interface Window {
    auraos?: AuraOSBridge
  }
}
