import { powerMonitor, powerSaveBlocker } from 'electron'
import type { PowerStatus } from '../../shared/bridge'
import { runTool } from './toolRunner'

/** Maps the numeric PowerMonitor idle state to a readable label. */
function idleLabel(): string {
  const state = powerMonitor.getSystemIdleState(60)
  switch (state) {
    case 'active':
      return 'active'
    case 'idle':
      return 'idle'
    case 'locked':
      return 'locked'
    default:
      return 'unknown'
  }
}

const blockerIds = new Set<number>()

/**
 * System power surface. Where Electron exposes an API (battery state, idle
 * detection, sleep inhibition) we use it directly; for lock/sleep/restart/
 * shutdown - which have no cross-platform Electron API - we shell out to the
 * OS commands that ship with each platform.
 */
export const powerService = {
  status(): PowerStatus {
    const platform = process.platform
    return {
      onBattery: powerMonitor.isOnBatteryPower(),
      percent: null,
      charging: !powerMonitor.isOnBatteryPower(),
      state: idleLabel(),
      platform,
      canSuspend: platform === 'win32' ? true : platform === 'darwin' ? true : true,
      canLock: true,
      canRestart: true,
      canShutdown: true,
    }
  },

  async lock(): Promise<void> {
    if (process.platform === 'win32') {
      await runTool('rundll32.exe', ['user32.dll,LockWorkStation'], 5000)
      return
    }
    if (process.platform === 'darwin') {
      await runTool('/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession', ['-suspend'], 5000)
      return
    }
    await runTool('loginctl', ['lock-session'], 5000)
  },

  async sleep(): Promise<void> {
    if (process.platform === 'win32') {
      await runTool('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], 5000)
      return
    }
    if (process.platform === 'darwin') {
      await runTool('pmset', ['sleepnow'], 5000)
      return
    }
    await runTool('systemctl', ['suspend'], 5000)
  },

  async restart(): Promise<void> {
    if (process.platform === 'win32') {
      await runTool('shutdown', ['/r', '/t', '0'], 5000)
      return
    }
    if (process.platform === 'darwin') {
      await runTool('osascript', ['-e', 'tell application "System Events" to restart'], 5000)
      return
    }
    await runTool('systemctl', ['reboot'], 5000)
  },

  async shutdown(): Promise<void> {
    if (process.platform === 'win32') {
      await runTool('shutdown', ['/s', '/t', '0'], 5000)
      return
    }
    if (process.platform === 'darwin') {
      await runTool('osascript', ['-e', 'tell application "System Events" to shut down'], 5000)
      return
    }
    await runTool('systemctl', ['poweroff'], 5000)
  },

  preventSleep(enable: boolean, reason?: string): void {
    if (enable) {
      const id = powerSaveBlocker.start('prevent-display-sleep')
      blockerIds.add(id)
      if (reason) void reason
      return
    }
    for (const id of blockerIds) {
      if (powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id)
    }
    blockerIds.clear()
  },
}
