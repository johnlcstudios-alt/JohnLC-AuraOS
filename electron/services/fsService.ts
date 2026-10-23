import { dialog, BrowserWindow, shell } from 'electron'
import { promises as fsp } from 'fs'
import { createHash } from 'crypto'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import type { ArchiveResult, DirEntry, FileStat, SearchOptions } from '../../shared/bridge'
import { runTool } from './toolRunner'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'])
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])
const MAX_DATA_URL_BYTES = 24 * 1024 * 1024

const MEDIA_EXT = new Set([...AUDIO_EXT, ...VIDEO_EXT])

/** Directories that are never worth descending into during a filename search. */
const SEARCH_SKIP = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '$RECYCLE.BIN',
  'System Volume Information',
  'AppData',
  'Windows',
  'Program Files',
  'Program Files (x86)',
  '.cache',
  '.next',
  'dist',
  'dist-electron',
])

/** AuraOS uses forward slashes internally, even on Windows. */
export function normalize(p: string): string {
  return p.replace(/\\/g, '/')
}

export function homeDir(): string {
  return normalize(os.homedir())
}

/** `~` and `~/x` expansion. */
export function expand(p: string): string {
  if (!p) return homeDir()
  let out = normalize(p)
  if (out === '~') return homeDir()
  if (out.startsWith('~/')) out = homeDir() + out.slice(1)
  return out
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

async function toEntry(dir: string, name: string): Promise<DirEntry | null> {
  const full = `${normalize(dir).replace(/\/$/, '')}/${name}`
  try {
    const st = await fsp.lstat(full)
    const kind: DirEntry['kind'] = st.isDirectory() ? 'dir' : st.isSymbolicLink() ? 'link' : 'file'
    return {
      name,
      path: full,
      kind,
      size: st.isDirectory() ? 4096 : st.size,
      mtime: st.mtimeMs,
      ext: kind === 'dir' ? '' : extOf(name),
    }
  } catch {
    return null
  }
}

/** Ensure a data-url is a supported image before writing it to disk. */
function parseImageDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new Error('Invalid image data-url')
  return Buffer.from(match[1], 'base64')
}

