import { BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import os from 'os'
import type { MetricSample, ProcEntry } from '../../shared/bridge'
import { CH } from '../../shared/channels'

interface CpuTimes {
  idle: number
  total: number
}

interface ProcCpuState {
  seconds: number
  ts: number
}

function readCpuTimes(): CpuTimes[] {
  return os.cpus().map((cpu) => {
    const t = cpu.times
    const total = t.user + t.nice + t.sys + t.idle + t.irq
    return { idle: t.idle, total }
  })
}

function run(cmd: string, args: string[], timeoutMs = 4000): Promise<string> {
  return new Promise((resolve) => {
    let out = ''
    let done = false
    const child = spawn(cmd, args, { windowsHide: true })
    const timer = setTimeout(() => {
      if (done) return
      done = true
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      resolve(out)
    }, timeoutMs)

    child.stdout?.on('data', (c: Buffer) => {
      out += c.toString('utf8')
      if (out.length > 4_000_000) {
        done = true
        clearTimeout(timer)
        try {
          child.kill()
        } catch {
          /* ignore */
        }
        resolve(out)
      }
    })
    child.on('error', () => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(out)
    })
    child.on('close', () => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(out)
    })
  })
}

export class MetricsService {
  private prevCpu: CpuTimes[] | null = null
  private procCpu = new Map<number, ProcCpuState>()
  private timer: ReturnType<typeof setInterval> | null = null
  private lastSample: MetricSample | null = null

  /** Start pushing samples to every renderer + seed the process CPU baseline. */
  start(intervalMs = 1500): void {
    if (this.timer) return
    this.prevCpu = readCpuTimes()
    void this.listProcesses().then((list) => {
      // the first call only seeds deltas
      void list
    })
    this.timer = setInterval(() => {
      const sample = this.sample()
      this.lastSample = sample
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(CH.SYS_METRICS, sample)
      }
    }, intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  sample(): MetricSample {
    const current = readCpuTimes()
    const prev = this.prevCpu
    let cores: number[] = []

    if (prev && prev.length === current.length) {
      cores = current.map((c, i) => {
        const dTotal = c.total - prev[i].total
        const dIdle = c.idle - prev[i].idle
        if (dTotal <= 0) return 0
        const pct = (1 - dIdle / dTotal) * 100
        return Math.min(100, Math.max(0, Math.round(pct * 10) / 10))
      })
    } else {
      cores = current.map(() => 0)
    }
    this.prevCpu = current

    const cpu = cores.length ? Math.round((cores.reduce((a, b) => a + b, 0) / cores.length) * 10) / 10 : 0
    const memTotal = os.totalmem()
    const memUsed = memTotal - os.freemem()

    return {
      ts: Date.now(),
      cpu,
      cores,
      memUsed,
      memTotal,
      uptime: Math.floor(os.uptime()),
    }
  }

  getLast(): MetricSample | null {
    return this.lastSample
  }

  async listProcesses(): Promise<ProcEntry[]> {
    switch (process.platform) {
      case 'win32':
        return this.listWindowsProcesses()
      case 'darwin':
        return this.listPsProcesses(['-axo', 'pid=,user=,pcpu=,rss=,comm=', '-r'])
      default:
        return this.listPsProcesses(['-eo', 'pid=,user=,pcpu=,rss=,comm=', '--sort=-pcpu'])
    }
  }

  private async listWindowsProcesses(): Promise<ProcEntry[]> {
    const json = await run('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64 | ConvertTo-Json -Compress',
    ])

    if (json.trim()) {
      try {
        const parsed = JSON.parse(json) as unknown
        const rows = (Array.isArray(parsed) ? parsed : [parsed]) as Array<{
          Id?: number
          ProcessName?: string
          CPU?: number | null
          WorkingSet64?: number
        }>
        const now = Date.now()
        const entries: ProcEntry[] = rows
          .filter((r) => typeof r.Id === 'number')
          .map((r) => {
            const pid = r.Id as number
            const cpuSeconds = typeof r.CPU === 'number' ? r.CPU : 0
            const prev = this.procCpu.get(pid)
            let pct = 0
            if (prev && now > prev.ts) {
              const deltaSeconds = cpuSeconds - prev.seconds
              pct = deltaSeconds > 0 ? (deltaSeconds / ((now - prev.ts) / 1000)) * 100 : 0
            }
            this.procCpu.set(pid, { seconds: cpuSeconds, ts: now })
            return {
              pid,
              name: r.ProcessName ?? 'unknown',
              cpu: Math.max(0, Math.round(pct * 10) / 10),
              mem: Math.round((r.WorkingSet64 ?? 0) / (1024 * 1024)),
              user: undefined,
            }
          })
        return entries.sort((a, b) => b.cpu - a.cpu).slice(0, 80)
      } catch {
        /* fall through to tasklist */
      }
    }

    const csv = await run('tasklist', ['/fo', 'csv', '/nh'])
    const rows: ProcEntry[] = []
    for (const line of csv.split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)","(\d+)","[^"]*","[^"]*","([\d,]+) K"$/)
      if (!m) continue
      rows.push({
        pid: Number(m[2]),
        name: m[1],
        cpu: 0,
        mem: Math.round(Number(m[3].replace(/,/g, '')) / 1024),
      })
    }
    return rows.slice(0, 80)
  }

  private async listPsProcesses(args: string[]): Promise<ProcEntry[]> {
    const out = await run('ps', args)
    const rows: ProcEntry[] = []
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^\s*(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s*$/)
      if (!m) continue
      rows.push({
        pid: Number(m[1]),
        user: m[2],
        cpu: Math.round(Number(m[3]) * 10) / 10,
        mem: Math.round(Number(m[4]) / 1024),
        name: m[5].split('/').pop() ?? m[5],
      })
    }
    return rows.sort((a, b) => b.cpu - a.cpu).slice(0, 80)
  }

  async kill(pid: number): Promise<{ ok: boolean; error?: string }> {
    if (!Number.isInteger(pid) || pid <= 4) {
      return { ok: false, error: `Refusing to terminate protected pid ${pid}` }
    }
    if (pid === process.pid) {
      return { ok: false, error: 'Refusing to terminate the AuraOS host process' }
    }
    return new Promise((resolve) => {
      const child =
        process.platform === 'win32'
          ? spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
          : null
      if (child) {
        let err = ''
        child.stderr?.on('data', (c: Buffer) => {
          err += c.toString()
        })
        child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: err || `taskkill exited ${code}` }))
        child.on('error', (e) => resolve({ ok: false, error: e.message }))
        return
      }
      try {
        process.kill(pid, 'SIGKILL')
        resolve({ ok: true })
      } catch (e) {
        resolve({ ok: false, error: (e as Error).message })
      }
    })
  }
}

export const metrics = new MetricsService()
