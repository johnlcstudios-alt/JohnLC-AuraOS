#!/usr/bin/env node
/**
 * Bundles the Electron tier (main + preload) with esbuild.
 *
 * Why bundle instead of plain tsc emit?
 * ─────────────────────────────────────
 * The preload runs inside a *sandboxed* renderer, where `require()` only knows a
 * handful of built-in Electron/Node modules and cannot resolve relative paths like
 * `../shared/channels`. Bundling inlines those imports so the preload is a single,
 * self-contained CommonJS file that loads under `sandbox: true`.
 *
 * `npm run typecheck` still uses tsc for type safety; this only produces the JS.
 */
import { build, context } from 'esbuild'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'dist-electron')
const WATCH = process.argv.includes('--watch')

const targets = [
  { entryPoints: [path.join(ROOT, 'electron/main.ts')], outfile: path.join(OUT, 'electron/main.js') },
  { entryPoints: [path.join(ROOT, 'electron/preload.ts')], outfile: path.join(OUT, 'electron/preload.js') },
]

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20', // Electron 33 ships Node 20
  sourcemap: false,
  // `electron` is provided by the runtime; everything else is bundled.
  external: ['electron'],
  logLevel: 'warning',
  legalComments: 'none',
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(path.join(OUT, 'electron'), { recursive: true })

if (WATCH) {
  const contexts = await Promise.all(targets.map((t) => context({ ...common, ...t })))
  await Promise.all(contexts.map((ctx) => ctx.watch()))
  process.stdout.write('[auraos] watching the Electron tier…\n')
} else {
  await Promise.all(targets.map((t) => build({ ...common, ...t })))
  process.stdout.write('[auraos] Electron tier built -> dist-electron/\n')
}
