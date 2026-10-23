#!/usr/bin/env node
/**
 * JohnLC AuraOS smoke test (web mode).
 *
 * Boots the Vite dev server, launches headless Chrome against it and runs the
 * same UI checks as the native smoke test. In web mode the renderer falls back
 * to MockBridge, so this validates the browser path end to end.
 *
 *   node scripts/smoke-web.mjs
 *   node scripts/smoke-web.mjs --port 9332 --web-port 5199
 *   node scripts/smoke-web.mjs --chrome "C:/path/to/chrome.exe"
 */
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { connect, delay, runCoreChecks, Reporter } from './lib/cdp.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}

const PORT = Number(arg('port', '9332'))
const WEB_PORT = Number(arg('web-port', '5199'))
const BOOT_TIMEOUT = Number(arg('timeout', '60000'))

function findChrome() {
  const explicit = arg('chrome', null)
  if (explicit) return explicit
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p))
}

async function waitForServer(url, timeout) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await delay(300)
  }
  throw new Error(`dev server did not respond at ${url} within ${timeout}ms`)
}

async function main() {
  const chrome = findChrome()
  if (!chrome) throw new Error('no Chrome/Edge found; pass --chrome <path> or set CHROME_PATH')

  console.log(`\nJohnLC AuraOS smoke test (web)\n  chrome:   ${chrome}\n  cdp port: ${PORT}\n  web port: ${WEB_PORT}\n`)

  // spawn vite directly (no npm/shell wrapper: cleaner process tree + no EINVAL on Windows)
  const viteBin = join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js')
  const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(WEB_PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  })
  let viteLog = ''
  vite.stdout.on('data', (d) => {
    viteLog += d.toString()
  })
  vite.stderr.on('data', (d) => {
    viteLog += d.toString()
  })

  const url = `http://127.0.0.1:${WEB_PORT}/`
  const profile = join(process.env.TEMP ?? '/tmp', `auraos-web-smoke-${process.pid}`)
  let chromeProc
  try {
    await waitForServer(url, BOOT_TIMEOUT)
    chromeProc = spawn(
      chrome,
      [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        // synthetic (untrusted) CDP clicks must still be allowed to start audio
        // and video playback — see the Music/Videos smoke checks
        '--autoplay-policy=no-user-gesture-required',
        '--window-size=1440,900',
        url,
      ],
      { stdio: 'ignore' },
    )

    const cdp = await connect(PORT, { timeout: BOOT_TIMEOUT, urlFilter: `:${WEB_PORT}` })
    console.log('checks:')
    const reporter = new Reporter()
    await runCoreChecks(cdp, reporter)
    reporter.summary()
    cdp.ws.close()
  } finally {
    chromeProc?.kill()
    vite.kill()
    await delay(400)
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      /* profile may still be locked on Windows */
    }
  }
}

main().catch((error) => {
  console.error(`\nweb smoke test failed to run: ${error.message}\n`)
  process.exitCode = 1
})
