#!/usr/bin/env node
/**
 * JohnLC AuraOS smoke test (native Electron).
 *
 * Launches the built app with remote debugging enabled, drives the real UI over
 * the Chrome DevTools Protocol (keyboard shortcuts + DOM assertions) and reports
 * pass/fail. No extra dependencies: Node's built-in WebSocket and fetch.
 *
 *   node scripts/smoke.mjs               # built app (dist/ + dist-electron/)
 *   node scripts/smoke.mjs --port 9333   # custom CDP port
 *   node scripts/smoke.mjs --keep        # leave the app running afterwards
 *
 * Uses an isolated --user-data-dir so each run starts from a clean profile.
 * Exit code is non-zero when any check fails, so it is CI friendly.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { connect, delay, runCoreChecks, Reporter } from './lib/cdp.mjs'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}
const PORT = Number(arg('port', '9330'))
const KEEP = process.argv.includes('--keep')
const BOOT_TIMEOUT = Number(arg('timeout', '30000'))

async function main() {
  const electronPath = require('electron')
  const userData = join(tmpdir(), `auraos-smoke-${process.pid}`)
  console.log(`\nJohnLC AuraOS smoke test (native)\n  electron: ${electronPath}\n  cdp port: ${PORT}\n  profile:  ${userData}\n`)

  const child = spawn(electronPath, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AURAOS_SMOKE: '1' },
  })
  let stderr = ''
  child.stdout.on('data', () => {})
  child.stderr.on('data', (d) => {
    stderr += d.toString()
  })

  let cdp
  try {
    cdp = await connect(PORT, { timeout: BOOT_TIMEOUT })
  } catch (error) {
    child.kill()
    throw new Error(`${error.message}\n${stderr}`)
  }

  console.log('checks:')
  const reporter = new Reporter()
  await runCoreChecks(cdp, reporter)
  reporter.summary()

  cdp.ws.close()
  if (!KEEP) {
    child.kill()
    await delay(400)
    if (!child.killed) child.kill('SIGKILL')
  }
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    /* the profile dir may still be locked on Windows; harmless */
  }
}

main().catch((error) => {
  console.error(`\nsmoke test failed to run: ${error.message}\n`)
  process.exitCode = 1
})
