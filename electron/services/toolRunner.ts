import { spawn } from 'child_process'

export interface ToolResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

const MAX_OUTPUT = 1_000_000

/**
 * Run an external tool and capture its output. Used for the archive helpers
 * (Compress-Archive / zip) where re-implementing the format by hand would be a
 * large, thankless job. Never throws: a missing binary resolves with code -1.
 */
export function runTool(
  command: string,
  args: string[],
  timeoutMs = 30_000,
  cwd?: string,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const child = spawn(command, args, { windowsHide: true, cwd, env: { ...process.env, NO_COLOR: '1' } })

    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        code,
        stdout: stdout.slice(0, MAX_OUTPUT),
        stderr: stderr.slice(0, MAX_OUTPUT),
        timedOut,
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      setTimeout(() => finish(null), 300)
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      stderr += error.message
      finish(-1)
    })
    child.on('close', (code) => finish(code))
  })
}
