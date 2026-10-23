import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * One-time migration from the pre-rebrand install. The bridge contract did not
 * change, so an existing `openos-config.json` can be adopted as-is.
 */
async function migrateLegacyConfig(target: string): Promise<void> {
  try {
    await fs.access(target)
    return
  } catch {
    /* the AuraOS config does not exist yet */
  }

  // Never pull another profile's data into an isolated profile. Smoke tests and
  // portable runs pass `--user-data-dir`, which makes userData differ from the
  // default derived from the product name.
  const defaultUserData = path.join(app.getPath('appData'), app.getName())
  if (path.resolve(app.getPath('userData')) !== path.resolve(defaultUserData)) return

  const candidates = [
    // `%APPDATA%/openos/` (old app name) on Windows; the equivalent per platform.
    path.join(app.getPath('appData'), 'openos', 'openos-config.json'),
    // Same userData folder, pre-rebrand file name.
    path.join(app.getPath('userData'), 'openos-config.json'),
  ]

  for (const legacy of candidates) {
    try {
      let raw = await fs.readFile(legacy, 'utf8')

      // The only branded value persisted by older builds was the Wi-Fi SSID.
      try {
        const parsed = JSON.parse(raw) as { system?: { activeNetwork?: unknown } }
        const network = parsed.system?.activeNetwork
        if (typeof network === 'string' && network.startsWith('OpenOS-')) {
          parsed.system!.activeNetwork = `AuraOS-${network.slice('OpenOS-'.length)}`
          raw = JSON.stringify(parsed, null, 2)
        }
      } catch {
        /* not JSON, or no branded value — copy the bytes verbatim */
      }

      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, raw, 'utf8')
      return
    } catch {
      /* try the next candidate */
    }
  }
}

/**
 * Persistent key/value store backed by a JSON file in the user data directory.
 * Used by the theme engine, system toggles and the Files app tags.
 */
class ConfigService {
  private bag: Record<string, unknown> = {}
  private loaded = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private file(): string {
    return path.join(app.getPath('userData'), 'auraos-config.json')
  }

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    await migrateLegacyConfig(this.file())
    try {
      const raw = await fs.readFile(this.file(), 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') this.bag = parsed
    } catch {
      this.bag = {}
    }
  }

  all(): Record<string, unknown> {
    return this.bag
  }

  get<T>(key: string, fallback: T): T {
    return key in this.bag ? (this.bag[key] as T) : fallback
  }

  set(key: string, value: unknown): void {
    this.bag[key] = value
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.persist()
    }, 200)
  }

  private async persist(): Promise<void> {
    try {
      await fs.writeFile(this.file(), JSON.stringify(this.bag, null, 2), 'utf8')
    } catch {
      /* disk full / permission: not worth crashing the shell over */
    }
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await this.persist()
  }
}

export const config = new ConfigService()
