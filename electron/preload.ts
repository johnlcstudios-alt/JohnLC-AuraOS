import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../shared/channels'
import type { AuraOSBridge } from '../shared/bridge'

interface IpcEnvelope<T> {
  ok: boolean
  value?: T
  error?: string
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = (await ipcRenderer.invoke(channel, ...args)) as IpcEnvelope<T> | T
  if (response && typeof response === 'object' && 'ok' in (response as object)) {
    const env = response as IpcEnvelope<T>
    if (!env.ok) throw new Error(env.error ?? 'Unknown IPC error')
    return env.value as T
  }
  return response as T
}

const bridge: AuraOSBridge = {
  mode: 'native',
  platform: process.platform,

  system: {
    info: () => invoke(CH.SYS_INFO),
    metrics: () => invoke(CH.SYS_METRICS),
    onMetrics: (cb) => {
      const listener = (_event: unknown, sample: Parameters<typeof cb>[0]) => cb(sample)
      ipcRenderer.on(CH.SYS_METRICS, listener as never)
      return () => ipcRenderer.removeListener(CH.SYS_METRICS, listener as never)
    },
    processes: () => invoke(CH.SYS_PROCESSES),
    kill: (pid: number) => invoke(CH.SYS_KILL, pid),
    openPath: (p: string) => invoke(CH.SYS_OPEN_PATH, p),
    beep: () => invoke(CH.SYS_BEEP),
    print: () => invoke(CH.SYS_PRINT),
    setBadge: (text: string) => invoke(CH.SYS_SET_BADGE, text),
    flashFrame: (on: boolean) => invoke(CH.SYS_FLASH_FRAME, on),
  },

  fs: {
    home: () => invoke(CH.FS_HOME),
    list: (dir: string) => invoke(CH.FS_LIST, dir),
    stat: (p: string) => invoke(CH.FS_STAT, p),
    readText: (p: string, maxBytes?: number) => invoke(CH.FS_READ_TEXT, p, maxBytes),
    writeText: (p: string, text: string) => invoke(CH.FS_WRITE_TEXT, p, text),
    readDataUrl: (p: string) => invoke(CH.FS_READ_DATA_URL, p),
    readMediaUrl: (p: string) => invoke(CH.FS_READ_MEDIA_URL, p),
    writeTempMedia: (dataUrl: string) => invoke(CH.FS_WRITE_TEMP_MEDIA, dataUrl),
    writeDataUrl: (p: string, dataUrl: string) => invoke(CH.FS_WRITE_DATA_URL, p, dataUrl),
    mkdir: (p: string) => invoke(CH.FS_MKDIR, p),
    remove: (p: string) => invoke(CH.FS_REMOVE, p),
    pickImage: () => invoke(CH.FS_PICK_IMAGE),
    copy: (src: string, dest: string) => invoke(CH.FS_COPY, src, dest),
    move: (src: string, dest: string) => invoke(CH.FS_MOVE, src, dest),
    trash: (p: string) => invoke(CH.FS_TRASH, p),
    search: (root: string, query: string, opts) => invoke(CH.FS_SEARCH, root, query, opts),
    reveal: (p: string) => invoke(CH.FS_REVEAL, p),
    openWith: (p: string) => invoke(CH.FS_OPEN_WITH, p),
    zip: (paths: string[], dest: string) => invoke(CH.FS_ZIP, paths, dest),
    unzip: (archive: string, dest: string) => invoke(CH.FS_UNZIP, archive, dest),
  },

  clipboard: {
    readText: () => invoke(CH.CLIP_READ_TEXT),
    writeText: (text: string) => invoke(CH.CLIP_WRITE_TEXT, text),
    readImage: () => invoke(CH.CLIP_READ_IMAGE),
    writeImage: (dataUrl: string) => invoke(CH.CLIP_WRITE_IMAGE, dataUrl),
  },

  screen: {
    listDisplays: () => invoke(CH.SCREEN_LIST_DISPLAYS),
    captureDisplay: (id?: string) => invoke(CH.SCREEN_CAPTURE_DISPLAY, id),
  },

  power: {
    status: () => invoke(CH.POWER_STATUS),
    lock: () => invoke(CH.POWER_LOCK),
    sleep: () => invoke(CH.POWER_SLEEP),
    restart: () => invoke(CH.POWER_RESTART),
    shutdown: () => invoke(CH.POWER_SHUTDOWN),
    preventSleep: (enable: boolean, reason?: string) => invoke(CH.POWER_PREVENT_SLEEP, enable, reason),
  },

  dialog: {
    openFile: (opts) => invoke(CH.DIALOG_OPEN_FILE, opts),
    saveFile: (opts) => invoke(CH.DIALOG_SAVE_FILE, opts),
    message: (opts) => invoke(CH.DIALOG_MESSAGE, opts),
  },

  shell: {
    exec: (command, opts) => invoke(CH.SHELL_EXEC, command, opts),
  },

  config: {
    all: () => invoke(CH.CFG_ALL),
    get: <T>(key: string, fallback: T) => invoke<T>(CH.CFG_GET, key, fallback),
    set: (key, value) => invoke(CH.CFG_SET, key, value),
  },

  app: {
    quit: () => invoke(CH.APP_QUIT),
    openExternal: (url: string) => invoke(CH.APP_OPEN_EXTERNAL, url),
    getAutoLaunch: () => invoke(CH.APP_AUTO_LAUNCH_GET),
    setAutoLaunch: (enabled: boolean) => invoke(CH.APP_AUTO_LAUNCH_SET, enabled),
  },
}

contextBridge.exposeInMainWorld('auraos', bridge)
