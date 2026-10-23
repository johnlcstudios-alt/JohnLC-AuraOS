import { app, BrowserWindow, ipcMain, shell } from 'electron'
import os from 'os'
import path from 'path'
import { CH } from '../shared/channels'
import type { AutoLaunchStatus, MessageOptions, OpenFileOptions, SaveFileOptions, SysInfo } from '../shared/bridge'
import { config } from './services/configService'
import { fsService } from './services/fsService'
import { execShell, defaultCwd } from './services/shellService'
import { metrics } from './services/metricsService'
import { clipboardService } from './services/clipboardService'
import { screenService } from './services/screenService'
import { powerService } from './services/powerService'
import { dialogService } from './services/dialogService'

const isDev = !!process.env.VITE_DEV_SERVER_URL
const APP_VERSION = app.getVersion()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    title: 'JohnLC AuraOS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // F11 fullscreen / F12 devtools / Ctrl+R reload - a frameless window needs them
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') {
      mainWindow?.setFullScreen(!mainWindow.isFullScreen())
    } else if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
    } else if (input.control && input.key.toLowerCase() === 'r') {
      mainWindow?.webContents.reload()
    }
  })

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

/** Wrap handlers so renderer rejections carry a clean message. */
function handle(channel: string, fn: (...args: never[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const value = await (fn as (...a: unknown[]) => unknown)(...args)
      return { ok: true, value }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

function registerIpc(): void {
  handle(CH.SYS_INFO, async (): Promise<SysInfo> => {
    const cpus = os.cpus()
    return {
      os: `${os.type()} ${os.release()}`,
      platform: process.platform,
      arch: process.arch,
      kernel: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      user: os.userInfo().username,
      uptime: Math.floor(os.uptime()),
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      cpuModel: cpus[0]?.model?.trim() ?? 'Unknown CPU',
      cpuCores: cpus.length,
      versions: {
        auraos: APP_VERSION,
        electron: process.versions.electron ?? '',
        chrome: process.versions.chrome ?? '',
        node: process.versions.node ?? '',
        v8: process.versions.v8 ?? '',
      },
      appVersion: APP_VERSION,
    }
  })

  handle(CH.SYS_METRICS, async () => metrics.sample())
  handle(CH.SYS_PROCESSES, async () => metrics.listProcesses())
  handle(CH.SYS_KILL, async (pid: number) => metrics.kill(pid))

  handle(CH.SYS_OPEN_PATH, async (p: string) => {
    const error = await shell.openPath(p)
    return { ok: !error, error: error || undefined }
  })
  handle(CH.SYS_BEEP, async () => {
    shell.beep()
    return true
  })
  handle(CH.SYS_PRINT, async () => {
    mainWindow?.webContents.print({})
    return true
  })
  handle(CH.SYS_SET_BADGE, async (text: string) => {
    if (process.platform === 'darwin') {
      app.dock?.setBadge(text)
      return true
    }
    app.setBadgeCount(text ? Number(text) || 0 : 0)
    return true
  })
  handle(CH.SYS_FLASH_FRAME, async (on: boolean) => {
    mainWindow?.flashFrame(on)
    return true
  })

  handle(CH.FS_HOME, async () => fsService.home())
  handle(CH.FS_LIST, async (dir: string) => fsService.list(dir))
  handle(CH.FS_STAT, async (p: string) => fsService.stat(p))
  handle(CH.FS_READ_TEXT, async (p: string, maxBytes?: number) => fsService.readText(p, maxBytes))
  handle(CH.FS_WRITE_TEXT, async (p: string, text: string) => fsService.writeText(p, text))
  handle(CH.FS_READ_DATA_URL, async (p: string) => fsService.readDataUrl(p))
  handle(CH.FS_READ_MEDIA_URL, async (p: string) => fsService.readMediaUrl(p))
  handle(CH.FS_WRITE_TEMP_MEDIA, async (dataUrl: string) => fsService.writeTempMedia(dataUrl))
  handle(CH.FS_WRITE_DATA_URL, async (p: string, dataUrl: string) => fsService.writeDataUrl(p, dataUrl))
  handle(CH.FS_MKDIR, async (p: string) => fsService.mkdir(p))
  handle(CH.FS_REMOVE, async (p: string) => fsService.remove(p))
  handle(CH.FS_PICK_IMAGE, async () => fsService.pickImage(mainWindow))
  handle(CH.FS_COPY, async (src: string, dest: string) => fsService.copy(src, dest))
  handle(CH.FS_MOVE, async (src: string, dest: string) => fsService.move(src, dest))
  handle(CH.FS_TRASH, async (p: string) => fsService.trash(p))
  handle(CH.FS_SEARCH, async (root: string, query: string, opts?: Parameters<typeof fsService.search>[2]) =>
    fsService.search(root, query, opts),
  )
  handle(CH.FS_REVEAL, async (p: string) => {
    shell.showItemInFolder(p)
    return true
  })
  handle(CH.FS_OPEN_WITH, async (p: string) => {
    const error = await shell.openPath(p)
    return { ok: !error, error: error || undefined }
  })
  handle(CH.FS_ZIP, async (paths: string[], dest: string) => fsService.zip(paths, dest))
  handle(CH.FS_UNZIP, async (archive: string, dest: string) => fsService.unzip(archive, dest))

  handle(CH.CLIP_READ_TEXT, async () => clipboardService.readText())
  handle(CH.CLIP_WRITE_TEXT, async (text: string) => {
    clipboardService.writeText(text)
    return true
  })
  handle(CH.CLIP_READ_IMAGE, async () => clipboardService.readImage())
  handle(CH.CLIP_WRITE_IMAGE, async (dataUrl: string) => {
    clipboardService.writeImage(dataUrl)
    return true
  })

  handle(CH.SCREEN_LIST_DISPLAYS, async () => screenService.listDisplays())
  handle(CH.SCREEN_CAPTURE_DISPLAY, async (id?: string) => screenService.captureDisplay(id))

  handle(CH.POWER_STATUS, async () => powerService.status())
  handle(CH.POWER_LOCK, async () => {
    await powerService.lock()
    return true
  })
  handle(CH.POWER_SLEEP, async () => {
    await powerService.sleep()
    return true
  })
  handle(CH.POWER_RESTART, async () => {
    await powerService.restart()
    return true
  })
  handle(CH.POWER_SHUTDOWN, async () => {
    await powerService.shutdown()
    return true
  })
  handle(CH.POWER_PREVENT_SLEEP, async (enable: boolean, reason?: string) => {
    powerService.preventSleep(enable, reason)
    return true
  })

  handle(CH.DIALOG_OPEN_FILE, async (opts?: OpenFileOptions) => dialogService.openFile(opts, mainWindow))
  handle(CH.DIALOG_SAVE_FILE, async (opts?: SaveFileOptions) => dialogService.saveFile(opts, mainWindow))
  handle(CH.DIALOG_MESSAGE, async (opts: MessageOptions) => dialogService.message(opts, mainWindow))

  handle(CH.SHELL_EXEC, async (command: string, opts?: { cwd?: string; timeoutMs?: number }) =>
    execShell(command, opts ?? { cwd: defaultCwd() }),
  )

  handle(CH.CFG_ALL, async () => config.all())
  handle(CH.CFG_GET, async (key: string, fallback: unknown) => config.get(key, fallback))
  handle(CH.CFG_SET, async (key: string, value: unknown) => {
    config.set(key, value)
    return true
  })

  handle(CH.APP_QUIT, async () => {
    await config.flush()
    app.quit()
    return true
  })
  handle(CH.APP_OPEN_EXTERNAL, async (url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
    return true
  })

  handle(CH.APP_AUTO_LAUNCH_GET, async () => autoLaunchStatus())
  handle(CH.APP_AUTO_LAUNCH_SET, async (enabled: boolean) => {
    if (canAutoLaunch()) {
      app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath })
    }
    return autoLaunchStatus()
  })
}

/** Auto-start is only meaningful for an installed build on Windows/macOS. */
function canAutoLaunch(): boolean {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')
}

function autoLaunchStatus(): AutoLaunchStatus {
  if (!canAutoLaunch()) {
    return {
      supported: false,
      enabled: false,
      detail: app.isPackaged
        ? `Auto-start is not supported on ${process.platform}`
        : 'Available after installing JohnLC AuraOS',
    }
  }
  const enabled = app.getLoginItemSettings().openAtLogin
  return {
    supported: true,
    enabled,
    detail: enabled ? 'Opens automatically when you sign in to this PC' : 'Starts only when you open it',
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    await config.load()
    registerIpc()
    createWindow()
    metrics.start(1500)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    metrics.stop()
    app.quit()
  })
}
