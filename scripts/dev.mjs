#!/usr/bin/env node
/**
 * JohnLC AuraOS dev orchestrator (zero external dependencies).
 *
 * 1. bundles the Electron tier with esbuild -> dist-electron/
 * 2. boots the Vite dev server               -> http://localhost:5173
 * 3. waits until the server answers
 * 4. launches Electron pointed at it
 *
 * Both child processes are torn down together, so Ctrl+C never leaves a
 * zombie Vite server behind.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = process.env.AURAOS_DEV_URL ?? 'http://localhost:5173'
const WANT_ELECTRON_WATCH = process.argv.includes('--watch-electron')

const c = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
}

const log = (msg) => process.stdout.write(`${msg}\n`)

function binOf(pkg, relative) {
  const pkgJson = require.resolve(`${pkg}/package.json`)
  return path.join(path.dirname(pkgJson), relative)
}

function runStep(label, command, args) {
  log(`${c.cyan}▸${c.reset} ${label}`)
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: false })
  if (result.status !== 0) {
    log(`${c.red}✖ ${label} failed (exit ${result.status ?? 'signal'})${c.reset}`)
    process.exit(result.status ?? 1)
  }
}

// ---------------------------------------------------------------------------
// 1. Locate the tool binaries (no reliance on PATH / global installs).
// ---------------------------------------------------------------------------
let viteBin
let electronPath
try {
  viteBin = binOf('vite', path.join('bin', 'vite.js'))
  electronPath = require('electron')
} catch (error) {
  log(`${c.red}Missing dev dependencies.${c.reset} Run ${c.bold}npm install${c.reset} first.`)
  log(`${c.dim}${error instanceof Error ? error.message : error}${c.reset}`)
  process.exit(1)
}

if (typeof electronPath !== 'string') {
  log(`${c.red}Electron is not installed correctly.${c.reset} Try: npm install electron --force`)
  process.exit(1)
}

log(`\n${c.bold}JohnLC AuraOS${c.reset} ${c.dim}· dev mode${c.reset}`)

// ---------------------------------------------------------------------------
// 2. Bundle the Electron tier (main + preload). Fast enough to run once.
// ---------------------------------------------------------------------------
const buildElectron = path.join('scripts', 'build-electron.mjs')
if (WANT_ELECTRON_WATCH) {
  log(`${c.cyan}▸${c.reset} Bundling Electron tier ${c.dim}(watch)${c.reset}`)
  spawnSync(process.execPath, [buildElectron], { cwd: ROOT, stdio: 'inherit' })
  spawn(process.execPath, [buildElectron, '--watch'], { cwd: ROOT, stdio: 'inherit' })
} else {
  runStep('Bundling Electron tier', process.execPath, [buildElectron])
}

// ---------------------------------------------------------------------------
// 3. Start Vite.
// ---------------------------------------------------------------------------
log(`${c.cyan}▸${c.reset} Starting Vite dev server ${c.dim}(${DEV_URL})${c.reset}`)
const vite = spawn(process.execPath, [viteBin, '--port', '5173', '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, FORCE_COLOR: '1' },
})

let shuttingDown = false
let electron = null

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of [electron, vite]) {
    if (child && !child.killed) {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
    }
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

vite.on('exit', (code) => {
  if (!shuttingDown) {
    log(`${c.yellow}Vite exited (${code ?? 0}); stopping JohnLC AuraOS.${c.reset}`)
    shutdown(code ?? 0)
  }
})

// ---------------------------------------------------------------------------
// 4. Wait for the dev server, then launch Electron.
// ---------------------------------------------------------------------------
async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (shuttingDown) return false
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1500)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (res.ok || res.status < 500) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

const ready = await waitForServer(DEV_URL)
if (!ready) {
  log(`${c.red}Vite did not become ready at ${DEV_URL}.${c.reset}`)
  shutdown(1)
}

log(`${c.green}✓${c.reset} Dev server ready — launching Electron\n`)
electron = spawn(electronPath, ['.'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: DEV_URL, ELECTRON_ENABLE_LOGGING: '1' },
})

electron.on('exit', (code) => {
  log(`\n${c.dim}Electron closed.${c.reset}`)
  shutdown(code ?? 0)
})
