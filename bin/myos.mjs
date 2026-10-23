#!/usr/bin/env node
/**
 * JohnLC AuraOS command line launcher.
 *
 * Installed as the `myos` and `start-os` binaries by the installer (`npm link`).
 * Every subcommand is a thin, dependency-free wrapper around npm scripts and the
 * local Electron / Vite binaries, so it also works straight from the repo with
 * `node bin/myos.mjs`.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const c = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
}

const out = (msg = '') => process.stdout.write(`${msg}\n`)
const VERSION = (() => {
  try {
    return require(path.join(ROOT, 'package.json')).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

function banner() {
  out(`${c.cyan}${c.bold}JohnLC AuraOS${c.reset} ${c.dim}v${VERSION}${c.reset}`)
}

function usage() {
  banner()
  out('')
  out(`  ${c.bold}Usage${c.reset}  myos <command> [options]`)
  out('')
  out(`  ${c.cyan}launch${c.reset}        Build if needed, then open the JohnLC AuraOS desktop (Electron)`)
  out(`  ${c.cyan}dev${c.reset}           Hot-reloading dev mode (Vite + Electron)`)
  out(`  ${c.cyan}web${c.reset}           Browser-only preview (no Electron required)`)
  out(`  ${c.cyan}build${c.reset}         Typecheck and produce a production build`)
  out(`  ${c.cyan}typecheck${c.reset}     Run the TypeScript checks only`)
  out(`  ${c.cyan}doctor${c.reset}        Diagnose the environment and installation`)
  out(`  ${c.cyan}reset${c.reset}         Delete build output and the saved JohnLC AuraOS config${c.dim} (--force)${c.reset}`)
  out(`  ${c.cyan}help${c.reset}          Show this help`)
  out(`  ${c.cyan}version${c.reset}       Print the JohnLC AuraOS version`)
  out('')
}

function npmRun(script, extra = []) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npm, ['run', script, ...extra], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
  return result.status ?? 1
}

function requireDeps() {
  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    out(`${c.yellow}Dependencies are not installed.${c.reset} Run: ${c.bold}npm install${c.reset}`)
    out(`${c.dim}(or run the installer: node installer/setup.mjs)${c.reset}`)
    return false
  }
  return true
}

function electronBinary() {
  try {
    const value = require('electron')
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

function configDir() {
  // Must match Electron's `app.getPath('userData')`, which derives from productName.
  const home = os.homedir()
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'JohnLC AuraOS')
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'JohnLC AuraOS')
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'JohnLC AuraOS')
}

function launch() {
  if (!requireDeps()) process.exit(1)
  const dist = path.join(ROOT, 'dist', 'index.html')
  const main = path.join(ROOT, 'dist-electron', 'electron', 'main.js')
  if (!existsSync(dist) || !existsSync(main)) {
    out(`${c.cyan}▸${c.reset} No production build found — building first…`)
    const code = npmRun('build')
    if (code !== 0) process.exit(code)
  }
  const electron = electronBinary()
  if (!electron) {
    out(`${c.red}Electron is not available.${c.reset} Run ${c.bold}npm install${c.reset} or use ${c.bold}myos web${c.reset}.`)
    process.exit(1)
  }
  out(`${c.green}✓${c.reset} Starting JohnLC AuraOS…`)
  const child = spawn(electron, ['.'], { cwd: ROOT, stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}

function web() {
  if (!requireDeps()) process.exit(1)
  process.exit(npmRun('dev:web'))
}

function reset(force) {
  const targets = ['dist', 'dist-electron']
  if (!force) {
    out(`${c.yellow}This removes:${c.reset}`)
    for (const t of targets) out(`  · ${t}/`)
    out(`  · ${configDir()} ${c.dim}(saved theme + preferences)${c.reset}`)
    out('')
    out(`Re-run with ${c.bold}myos reset --force${c.reset} to confirm.`)
    return 0
  }
  for (const t of targets) {
    const full = path.join(ROOT, t)
    if (existsSync(full)) {
      spawnSync(process.execPath, ['-e', `require('fs').rmSync(${JSON.stringify(full)},{recursive:true,force:true})`], { stdio: 'inherit' })
      out(`${c.green}✓${c.reset} removed ${t}/`)
    }
  }
  const cfg = configDir()
  if (existsSync(cfg)) {
    spawnSync(process.execPath, ['-e', `require('fs').rmSync(${JSON.stringify(cfg)},{recursive:true,force:true})`], { stdio: 'inherit' })
    out(`${c.green}✓${c.reset} removed ${cfg}`)
  }
  out(`${c.green}✓${c.reset} JohnLC AuraOS reset.`)
  return 0
}

const [command = 'help', ...rest] = process.argv.slice(2)

switch (command) {
  case 'launch':
  case 'start':
  case 'run':
    launch()
    break
  case 'dev':
    if (!requireDeps()) process.exit(1)
    process.exit(npmRun('dev'))
    break
  case 'web':
  case 'preview':
    web()
    break
  case 'build':
    process.exit(npmRun('build'))
    break
  case 'typecheck':
  case 'check':
    process.exit(npmRun('typecheck'))
    break
  case 'doctor':
    process.exit(npmRun('doctor'))
    break
  case 'reset':
    process.exit(reset(rest.includes('--force') || rest.includes('-f')))
    break
  case 'version':
  case '--version':
  case '-v':
    out(VERSION)
    break
  case 'help':
  case '--help':
  case '-h':
  default:
    if (command !== 'help' && command !== '--help' && command !== '-h') {
      out(`${c.red}Unknown command: ${command}${c.reset}\n`)
    }
    usage()
    break
}
