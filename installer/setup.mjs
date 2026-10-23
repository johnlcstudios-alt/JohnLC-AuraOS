#!/usr/bin/env node
/**
 * JohnLC AuraOS bootstrap installer + doctor.
 *
 * Zero dependencies on purpose: it runs with a bare Node install so it works
 * before `npm install` has ever happened.
 *
 *   node installer/setup.mjs                 install, build, link
 *   node installer/setup.mjs --dev           ...then start the dev environment
 *   node installer/setup.mjs --doctor        diagnose the environment only
 *   node installer/setup.mjs --mirror <url>  use an npm registry mirror
 *
 * Flags: --skip-install --skip-build --no-link --yes --dev --mirror <url>
 *        --doctor --help
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IS_WIN = process.platform === 'win32'

const c = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  magenta: '\u001b[35m',
}

const out = (msg = '') => process.stdout.write(`${msg}\n`)
const ok = (msg) => out(`  ${c.green}✓${c.reset} ${msg}`)
const warn = (msg) => out(`  ${c.yellow}!${c.reset} ${msg}`)
const fail = (msg) => out(`  ${c.red}✖${c.reset} ${msg}`)
const info = (msg) => out(`  ${c.dim}·${c.reset} ${msg}`)

const MIN_NODE_MAJOR = 18

function parseArgs(argv) {
  const flags = {
    skipInstall: false,
    skipBuild: false,
    link: true,
    yes: false,
    dev: false,
    doctor: false,
    help: false,
    mirror: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--skip-install':
        flags.skipInstall = true
        break
      case '--skip-build':
        flags.skipBuild = true
        break
      case '--no-link':
      case '--skip-link':
        flags.link = false
        break
      case '--yes':
      case '-y':
        flags.yes = true
        break
      case '--dev':
        flags.dev = true
        break
      case '--doctor':
        flags.doctor = true
        break
      case '--help':
      case '-h':
        flags.help = true
        break
      case '--mirror':
        flags.mirror = argv[i + 1] ?? null
        i += 1
        break
      default:
        if (arg.startsWith('--mirror=')) flags.mirror = arg.slice('--mirror='.length)
        break
    }
  }
  return flags
}

function banner() {
  out('')
  out(`${c.magenta}${c.bold}   ____                   ____  _____${c.reset}`)
  out(`${c.magenta}${c.bold}  / __ \\ _ __   ___  ___ / __ \\/ ___/${c.reset}`)
  out(`${c.magenta}${c.bold} | |  | | '_ \\ / _ \\/ _ \\ |  | \\__ \\${c.reset}`)
  out(`${c.magenta}${c.bold} | |__| | |_) |  __/  __/ |__| |___) |${c.reset}`)
  out(`${c.magenta}${c.bold}  \\____/| .__/ \\___|\\___|\\____/|____/${c.reset}`)
  out(`${c.magenta}${c.bold}        |_|${c.reset}  ${c.dim}hybrid desktop environment · bootstrap${c.reset}`)
  out('')
}

function readVersion(cmd, args = ['--version']) {
  const result = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], shell: IS_WIN })
  if (result.status !== 0 || !result.stdout) return null
  return result.stdout.toString().trim().split('\n')[0]
}

function run(label, command, args = []) {
  const pad = label.padEnd(30)
  process.stdout.write(`  ${c.cyan}▸${c.reset} ${pad}`)
  const started = Date.now()
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: IS_WIN })
  const ms = Date.now() - started
  if (result.status === 0) {
    process.stdout.write(`  ${c.green}done${c.reset} ${c.dim}(${(ms / 1000).toFixed(1)}s)${c.reset}\n`)
    return true
  }
  process.stdout.write(`  ${c.red}failed${c.reset}\n`)
  return false
}

function npmInstall(mirror) {
  const args = ['install']
  if (mirror) args.push('--registry', mirror)
  return run('installing dependencies', 'npm', args)
}

function npmScript(script) {
  return run(script.replace(':', ' '), 'npm', ['run', script])
}

function configDir() {
  // Must match Electron's `app.getPath('userData')`, which derives from productName.
  const home = os.homedir()
  if (IS_WIN) return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'JohnLC AuraOS')
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'JohnLC AuraOS')
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'JohnLC AuraOS')
}

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------
function doctor() {
  out(`${c.bold}JohnLC AuraOS doctor${c.reset}\n`)
  let problems = 0

  const nodeMajor = Number(process.versions.node.split('.')[0])
  if (nodeMajor >= MIN_NODE_MAJOR) ok(`Node ${process.versions.node}`)
  else {
    fail(`Node ${process.versions.node} — JohnLC AuraOS needs >= ${MIN_NODE_MAJOR}`)
    problems += 1
  }

  const npm = readVersion('npm')
  if (npm) ok(`npm ${npm}`)
  else {
    fail('npm not found on PATH')
    problems += 1
  }

  const git = readVersion('git')
  if (git) ok(`git ${git}`)
  else warn('git not found (only needed for cloning / contributing)')

  info(`Platform ${process.platform} ${process.arch} · ${os.cpus().length} cores`)

  const deps = existsSync(path.join(ROOT, 'node_modules'))
  deps ? ok('Dependencies installed') : (fail('node_modules missing — run: npm install'), (problems += 1))

  let electronPath = null
  try {
    const value = require('electron')
    if (typeof value === 'string' && existsSync(value)) {
      electronPath = value
      ok(`Electron binary present`)
    }
  } catch {
    /* handled below */
  }
  if (!electronPath && deps) {
    warn('Electron binary not resolved — try: npm install electron --force')
  }

  const rendererBuilt = existsSync(path.join(ROOT, 'dist', 'index.html'))
  rendererBuilt ? ok('Renderer build (dist/index.html)') : warn('Renderer not built — run: npm run build')

  const electronBuilt = existsSync(path.join(ROOT, 'dist-electron', 'electron', 'main.js'))
  electronBuilt ? ok('Electron build (dist-electron/electron/main.js)') : warn('Electron tier not compiled — run: npm run build')

  const cfg = configDir()
  const cfgFile = path.join(cfg, 'auraos-config.json')
  if (existsSync(cfgFile)) {
    try {
      const parsed = JSON.parse(readFileSync(cfgFile, 'utf8'))
      ok(`Config found (${Object.keys(parsed).length} keys) at ${cfgFile}`)
    } catch {
      warn(`Config file is unreadable: ${cfgFile}`)
    }
  } else {
    info(`No saved config yet (${cfgFile})`)
  }

  out('')
  if (problems === 0) out(`${c.green}Everything looks good.${c.reset} Start with ${c.bold}npm run dev${c.reset} or ${c.bold}myos launch${c.reset}.`)
  else out(`${c.yellow}${problems} issue(s) to resolve.${c.reset}`)
  out('')
  return problems === 0 ? 0 : 1
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const flags = parseArgs(process.argv.slice(2))

  if (flags.help) {
    banner()
    out(`${c.bold}Usage${c.reset}  node installer/setup.mjs [options]\n`)
    out('  --skip-install      do not run npm install')
    out('  --skip-build        do not run the production build')
    out('  --no-link           do not register the myos/start-os CLI')
    out('  --yes               assume yes for any prompts')
    out('  --dev               start dev mode when finished')
    out('  --mirror <url>      npm registry mirror to install from')
    out('  --doctor            diagnose the environment and exit')
    out('  --help              show this message')
    out('')
    return 0
  }

  banner()

  if (flags.doctor) return doctor()

  const nodeMajor = Number(process.versions.node.split('.')[0])
  if (nodeMajor < MIN_NODE_MAJOR) {
    fail(`Node ${process.versions.node} is too old. JohnLC AuraOS requires Node >= ${MIN_NODE_MAJOR}.`)
    return 1
  }
  ok(`Node ${process.versions.node} · npm ${readVersion('npm') ?? 'unknown'}`)
  if (flags.mirror) info(`Using registry mirror: ${flags.mirror}`)
  out('')

  if (!flags.skipInstall) {
    if (!npmInstall(flags.mirror)) {
      fail('Dependency installation failed.')
      return 1
    }
  } else {
    info('Skipping dependency install (--skip-install)')
  }

  if (!flags.skipBuild) {
    out('')
    if (!npmScript('typecheck')) {
      fail('Typecheck failed — the build was not attempted.')
      return 1
    }
    if (!npmScript('build:renderer')) {
      fail('Renderer build failed.')
      return 1
    }
    if (!npmScript('build:electron')) {
      fail('Electron build failed.')
      return 1
    }
  } else {
    info('Skipping build (--skip-build)')
  }

  if (flags.link) {
    out('')
    if (!run('registering myos CLI (npm link)', 'npm', ['link'])) {
      warn('Could not create the global CLI link. You can still run: node bin/myos.mjs')
    }
  } else {
    info('Skipping CLI link (--no-link)')
  }

  out('')
  out(`${c.green}${c.bold}JohnLC AuraOS is ready.${c.reset}`)
  out('')
  out(`  ${c.bold}Start the desktop${c.reset}     ${c.cyan}npm start${c.reset}      ${c.dim}(or: ${c.reset}${c.cyan}myos launch${c.reset}${c.dim})${c.reset}`)
  out(`  ${c.bold}Develop${c.reset}              ${c.cyan}npm run dev${c.reset}  ${c.dim}(hot reload)${c.reset}`)
  out(`  ${c.bold}Browser only${c.reset}         ${c.cyan}npm run dev:web${c.reset}`)
  out(`  ${c.bold}Diagnose${c.reset}             ${c.cyan}npm run doctor${c.reset}`)
  out('')

  if (flags.dev) {
    info('Launching dev mode…')
    out('')
    const result = spawnSync('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'inherit', shell: IS_WIN })
    return result.status ?? 0
  }

  return 0
}

process.exit(main())