export const fsService = {
  home(): string {
    return homeDir()
  },

  async list(input: string): Promise<DirEntry[]> {
    const dir = expand(input)
    const names = await fsp.readdir(dir)
    const entries = (await Promise.all(names.map((name) => toEntry(dir, name)))).filter(
      (e): e is DirEntry => e !== null,
    )
    return entries.sort((a, b) => {
      if (a.kind === 'dir' && b.kind !== 'dir') return -1
      if (b.kind === 'dir' && a.kind !== 'dir') return 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })
  },

  async stat(input: string): Promise<FileStat> {
    const p = expand(input)
    const st = await fsp.stat(p)
    const name = p.split('/').filter(Boolean).pop() ?? p
    const kind: DirEntry['kind'] = st.isDirectory() ? 'dir' : 'file'
    return {
      name,
      path: p,
      kind,
      size: st.isDirectory() ? 4096 : st.size,
      mtime: st.mtimeMs,
      created: st.birthtimeMs || st.ctimeMs,
      ext: kind === 'dir' ? '' : extOf(name),
    }
  },

  async readText(input: string, maxBytes = 512 * 1024): Promise<string> {
    const p = expand(input)
    const st = await fsp.stat(p)
    if (st.isDirectory()) throw new Error(`EISDIR: ${p} is a directory`)
    const handle = await fsp.open(p, 'r')
    try {
      const length = Math.min(st.size, maxBytes)
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, 0)
      let text = buffer.toString('utf8')
      if (buffer.includes(0)) throw new Error('Binary file - cannot preview as text')
      if (length < st.size) text += `\n\n… truncated at ${Math.round(length / 1024)} KB (${Math.round(st.size / 1024)} KB total)`
      return text
    } finally {
      await handle.close()
    }
  },

  async writeText(input: string, text: string): Promise<void> {
    const p = expand(input)
    await fsp.mkdir(path.dirname(p), { recursive: true })
    await fsp.writeFile(p, text, 'utf8')
  },

  async readDataUrl(input: string): Promise<string | null> {
    const p = expand(input)
    if (!IMAGE_EXT.has(extOf(p))) return null
    const st = await fsp.stat(p)
    if (!st.isFile() || st.size > MAX_DATA_URL_BYTES) return null
    const buf = await fsp.readFile(p)
    const mime =
      extOf(p) === 'svg'
        ? 'image/svg+xml'
        : extOf(p) === 'jpg' || extOf(p) === 'jpeg'
          ? 'image/jpeg'
          : `image/${extOf(p)}`
    return `data:${mime};base64,${buf.toString('base64')}`
  },

  /**
   * A URL a media element can actually load.
   *
   * The renderer is served from `file://`, and Chromium's media URL safety
   * check refuses `data:`/`blob:` sources there ("Media load rejected by URL
   * safety check"). Handing back a `file://` URL lets Chromium stream straight
   * from disk instead — no base64 copy in memory, however large the video.
   */
  async readMediaUrl(input: string): Promise<string | null> {
    const p = expand(input)
    const ext = extOf(p)
    if (!MEDIA_EXT.has(ext)) return null
    try {
      const st = await fsp.stat(p)
      if (!st.isFile()) return null
      return pathToFileURL(p).href
    } catch {
      return null
    }
  },

  /**
   * Persist an in-memory media blob (the generated stations) into the OS temp
   * directory and return a loadable `file://` URL. Same reason as
   * `readMediaUrl`: `blob:` media is blocked on `file://` pages.
   */
  async writeTempMedia(dataUrl: string): Promise<string | null> {
    const match = /^data:[a-zA-Z0-9.+/-]+;base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl)
    if (!match) return null
    const buf = Buffer.from(match[1], 'base64')
    if (!buf.length) return null
    const key = createHash('sha1').update(buf).digest('hex').slice(0, 16)
    const dir = path.join(os.tmpdir(), 'auraos-media')
    const file = path.join(dir, `${key}.wav`)
    try {
      await fsp.access(file)
    } catch {
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(file, buf)
    }
    return pathToFileURL(file).href
  },

  async writeDataUrl(input: string, dataUrl: string): Promise<void> {
    const p = expand(input)
    const buf = parseImageDataUrl(dataUrl)
    await fsp.mkdir(path.dirname(p), { recursive: true })
    await fsp.writeFile(p, buf)
  },

  async mkdir(input: string): Promise<void> {
    await fsp.mkdir(expand(input), { recursive: true })
  },

  async remove(input: string): Promise<void> {
    await fsp.rm(expand(input), { recursive: true, force: true })
  },

  async copy(src: string, dest: string): Promise<void> {
    const from = expand(src)
    const to = expand(dest)
    await fsp.mkdir(path.dirname(to), { recursive: true })
    await fsp.cp(from, to, { recursive: true })
  },

  async move(src: string, dest: string): Promise<void> {
    const from = expand(src)
    const to = expand(dest)
    await fsp.mkdir(path.dirname(to), { recursive: true })
    try {
      await fsp.rename(from, to)
    } catch (error) {
      // cross-device rename: fall back to copy + delete
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        await fsp.cp(from, to, { recursive: true })
        await fsp.rm(from, { recursive: true, force: true })
        return
      }
      throw error
    }
  },

  async trash(input: string): Promise<void> {
    const p = expand(input)
    const native = normalize(p)
    try {
      await shell.trashItem(native)
    } catch {
      await fsp.rm(native, { recursive: true, force: true })
    }
  },

  async search(root: string, query: string, opts: SearchOptions = {}): Promise<DirEntry[]> {
    const start = expand(root)
    const needle = opts.caseSensitive ? query : query.toLowerCase()
    const maxResults = Math.min(Math.max(opts.maxResults ?? 200, 1), 2000)
    const maxDepth = Math.min(Math.max(opts.maxDepth ?? 6, 1), 12)
    const exts = opts.extensions?.map((e) => e.toLowerCase())
    const results: DirEntry[] = []

    const matches = (entry: DirEntry): boolean => {
      if (entry.kind === 'dir' && !opts.includeDirs) return false
      if (exts && entry.kind !== 'dir' && !exts.includes(entry.ext)) return false
      const haystack = opts.caseSensitive ? entry.name : entry.name.toLowerCase()
      return haystack.includes(needle)
    }

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (results.length >= maxResults || depth > maxDepth) return
      let entries: DirEntry[]
      try {
        entries = await this.list(dir)
      } catch {
        return
      }
      for (const entry of entries) {
        if (results.length >= maxResults) return
        if (matches(entry)) results.push(entry)
        if (entry.kind === 'dir' && depth < maxDepth && !SEARCH_SKIP.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(entry.path, depth + 1)
        }
      }
    }

    await walk(start, 0)
    return results
  },

  async pickImage(parent: BrowserWindow | null): Promise<string | null> {
    const result = await dialog.showOpenDialog(parent ?? undefined!, {
      title: 'Choose a wallpaper',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
    })
    if (result.canceled || !result.filePaths.length) return null
    return normalize(result.filePaths[0])
  },

  /** Create a .zip using the platform tools that ship with every OS. */
  async zip(paths: string[], dest: string): Promise<ArchiveResult> {
    const out = expand(dest)
    const inputs = paths.map(expand)
    if (!inputs.length) return { ok: false, output: '', error: 'No inputs to archive' }
    await fsp.mkdir(path.dirname(out), { recursive: true })
    try {
      if (process.platform === 'win32') {
        const quoted = inputs.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')
        const script = `Compress-Archive -Path ${quoted} -DestinationPath '${out.replace(/'/g, "''")}' -Force`
        const res = await runTool('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], 60_000)
        return res.code === 0
          ? { ok: true, output: out }
          : { ok: false, output: out, error: res.stderr || `Compress-Archive exited ${res.code}` }
      }
      // macOS / Linux: zip keeps paths relative to cwd, so run from a common root.
      const root = path.dirname(inputs[0])
      const res = await runTool('zip', ['-r', '-q', out, ...inputs.map((p) => path.relative(root, p))], 60_000, root)
      return res.code === 0
        ? { ok: true, output: out }
        : { ok: false, output: out, error: res.stderr || `zip exited ${res.code}` }
    } catch (error) {
      return { ok: false, output: out, error: error instanceof Error ? error.message : String(error) }
    }
  },

  /** Extract an archive using the platform tools. */
  async unzip(archive: string, dest: string): Promise<ArchiveResult> {
    const src = expand(archive)
    const out = expand(dest)
    await fsp.mkdir(out, { recursive: true })
    try {
      if (process.platform === 'win32') {
        const script = `Expand-Archive -Path '${src.replace(/'/g, "''")}' -DestinationPath '${out.replace(/'/g, "''")}' -Force`
        const res = await runTool('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], 120_000)
        return res.code === 0
          ? { ok: true, output: out }
          : { ok: false, output: out, error: res.stderr || `Expand-Archive exited ${res.code}` }
      }
      const res = await runTool('unzip', ['-o', '-q', src, '-d', out], 120_000)
      return res.code === 0
        ? { ok: true, output: out }
        : { ok: false, output: out, error: res.stderr || `unzip exited ${res.code}` }
    } catch (error) {
      return { ok: false, output: out, error: error instanceof Error ? error.message : String(error) }
    }
  },
}
