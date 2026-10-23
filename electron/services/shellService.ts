import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import type { ShellResult } from '../../shared/bridge'

const MAX_OUTPUT = 1_000_000
const DEFAULT_TIMEOUT = 30_000

// eslint-disable-next-line no-control-regex
const ANSI = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

/**
 * Line-oriented shell execution.
 *
 * We deliberately avoid a native pty: interactive TUIs (vim, htop) are out of
 * scope, but every ordinary command works and ships no native build step.
 */
export function execShell(
  command: string,
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<ShellResult> {
  const started = Date.now()
  const cwd = opts.cwd && opts.cwd.trim() ? opts.cwd : os.homedir()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const child = spawn(command, {
      shell: true,
      cwd,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', TERM: 'dumb' },
    })

    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        code,
        stdout: stripAnsi(stdout).slice(0, MAX_OUTPUT),
        stderr: stripAnsi(stderr).slice(0, MAX_OUTPUT),
        timedOut,
        durationMs: Date.now() - started,
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      killTree(child.pid)
      setTimeout(() => finish(null), 400)
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      stderr += `${err.message}\n`
      finish(-1)
    })
    child.on('close', (code) => finish(code))
  })
}

/** Kill a process and its children (Windows needs taskkill for the tree). */
export function killTree(pid: number | undefined): void {
  if (!pid) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    } catch {
      /* ignore */
    }
  } else {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* ignore */
    }
  }
}

/** Default cwd advertised to the Terminal app. */
export function defaultCwd(): string {
  return path.resolve(os.homedir()).replace(/\\/g, '/')
}
