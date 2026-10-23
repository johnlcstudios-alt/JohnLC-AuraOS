/**
 * Single source of truth for IPC channel names.
 * Imported by: electron/main.ts, electron/preload.ts, src/core/ipc/*
 */
export const CH = {
  // system
  SYS_INFO: 'sys:info',
  SYS_METRICS: 'sys:metrics', // push channel, main -> renderer
  SYS_PROCESSES: 'sys:processes',
  SYS_KILL: 'sys:kill',
  SYS_OPEN_PATH: 'sys:openPath',
  SYS_BEEP: 'sys:beep',
  SYS_PRINT: 'sys:print',
  SYS_SET_BADGE: 'sys:setBadge',
  SYS_FLASH_FRAME: 'sys:flashFrame',

  // filesystem
  FS_HOME: 'fs:home',
  FS_LIST: 'fs:list',
  FS_STAT: 'fs:stat',
  FS_READ_TEXT: 'fs:readText',
  FS_WRITE_TEXT: 'fs:writeText',
  FS_READ_DATA_URL: 'fs:readDataUrl',
  FS_READ_MEDIA_URL: 'fs:readMediaUrl',
  FS_WRITE_TEMP_MEDIA: 'fs:writeTempMedia',
  FS_WRITE_DATA_URL: 'fs:writeDataUrl',
  FS_MKDIR: 'fs:mkdir',
  FS_REMOVE: 'fs:remove',
  FS_PICK_IMAGE: 'fs:pickImage',
  FS_COPY: 'fs:copy',
  FS_MOVE: 'fs:move',
  FS_TRASH: 'fs:trash',
  FS_SEARCH: 'fs:search',
  FS_REVEAL: 'fs:reveal',
  FS_OPEN_WITH: 'fs:openWith',
  FS_ZIP: 'fs:zip',
  FS_UNZIP: 'fs:unzip',

  // clipboard
  CLIP_READ_TEXT: 'clip:readText',
  CLIP_WRITE_TEXT: 'clip:writeText',
  CLIP_READ_IMAGE: 'clip:readImage',
  CLIP_WRITE_IMAGE: 'clip:writeImage',

  // screen
  SCREEN_LIST_DISPLAYS: 'screen:listDisplays',
  SCREEN_CAPTURE_DISPLAY: 'screen:captureDisplay',

  // power
  POWER_STATUS: 'power:status',
  POWER_LOCK: 'power:lock',
  POWER_SLEEP: 'power:sleep',
  POWER_RESTART: 'power:restart',
  POWER_SHUTDOWN: 'power:shutdown',
  POWER_PREVENT_SLEEP: 'power:preventSleep',

  // dialogs (native)
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_SAVE_FILE: 'dialog:saveFile',
  DIALOG_MESSAGE: 'dialog:message',

  // shell
  SHELL_EXEC: 'shell:exec',

  // config
  CFG_ALL: 'cfg:all',
  CFG_GET: 'cfg:get',
  CFG_SET: 'cfg:set',

  // app / host window
  APP_QUIT: 'app:quit',
  APP_OPEN_EXTERNAL: 'app:openExternal',
  APP_AUTO_LAUNCH_GET: 'app:autoLaunchGet',
  APP_AUTO_LAUNCH_SET: 'app:autoLaunchSet',
} as const

export type ChannelName = (typeof CH)[keyof typeof CH]
