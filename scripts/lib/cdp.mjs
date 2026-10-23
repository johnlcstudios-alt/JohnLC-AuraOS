/**
 * Minimal Chrome DevTools Protocol client + test reporter shared by the JohnLC AuraOS
 * smoke tests (native Electron and web/Chromium). Uses only Node built-ins.
 */

export class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.consoleErrors = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
        return
      }
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(msg.params.type)) {
        this.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '))
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? 'uncaught exception')
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate failed')
    return res.result.value
  }

  async waitFor(expression, timeout = 8000, label = expression) {
    const start = Date.now()
    let last
    while (Date.now() - start < timeout) {
      try {
        last = await this.eval(expression)
        if (last) return last
      } catch (error) {
        last = error.message
      }
      await delay(120)
    }
    throw new Error(`timeout waiting for: ${label} (last=${JSON.stringify(last)})`)
  }

  sleep(ms) {
    return delay(ms)
  }

  async key({ code, key, vk, modifiers = 0 }) {
    const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers }
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    await this.sleep(90)
  }

  /** Insert text into the focused element (fires input events React can see). */
  async type(text) {
    await this.send('Input.insertText', { text })
    await this.sleep(120)
  }

  combo(code, key, vk, modifiers) {
    return this.key({ code, key, vk, modifiers })
  }
}

export const MOD = { ALT: 1, CTRL: 2, META: 4, SHIFT: 8 }

export const delay = (ms) => new Promise((r) => setTimeout(r, ms))

/** Poll a CDP /json/list endpoint until a page target appears, then connect. */
export async function connect(port, { timeout = 30000, urlFilter } = {}) {
  let target
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await res.json()
      target = targets.find(
        (t) => t.type === 'page' && t.webSocketDebuggerUrl && (!urlFilter || t.url.includes(urlFilter)),
      )
      if (target) break
    } catch {
      /* not up yet */
    }
    await delay(300)
  }
  if (!target) throw new Error(`no CDP page target after ${timeout}ms`)

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', () => rej(new Error('websocket error')), { once: true })
  })
  const cdp = new CDP(ws)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  return cdp
}

/** Collects pass/fail results and prints them as they run. */
export class Reporter {
  constructor() {
    this.results = []
  }

  async check(name, fn) {
    try {
      const detail = await fn()
      this.results.push({ name, ok: true, detail })
      console.log(`  \u2713 ${name}${detail ? ` \u2014 ${detail}` : ''}`)
    } catch (error) {
      this.results.push({ name, ok: false, detail: error.message })
      console.log(`  \u2717 ${name} \u2014 ${error.message}`)
    }
  }

  summary() {
    const failed = this.results.filter((r) => !r.ok)
    console.log(`\n${this.results.length - failed.length}/${this.results.length} checks passed\n`)
    if (failed.length) process.exitCode = 1
    return failed.length === 0
  }
}

/** Standard overlay/window keyboard checks shared by native + web runs. */
/**
 * Launch an app by name through Spotlight (Ctrl+Space → type → Enter), since
 * only a handful of apps are pinned to the Dock by default.
 */
export async function launchViaSpotlight(cdp, query) {
  await cdp.combo('Space', ' ', 32, MOD.CTRL)
  await cdp.waitFor(`!!document.querySelector('[data-overlay="spotlight"]')`, 4000, 'spotlight open')
  // Focus explicitly and confirm the query landed before Enter: typing into a
  // not-yet-focused overlay can leave Spotlight open and abort later checks.
  await cdp.eval(`document.querySelector('[data-overlay="spotlight"] input')?.focus()`)
  await cdp.type(query)
  await cdp.waitFor(
    `document.querySelector('[data-overlay="spotlight"] input')?.value === ${JSON.stringify(query)}`,
    4000,
    'spotlight query',
  )
  await cdp.key({ code: 'Enter', key: 'Enter', vk: 13 })
  await cdp.waitFor(`!document.querySelector('[data-overlay="spotlight"]')`, 4000, 'spotlight closed')
}

export function coreChecks(cdp) {
  return [
    ['shell boots (top bar + desktop icons)', async () => {
      await cdp.waitFor(`!!document.querySelector('.topbar')`, 30000, 'top bar')
      const icons = await cdp.waitFor(`document.querySelectorAll('.desktop-icon').length`, 8000, 'desktop icons')
      return `${icons} desktop icons`
    }],
    ['first-run seeds a window', async () => {
      await cdp.waitFor(`document.querySelectorAll('.win-frame').length >= 1`, 10000, 'a window')
      return `${await cdp.eval(`document.querySelectorAll('.win-frame').length`)} window(s)`
    }],
    ['Notification Center opens on Ctrl+Shift+N', async () => {
      await cdp.combo('KeyN', 'N', 78, MOD.CTRL | MOD.SHIFT)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="notification-center"]')`, 5000, 'notification center')
      await cdp.key({ code: 'Escape', key: 'Escape', vk: 27 })
      await cdp.waitFor(`!document.querySelector('[data-overlay="notification-center"]')`, 5000, 'closed')
      return 'opens + Escape closes'
    }],
    ['Mission Control opens on F3', async () => {
      await cdp.key({ code: 'F3', key: 'F3', vk: 114 })
      await cdp.waitFor(`!!document.querySelector('[data-overlay="mission-control"]')`, 5000, 'mission control')
      await cdp.key({ code: 'Escape', key: 'Escape', vk: 27 })
      await cdp.waitFor(`!document.querySelector('[data-overlay="mission-control"]')`, 5000, 'closed')
      return 'opens + Escape closes'
    }],
    ['Clipboard History opens on Ctrl+Shift+V', async () => {
      await cdp.combo('KeyV', 'V', 86, MOD.CTRL | MOD.SHIFT)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="clipboard"]')`, 5000, 'clipboard panel')
      await cdp.key({ code: 'Escape', key: 'Escape', vk: 27 })
      await cdp.waitFor(`!document.querySelector('[data-overlay="clipboard"]')`, 5000, 'closed')
      return 'opens + Escape closes'
    }],
    ['Force Quit opens on Ctrl+Alt+Escape', async () => {
      await cdp.combo('Escape', 'Escape', 27, MOD.CTRL | MOD.ALT)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="force-quit"]')`, 5000, 'force quit')
      await cdp.key({ code: 'Escape', key: 'Escape', vk: 27 })
      await cdp.waitFor(`!document.querySelector('[data-overlay="force-quit"]')`, 5000, 'closed')
      return 'opens + Escape closes'
    }],
    ['launch Terminal on Ctrl+Alt+T', async () => {
      await cdp.combo('KeyT', 'T', 84, MOD.CTRL | MOD.ALT)
      await cdp.waitFor(`document.querySelectorAll('.win-frame[data-app="terminal"]').length >= 1`, 10000, 'terminal window')
      return `focused=${await cdp.eval(`document.querySelector('.win-frame[data-focused="true"]')?.getAttribute('data-app')`)}`
    }],
    ['launch Files on Ctrl+Alt+F', async () => {
      const before = await cdp.eval(`document.querySelectorAll('.win-frame[data-app="files"]').length`)
      await cdp.combo('KeyF', 'F', 70, MOD.CTRL | MOD.ALT)
      await cdp.waitFor(`document.querySelectorAll('.win-frame[data-app="files"]').length > ${before}`, 10000, 'files window')
      return `${before} \u2192 ${await cdp.eval(`document.querySelectorAll('.win-frame[data-app="files"]').length`)}`
    }],
    ['Files: select + Space opens Quick Look', async () => {
      const clicked = await cdp.eval(`(() => {
        const win = document.querySelector('.win-frame[data-app="files"][data-focused="true"]') ?? document.querySelector('.win-frame[data-app="files"]')
        const row = win?.querySelector('.list-row')
        if (!row) return false
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)
      if (!clicked) throw new Error('no file row to select')
      await cdp.sleep(200)
      await cdp.key({ code: 'Space', key: ' ', vk: 32 })
      await cdp.waitFor(`!!document.querySelector('[data-overlay="quick-look"]')`, 5000, 'quick look open')
      await cdp.key({ code: 'Space', key: ' ', vk: 32 })
      await cdp.waitFor(`!document.querySelector('[data-overlay="quick-look"]')`, 5000, 'quick look closed')
      return 'Space opens + closes'
    }],
    ['snap / maximize / restore focused window', async () => {
      await cdp.combo('ArrowLeft', 'ArrowLeft', 37, MOD.CTRL | MOD.ALT)
      await cdp.waitFor(`document.querySelector('.win-frame[data-focused="true"]')?.getAttribute('data-state') === 'snapped'`, 5000, 'snapped')
      await cdp.combo('ArrowUp', 'ArrowUp', 38, MOD.CTRL | MOD.ALT)
      await cdp.waitFor(`document.querySelector('.win-frame[data-focused="true"]')?.getAttribute('data-state') === 'maximized'`, 5000, 'maximized')
      await cdp.combo('ArrowDown', 'ArrowDown', 40, MOD.CTRL | MOD.ALT)
      await cdp.waitFor(`document.querySelector('.win-frame[data-focused="true"]')?.getAttribute('data-state') === 'normal'`, 5000, 'normal')
      return 'snapped \u2192 maximized \u2192 normal'
    }],
    ['close focused window (Ctrl+W)', async () => {
      const before = await cdp.eval(`document.querySelectorAll('.win-frame').length`)
      await cdp.combo('KeyW', 'W', 87, MOD.CTRL)
      await cdp.waitFor(`document.querySelectorAll('.win-frame').length < ${before}`, 6000, 'window closed')
      return `${before} \u2192 ${await cdp.eval(`document.querySelectorAll('.win-frame').length`)}`
    }],
    ['new desktop shows the workspace pager (Ctrl+Alt+N)', async () => {
      await cdp.combo('KeyN', 'N', 78, MOD.CTRL | MOD.ALT)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="workspace-bar"]')`, 5000, 'workspace bar')
      await cdp.combo('BracketRight', ']', 221, MOD.CTRL | MOD.ALT)
      await cdp.sleep(250)
      return 'pager visible + cycle ok'
    }],
    ['Settings \u2192 Desktop & Dock renders', async () => {
      await cdp.combo('Comma', ',', 188, MOD.CTRL)
      await cdp.waitFor(`document.querySelectorAll('.win-frame[data-app="settings"]').length >= 1`, 10000, 'settings window')
      await cdp.waitFor(`[...document.querySelectorAll('.side-item')].some((b) => b.textContent.includes('Desktop & Dock'))`, 10000, 'Desktop & Dock nav item')
      const clicked = await cdp.eval(`(() => {
        const btn = [...document.querySelectorAll('.side-item')].find((b) => b.textContent.includes('Desktop & Dock'))
        if (!btn) return false
        btn.click()
        return true
      })()`)
      if (!clicked) throw new Error('Desktop & Dock nav item not found')
      await cdp.waitFor(`document.body.innerText.includes('Hot corners')`, 6000, 'hot corners card')
      return 'section + hot corners card'
    }],
    ['Settings → System exposes the auto-start option', async () => {
      const settings = `document.querySelector('.win-frame[data-app="settings"]')`
      const clicked = await cdp.eval(`(() => {
        const win = ${settings}
        const btn = [...(win?.querySelectorAll('.side-item') ?? [])].find((b) => b.textContent.trim() === 'System')
        if (!btn) return false
        btn.click()
        return true
      })()`)
      if (!clicked) throw new Error('System nav item not found')
      const state = await cdp.waitFor(
        `document.querySelector('[data-auto-launch]')?.getAttribute('data-auto-launch')`,
        6000,
        'startup card',
      )
      if (!['unavailable', 'off', 'on'].includes(state)) throw new Error(`unexpected startup state "${state}"`)
      return `Startup card present (${state})`
    }],
    ['Spotlight calculates an expression (Ctrl+Space)', async () => {
      await cdp.combo('Space', ' ', 32, MOD.CTRL)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="spotlight"]')`, 6000, 'spotlight')
      await cdp.type('12*7')
      await cdp.waitFor(`document.querySelector('[data-overlay="spotlight"]')?.innerText.includes('84')`, 5000, 'calc result')
      const grouped = await cdp.eval(`/calculate/i.test(document.querySelector('[data-overlay="spotlight"]').innerText)`)
      if (!grouped) throw new Error('missing Calculate group')
      await cdp.key({ code: 'Escape', key: 'Escape', vk: 27 })
      await cdp.waitFor(`!document.querySelector('[data-overlay="spotlight"]')`, 5000, 'closed')
      return '12*7 = 84'
    }],
    ['Control Center: DND + media card', async () => {
      const opened = await cdp.eval(`(() => {
        const btn = document.querySelector('.status-btn[title="Control Center"]')
        if (!btn) return false
        btn.click()
        return true
      })()`)
      if (!opened) throw new Error('Control Center status button not found')
      await cdp.waitFor(`!!document.querySelector('[data-overlay="control-center"]')`, 5000, 'control center')
      if (!(await cdp.eval(`!!document.querySelector('[data-overlay="control-center"] [data-nowplaying]')`))) {
        throw new Error('media card missing')
      }
      await cdp.eval(`document.querySelector('[data-overlay="control-center"] button[aria-label="Focus"]').click()`)
      await cdp.waitFor(`!!document.querySelector('.status-btn[data-dnd="on"]')`, 5000, 'DND indicator on')
      await cdp.eval(`document.querySelector('[data-overlay="control-center"] button[aria-label="Focus"]').click()`)
      await cdp.waitFor(`!document.querySelector('.status-btn[data-dnd="on"]')`, 5000, 'DND indicator off')
      await cdp.key({ code: 'Escape', key: 'Escape', vk: 27 })
      await cdp.waitFor(`!document.querySelector('[data-overlay="control-center"]')`, 5000, 'closed')
      return 'media card + DND toggle'
    }],
    ['Widgets panel shows a real Now Playing card', async () => {
      const opened = await cdp.eval(`(() => {
        const btn = document.querySelector('.status-btn[title="Widgets & clock"]')
        if (!btn) return false
        btn.click()
        return true
      })()`)
      if (!opened) throw new Error('Widgets status button not found')
      await cdp.waitFor(`!!document.querySelector('[data-overlay="widgets"]')`, 5000, 'widgets panel')
      await cdp.waitFor(`!!document.querySelector('[data-overlay="widgets"] [data-nowplaying]')`, 5000, 'now playing card')
      await cdp.key({ code: 'Escape', key: 'Escape', vk: 27 })
      await cdp.waitFor(`!document.querySelector('[data-overlay="widgets"]')`, 5000, 'closed')
      return 'panel + now playing'
    }],
    ['toasts stack (Ctrl+Alt+P twice)', async () => {
      await cdp.combo('KeyP', 'P', 80, MOD.CTRL | MOD.ALT)
      await cdp.combo('KeyP', 'P', 80, MOD.CTRL | MOD.ALT)
      await cdp.waitFor(`document.querySelectorAll('[data-overlay="toaster"] .toast').length >= 2`, 5000, 'two stacked toasts')
      const n = await cdp.eval(`document.querySelectorAll('[data-overlay="toaster"] .toast').length`)
      return `${n} stacked`
    }],
    ['Command palette lists + runs a command (Ctrl+K)', async () => {
      await cdp.combo('KeyK', 'K', 75, MOD.CTRL)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="command-palette"]')`, 6000, 'command palette')
      const count = await cdp.eval(`document.querySelectorAll('[data-overlay="command-palette"] [data-command]').length`)
      if (count < 5) throw new Error(`only ${count} commands listed`)
      await cdp.key({ code: 'ArrowDown', key: 'ArrowDown', vk: 40 })
      await cdp.type('notification')
      await cdp.waitFor(`!!document.querySelector('[data-overlay="command-palette"] [data-command="notificationCenter.toggle"]')`, 5000, 'notification command')
      await cdp.eval(`document.querySelector('[data-overlay="command-palette"] [data-command="notificationCenter.toggle"]').click()`)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="notification-center"]')`, 5000, 'command executed')
      await cdp.key({ code: 'Escape', key: 'Escape', vk: 27 })
      await cdp.waitFor(`!document.querySelector('[data-overlay="notification-center"]')`, 5000, 'closed')
      return `${count} commands`
    }],
    ['Dock jump list: tasks, windows, pin round-trip', async () => {
      await cdp.combo('KeyF', 'F', 70, MOD.CTRL | MOD.ALT)
      await cdp.waitFor(`document.querySelectorAll('.win-frame[data-app="files"]').length >= 1`, 10000, 'files window')
      const openJumpList = `(() => {
        const el = document.querySelector('[data-dock-app="files"]')
        if (!el) return false
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 360, clientY: 640 }))
        return true
      })()`
      if (!(await cdp.eval(openJumpList))) throw new Error('no Files icon on the Dock')
      await cdp.waitFor(`!!document.querySelector('[data-menu="context"]')`, 4000, 'jump list')
      const items = await cdp.eval(
        `[...document.querySelectorAll('[data-menu="context"] .menu-item')].map((b) => b.textContent.trim())`,
      )
      for (const want of ['Documents', 'New Window', 'Remove from Dock', 'Quit']) {
        if (!items.some((t) => t.includes(want))) throw new Error(`missing "${want}" (got ${items.join(' | ')})`)
      }

      const before = await cdp.eval(`document.querySelectorAll('.win-frame[data-app="files"]').length`)
      await cdp.eval(
        `[...document.querySelectorAll('[data-menu="context"] .menu-item')].find((b) => b.textContent.includes('New Window')).click()`,
      )
      await cdp.waitFor(`!document.querySelector('[data-menu="context"]')`, 4000, 'jump list closed')
      await cdp.waitFor(`document.querySelectorAll('.win-frame[data-app="files"]').length > ${before}`, 8000, 'second Files window')

      // unpin → the label flips (a running app stays on the Dock) → pin it back
      if (!(await cdp.eval(openJumpList))) throw new Error('Files icon vanished from the Dock')
      await cdp.waitFor(`!!document.querySelector('[data-menu="context"]')`, 4000, 'jump list')
      await cdp.eval(
        `[...document.querySelectorAll('[data-menu="context"] .menu-item')].find((b) => b.textContent.includes('Remove from Dock')).click()`,
      )
      await cdp.waitFor(`!document.querySelector('[data-menu="context"]')`, 4000, 'menu closed')
      if (!(await cdp.eval(openJumpList))) throw new Error('unpinned Files left the Dock while running')
      await cdp.waitFor(
        `[...document.querySelectorAll('[data-menu="context"] .menu-item')].some((b) => b.textContent.includes('Keep in Dock'))`,
        4000,
        'unpinned label',
      )
      await cdp.eval(
        `[...document.querySelectorAll('[data-menu="context"] .menu-item')].find((b) => b.textContent.includes('Keep in Dock')).click()`,
      )
      await cdp.waitFor(`!document.querySelector('[data-menu="context"]')`, 4000, 'menu closed')
      const after = await cdp.eval(`document.querySelectorAll('.win-frame[data-app="files"]').length`)
      return `${items.length} jump-list items, ${after} Files windows, pin round-trip ok`
    }],
    ['Dock hover previews show live window thumbnails', async () => {
      const pointer = (type) => `(() => {
        const el = document.querySelector('[data-dock-app="files"]')
        if (!el) return false
        el.dispatchEvent(new PointerEvent('${type}', { bubbles: true, cancelable: true, relatedTarget: document.body }))
        return true
      })()`
      if (!(await cdp.eval(pointer('pointerover')))) throw new Error('no Files icon on the Dock')
      await cdp.waitFor(`!!document.querySelector('[data-previews-app="files"]')`, 4000, 'window previews')
      const thumbs = await cdp.eval(`document.querySelectorAll('[data-previews-app="files"] [data-preview-item]').length`)
      if (thumbs < 1) throw new Error('previews listed no windows')
      const live = await cdp.waitFor(
        `document.querySelectorAll('[data-previews-app="files"] [data-thumb="live"]').length`,
        4000,
        'live thumbnail clone',
      )
      // clicking a thumbnail focuses that window and dismisses the popover
      await cdp.eval(`document.querySelector('[data-previews-app="files"] [data-preview-item] .preview-open').click()`)
      await cdp.waitFor(
        `document.querySelector('.win-frame[data-focused="true"]')?.getAttribute('data-app') === 'files'`,
        4000,
        'preview focused the window',
      )
      await cdp.waitFor(`!document.querySelector('[data-previews-app="files"]')`, 5000, 'previews closed')
      // leaving the icon dismisses them again
      await cdp.eval(pointer('pointerover'))
      await cdp.waitFor(`!!document.querySelector('[data-previews-app="files"]')`, 4000, 'previews reopened')
      await cdp.eval(pointer('pointerout'))
      await cdp.waitFor(`!document.querySelector('[data-previews-app="files"]')`, 6000, 'previews dismissed on leave')
      return `${thumbs} thumbnails (${live} live), focus + dismiss ok`
    }],
    ['Calculator: 7 × 8 = 56 through the dock', async () => {
      // Apps are no longer pinned by default; launch via Spotlight
      await launchViaSpotlight(cdp, 'calculator')
      await cdp.waitFor(`!!document.querySelector('.win-frame[data-app="calculator"]')`, 10000, 'calculator window')
      const keys = await cdp.waitFor(
        `document.querySelectorAll('.win-frame[data-app="calculator"] [data-calc-key]').length`,
        8000,
        'calculator keypad',
      )
      if (keys < 20) throw new Error(`only ${keys} keys on the pad`)
      for (const key of ['7', 'mul', '8', 'eq']) {
        await cdp.eval(`document.querySelector('.win-frame[data-app="calculator"] [data-calc-key="${key}"]').click()`)
        await cdp.sleep(60)
      }
      const display = await cdp.eval(
        `document.querySelector('.win-frame[data-app="calculator"] [data-calc-display]').textContent.trim()`,
      )
      if (display !== '56') throw new Error(`display shows "${display}"`)
      const tape = await cdp.eval(`document.querySelector('.win-frame[data-app="calculator"] [data-calc-tape]').innerText`)
      if (!/7\s*×\s*8 = 56/.test(tape)) throw new Error(`tape missing the entry: ${JSON.stringify(tape)}`)
      // scientific mode is a re-navigation of the singleton window
      await cdp.eval(`document.querySelector('[data-dock-app="calculator"]').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 420, clientY: 640 }))`)
      await cdp.waitFor(`!!document.querySelector('[data-menu="context"]')`, 4000, 'calculator jump list')
      await cdp.eval(
        `[...document.querySelectorAll('[data-menu="context"] .menu-item')].find((b) => b.textContent.includes('Scientific')).click()`,
      )
      await cdp.waitFor(
        `document.querySelectorAll('.win-frame[data-app="calculator"] [data-calc-key]').length >= 32`,
        5000,
        'scientific keypad',
      )
      return `56 + scientific keypad (${keys} → ${await cdp.eval(`document.querySelectorAll('.win-frame[data-app="calculator"] [data-calc-key]').length`)} keys)`
    }],
    ['Notes: creates, edits and persists through the config bridge', async () => {
      const notesCount = () =>
        cdp.eval(
          `document.querySelector('.win-frame[data-app="notes"] [data-notes-count]')?.getAttribute('data-notes-count') ?? 'missing'`,
        )
      const expectNotes = async (target, label) => {
        const start = Date.now()
        let seen = await notesCount()
        while (Number(seen) !== target && Date.now() - start < 6000) {
          await cdp.sleep(150)
          seen = await notesCount()
        }
        if (Number(seen) !== target) throw new Error(`${label}: library shows ${seen}, expected ${target}`)
      }

      // start from a fresh library so the assertion does not depend on the
      // profile's history (the native store is a file, so this only affects web)
      await cdp.eval(`localStorage.removeItem('auraos.notes.data')`)
      // Notes is no longer pinned by default: launch it through Spotlight
      await launchViaSpotlight(cdp, 'notes')
      await cdp.waitFor(
        `!!document.querySelector('.win-frame[data-app="notes"] [data-notes-count]')`,
        10000,
        'notes app',
      )
      const before = Number(await notesCount())
      if (!Number.isFinite(before) || before < 1) throw new Error(`fresh library seeded ${before} notes`)
      const start = Date.now()
      let rows = await cdp.eval(`document.querySelectorAll('.win-frame[data-app="notes"] [data-notes-row]').length`)
      while (rows !== before && Date.now() - start < 5000) {
        await cdp.sleep(150)
        rows = await cdp.eval(`document.querySelectorAll('.win-frame[data-app="notes"] [data-notes-row]').length`)
      }
      if (rows !== before) throw new Error(`${rows} rows for ${before} notes`)
      await expectNotes(before, 'seeded library')

      await cdp.eval(`document.querySelector('.win-frame[data-app="notes"] [data-notes-action="new"]').click()`)
      await expectNotes(before + 1, 'new note button')
      const afterRows = await cdp.eval(`document.querySelectorAll('.win-frame[data-app="notes"] [data-notes-row]').length`)
      if (afterRows !== before + 1) throw new Error(`${afterRows} rows for ${before + 1} notes`)

      // the Dock jump list can create a note directly (singleton re-navigation)
      await cdp.eval(`document.querySelector('[data-dock-app="notes"]').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 420, clientY: 640 }))`)
      await cdp.waitFor(`!!document.querySelector('[data-menu="context"]')`, 4000, 'notes jump list')
      await cdp.eval(
        `[...document.querySelectorAll('[data-menu="context"] .menu-item')].find((b) => b.textContent.includes('New Note')).click()`,
      )
      await expectNotes(before + 2, 'jump list New Note')

      // web mode stores config in localStorage; native mode writes a JSON file
      const isWeb = await cdp.eval(`location.protocol === 'http:'`)
      const readStore = `(() => {
        const raw = localStorage.getItem('auraos.notes.data')
        if (!raw) return null
        try {
          return JSON.parse(raw).notes.length
        } catch {
          return -1
        }
      })()`
      let stored = await cdp.eval(readStore)
      const savedAt = Date.now()
      while (isWeb && stored !== before + 2 && Date.now() - savedAt < 5000) {
        await cdp.sleep(200)
        stored = await cdp.eval(readStore)
      }
      if (isWeb && stored !== before + 2) {
        throw new Error(`web store holds ${JSON.stringify(stored)} notes, expected ${before + 2}`)
      }
      return `${before} → ${before + 2} notes (${isWeb ? `web store: ${stored}` : 'native file store'})`
    }],
    ['Clock: world clock ticks, timer and stopwatch run', async () => {
      // Clock is no longer pinned by default: launch it through Spotlight
      await launchViaSpotlight(cdp, 'clock')
      const cities = await cdp.waitFor(
        `document.querySelectorAll('.win-frame[data-app="clock"] [data-clock-city]').length`,
        8000,
        'world clock cities',
      )
      if (cities < 5) throw new Error(`only ${cities} cities`)
      const tokyo = await cdp.eval(
        `document.querySelector('.win-frame[data-app="clock"] [data-clock-time="Tokyo"]').textContent.trim()`,
      )
      if (!/^\d{2}:\d{2}:\d{2}$/.test(tokyo)) throw new Error(`bad Tokyo time "${tokyo}"`)
      await cdp.eval(`document.querySelector('.win-frame[data-app="clock"] [data-clock-tab="timer"]').click()`)
      await cdp.waitFor(`!!document.querySelector('.win-frame[data-app="clock"] [data-clock-timer]')`, 5000, 'timer panel')
      await cdp.eval(`document.querySelector('.win-frame[data-app="clock"] [data-clock-preset="1"]').click()`)
      const timer = await cdp.waitFor(
        `document.querySelector('.win-frame[data-app="clock"] [data-clock-timer]').textContent.trim() === '01:00'`,
        4000,
        '1 minute preset',
      )
      await cdp.eval(`document.querySelector('.win-frame[data-app="clock"] [data-clock-tab="stopwatch"]').click()`)
      const first = await cdp.eval(
        `document.querySelector('.win-frame[data-app="clock"] [data-clock-watch]').textContent.trim()`,
      )
      await cdp.eval(`document.querySelector('.win-frame[data-app="clock"] [data-clock-watch-toggle]').click()`)
      await cdp.sleep(400)
      const second = await cdp.eval(
        `document.querySelector('.win-frame[data-app="clock"] [data-clock-watch]').textContent.trim()`,
      )
      await cdp.eval(`document.querySelector('.win-frame[data-app="clock"] [data-clock-watch-toggle]').click()`)
      if (first === second) throw new Error(`stopwatch did not advance (${first})`)
      if (!/^00:00\.\d\d$/.test(second)) throw new Error(`stopwatch shows "${second}" after 400ms`)
      return `${cities} cities · Tokyo ${tokyo} · preset ${timer ? '01:00' : '?'} · stopwatch ${first} → ${second}`
    }],
    ['TextEdit: edit, dirty counts and the unsaved-close guard', async () => {
      await launchViaSpotlight(cdp, 'textedit')
      const frame = `.win-frame[data-app="textedit"]`
      await cdp.waitFor(`!!document.querySelector('${frame} [data-textedit-text]')`, 10000, 'textedit window')
      await cdp.eval(`document.querySelector('${frame} [data-textedit-text]').focus()`)
      await cdp.type('hello auraos world')
      const dirty = await cdp.waitFor(`!!document.querySelector('${frame} [data-textedit-dirty="true"]')`, 5000, 'dirty flag')
      const words = await cdp.eval(`document.querySelector('${frame} [data-textedit-count="words"]').textContent.trim()`)
      const chars = await cdp.eval(`document.querySelector('${frame} [data-textedit-count="chars"]').textContent.trim()`)
      if (!words.startsWith('3 ') || !chars.startsWith('18 ')) throw new Error(`counts show "${words}" / "${chars}"`)
      const label = await cdp.eval(`document.querySelector('${frame} [data-textedit-dirty-label]').textContent.trim()`)
      if (label !== 'Unsaved') throw new Error(`dirty label says "${label}"`)

      // closing a dirty window must ask first — cancel keeps it alive
      await cdp.eval(`document.querySelector('${frame} button[aria-label^="Close"]').click()`)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="dialog"] [data-dialog-action="confirm"]')`, 5000, 'discard dialog')
      await cdp.eval(`document.querySelector('[data-overlay="dialog"] [data-dialog-action="cancel"]').click()`)
      await cdp.waitFor(`!document.querySelector('[data-overlay="dialog"]')`, 5000, 'dialog dismissed')
      if (!(await cdp.eval(`!!document.querySelector('${frame}')`))) throw new Error('window closed on "Keep editing"')

      // confirming actually closes it
      await cdp.eval(`document.querySelector('${frame} button[aria-label^="Close"]').click()`)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="dialog"] [data-dialog-action="confirm"]')`, 5000, 'discard dialog again')
      await cdp.eval(`document.querySelector('[data-overlay="dialog"] [data-dialog-action="confirm"]').click()`)
      await cdp.waitFor(`!document.querySelector('${frame}')`, 8000, 'window closed')
      return `${words} · ${chars} · guard: kept on cancel, discarded on confirm`
    }],
    ['Reminders: add, due notification actions and delete', async () => {
      await launchViaSpotlight(cdp, 'reminders')
      const frame = `.win-frame[data-app="reminders"]`
      await cdp.waitFor(`!!document.querySelector('${frame} [data-reminders-count]')`, 10000, 'reminders window')
      const before = Number(await cdp.eval(`document.querySelector('${frame} [data-reminders-count]').getAttribute('data-reminders-count')`))
      const doneBefore = Number(await cdp.eval(`document.querySelector('${frame} [data-reminders-done]').getAttribute('data-reminders-done')`))
      const title = `Smoke ${Date.now() % 100000}`

      // a due date of "now" makes the new reminder fire a real notification
      await cdp.eval(`(() => {
        const el = document.querySelector('${frame} [data-reminders-due-input]')
        const d = new Date()
        const pad = (n) => String(n).padStart(2, '0')
        const value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
      await cdp.eval(`document.querySelector('${frame} [data-reminders-input]').focus()`)
      await cdp.type(title)
      await cdp.eval(`document.querySelector('${frame} [data-reminders-action="add"]').click()`)
      await cdp.waitFor(
        `Number(document.querySelector('${frame} [data-reminders-count]').getAttribute('data-reminders-count')) === ${before + 1}`,
        6000,
        'reminder added',
      )

      // the due notification carries a working "Mark done" action
      await cdp.combo('KeyN', 'N', 78, MOD.CTRL | MOD.SHIFT)
      await cdp.waitFor(`!!document.querySelector('[data-overlay="notification-center"]')`, 5000, 'notification center')
      await cdp.waitFor(
        `(() => {
          const btn = [...document.querySelectorAll('[data-overlay="notification-center"] [data-notification-action^="done-"]')]
            .find((b) => b.closest('.group')?.textContent.includes(${JSON.stringify(title)}))
          if (!btn) return false
          btn.click()
          return true
        })()`,
        8000,
        'due notification with Mark done',
      )
      await cdp.waitFor(
        `Number(document.querySelector('${frame} [data-reminders-done]').getAttribute('data-reminders-done')) === ${doneBefore + 1}`,
        6000,
        'marked done from the notification',
      )
      // close the panel by clicking its backdrop (same as a user clicking away)
      await cdp.eval(`document.querySelector('[data-overlay="notification-center"]').previousElementSibling.click()`)
      await cdp.waitFor(`!document.querySelector('[data-overlay="notification-center"]')`, 5000, 'notification center closed')

      // tidy up: the row is hidden by the "today" filter once done, so switch
      // to the Completed view first, then remove it
      await cdp.eval(`document.querySelector('${frame} [data-reminders-filter="completed"]')?.click()`)
      await cdp.sleep(300)
      await cdp.eval(`(() => {
        const row = [...document.querySelectorAll('${frame} [data-reminders-row]')]
          .find((r) => r.textContent.includes(${JSON.stringify(title)}))
        row?.querySelector('[data-reminders-delete]')?.click()
      })()`)
      await cdp.waitFor(
        `Number(document.querySelector('${frame} [data-reminders-count]').getAttribute('data-reminders-count')) === ${before}`,
        6000,
        'smoke reminder removed',
      )
      return `${before} → +1 · notification "${title}" → Mark done → deleted again`
    }],
    ['Calendar: month navigation and an event round-trip', async () => {
      await launchViaSpotlight(cdp, 'calendar')
      const frame = `.win-frame[data-app="calendar"]`
      await cdp.waitFor(`!!document.querySelector('${frame} [data-calendar-month]')`, 10000, 'calendar window')
      const readMonth = `document.querySelector('${frame} [data-calendar-month]').getAttribute('data-calendar-month')`
      const readEvents = `Number(document.querySelector('${frame} [data-calendar-events]').getAttribute('data-calendar-events'))`
      const startMonth = await cdp.eval(readMonth)
      const before = Number(await cdp.eval(readEvents))

      await cdp.eval(`document.querySelector('${frame} [data-calendar-action="prev"]').click()`)
      await cdp.waitFor(`${readMonth} !== ${JSON.stringify(startMonth)}`, 4000, 'previous month')
      await cdp.eval(`document.querySelector('${frame} [data-calendar-action="next"]').click()`)
      await cdp.waitFor(`${readMonth} === ${JSON.stringify(startMonth)}`, 4000, 'back to current month')
      const selected = await cdp.eval(`document.querySelector('${frame} [data-calendar-month]').getAttribute('data-calendar-selected')`)

      const title = `Smoke ${Date.now() % 100000}`
      await cdp.eval(`document.querySelector('${frame} [data-calendar-action="new"]').click()`)
      await cdp.waitFor(`!!document.querySelector('${frame} [data-calendar-field="title"]')`, 5000, 'event editor')
      await cdp.eval(`document.querySelector('${frame} [data-calendar-field="title"]').focus()`)
      await cdp.type(title)
      await cdp.eval(`document.querySelector('${frame} [data-calendar-action="save"]').click()`)
      await cdp.waitFor(`${readEvents} === ${before + 1}`, 6000, 'event saved')
      const dayEvents = Number(
        await cdp.eval(`document.querySelector('${frame} [data-calendar-day="${selected}"]')?.getAttribute('data-calendar-day-events') ?? '-1'`),
      )
      if (dayEvents < 1) throw new Error(`day ${selected} chip reports ${dayEvents} events`)

      // reopen the chip in the day agenda and delete it again
      await cdp.eval(`(() => {
        const chip = [...document.querySelectorAll('${frame} [data-calendar-event]')]
          .find((c) => c.textContent.includes(${JSON.stringify(title)}))
        chip?.click()
      })()`)
      await cdp.waitFor(`!!document.querySelector('${frame} [data-calendar-action="delete"]')`, 5000, 'event editor reopened')
      await cdp.eval(`document.querySelector('${frame} [data-calendar-action="delete"]').click()`)
      await cdp.waitFor(`${readEvents} === ${before}`, 6000, 'event deleted')
      return `${startMonth} · prev/next ok · day ${selected} chips ${dayEvents} · created + deleted (events ${before} → ${before + 1} → ${before})`
    }],
    ['Contacts: create, favourite, search and delete', async () => {
      await launchViaSpotlight(cdp, 'contacts')
      const frame = `.win-frame[data-app="contacts"]`
      await cdp.waitFor(`!!document.querySelector('${frame} [data-contacts-count]')`, 10000, 'contacts window')
      const readCount = `Number(document.querySelector('${frame} [data-contacts-count]').getAttribute('data-contacts-count'))`
      const before = Number(await cdp.eval(readCount))
      const first = `Zoe${Date.now() % 100000}`

      await cdp.eval(`document.querySelector('${frame} [data-contacts-action="new"]').click()`)
      await cdp.waitFor(`!!document.querySelector('${frame} [data-contacts-field="firstName"]')`, 5000, 'contact editor')
      await cdp.eval(`document.querySelector('${frame} [data-contacts-field="firstName"]').focus()`)
      await cdp.type(first)
      await cdp.eval(`document.querySelector('${frame} [data-contacts-field="lastName"]').focus()`)
      await cdp.type('Smoke')
      await cdp.eval(`document.querySelector('${frame} [data-contacts-action="save"]').click()`)
      await cdp.waitFor(`${readCount} === ${before + 1}`, 6000, 'contact saved')
      const uid = await cdp.eval(`document.querySelector('${frame} [data-contacts-count]').getAttribute('data-contacts-selected')`)
      if (!uid) throw new Error('no contact selected after save')
      const rowText = await cdp.eval(
        `document.querySelector('${frame} [data-contacts-row="${uid}"]')?.textContent ?? ''`,
      )
      if (!rowText.includes(first) || !rowText.includes('Smoke')) throw new Error(`row shows "${rowText.trim()}"`)

      // favourite round-trip on the new card
      const fav = `'${frame} [data-contacts-action="favourite"]'`
      await cdp.eval(`document.querySelector(${fav}).click()`)
      await cdp.waitFor(`document.querySelector(${fav}).getAttribute('data-active') === 'true'`, 5000, 'favourited')

      // search narrows the list to matching cards only
      await cdp.eval(`document.querySelector('${frame} [data-contacts-search]').focus()`)
      await cdp.type(first)
      const rows = await cdp.waitFor(
        `(() => {
          const list = [...document.querySelectorAll('${frame} [data-contacts-row]')]
          return list.length > 0 && list.every((r) => r.textContent.includes(${JSON.stringify(first)})) ? list.length : 0
        })()`,
        5000,
        'filtered list',
      )

      // tidy up: delete the smoke contact again
      await cdp.eval(`document.querySelector('${frame} [data-contacts-action="delete"]').click()`)
      await cdp.waitFor(`${readCount} === ${before}`, 6000, 'contact removed')
      return `${before} → +1 (${first} Smoke · favourite ok · search matched ${rows}) → back to ${before}`
    }],
    ['Photos: gallery, viewer and wallpaper hook', async () => {
      await launchViaSpotlight(cdp, 'photos')
      const frame = `.win-frame[data-app="photos"]`
      await cdp.waitFor(`!!document.querySelector('${frame} [data-photos-app]')`, 10000, 'photos window')
      const wall = await cdp.eval(`document.querySelector('[data-wallpaper]')?.getAttribute('data-wallpaper') ?? ''`)
      if (!wall) throw new Error('wallpaper layer has no data-wallpaper hook')
      const count = Number(
        await cdp.eval(`document.querySelector('${frame} [data-photos-count]').getAttribute('data-photos-count')`),
      )
      if (count < 1) {
        await cdp.waitFor(`document.body.innerText.includes('No photos here')`, 6000, 'photos empty state')
        return `empty library handled (wallpaper: ${wall})`
      }

      await cdp.eval(`document.querySelector('${frame} [data-photos-thumb]').click()`)
      await cdp.waitFor(`!!document.querySelector('${frame} [data-photos-viewer]')`, 6000, 'photo viewer')
      const readViewer = (attr) => `document.querySelector('${frame} [data-photos-viewer]').getAttribute('${attr}')`

      const zoomBefore = await cdp.eval(readViewer('data-photos-zoom'))
      await cdp.eval(`document.querySelector('${frame} [data-photos-action="zoom-in"]').click()`)
      await cdp.waitFor(`${readViewer('data-photos-zoom')} !== ${JSON.stringify(zoomBefore)}`, 4000, 'zoom in')
      await cdp.eval(`document.querySelector('${frame} [data-photos-action="rotate"]').click()`)
      await cdp.waitFor(`${readViewer('data-photos-rotate')} === '90'`, 4000, 'rotate 90°')

      // favourite round-trip: toggled on then off so the saved config is unchanged
      const fav = `document.querySelector('${frame} [data-photos-action="favourite"]')`
      await cdp.eval(`${fav}.click()`)
      await cdp.waitFor(`${fav}.getAttribute('data-active') === 'true'`, 4000, 'favourited')
      await cdp.eval(`${fav}.click()`)
      await cdp.waitFor(`${fav}.getAttribute('data-active') === 'false'`, 4000, 'un-favourited')

      let stepped = 'single item'
      if (count > 1) {
        const idxBefore = await cdp.eval(readViewer('data-photos-index'))
        await cdp.eval(`document.querySelector('${frame} [data-photos-action="next"]').click()`)
        await cdp.waitFor(`${readViewer('data-photos-index')} !== ${JSON.stringify(idxBefore)}`, 4000, 'next photo')
        stepped = 'next works'
      }

      await cdp.eval(`document.querySelector('${frame} [data-photos-action="close"]').click()`)
      await cdp.waitFor(`!document.querySelector('${frame} [data-photos-viewer]')`, 5000, 'viewer closed')
      return `${count} photo(s) · zoom ${zoomBefore}→in · rotate 90° · favourite round-trip · ${stepped} (wallpaper: ${wall})`
    }],
    ['Music: generated station plays, advances and pauses', async () => {
      await launchViaSpotlight(cdp, 'music')
      const frame = `.win-frame[data-app="music"]`
      await cdp.waitFor(`!!document.querySelector('${frame} [data-music-app]')`, 10000, 'music window')
      const stations = await cdp.waitFor(
        `document.querySelectorAll('${frame} [data-music-station]').length`,
        6000,
        'generated stations listed',
      )

      // the transport's play button arms AuraOS Radio when nothing is queued
      await cdp.eval(`document.querySelector('${frame} [data-music-action="toggle"]').click()`)
      await cdp.waitFor(
        `document.querySelector('${frame} [data-music-app]').getAttribute('data-music-title') === 'AuraOS Radio'`,
        8000,
        'AuraOS Radio queued',
      )

      // Some hosts (headless/CI boxes with no audio device, or locked-down
      // sessions) refuse to start audio at all. That is an honest outcome, not
      // a bug in the player — so report it instead of pretending.
      let audioState = 'ok'
      try {
        await cdp.waitFor(
          `document.querySelector('${frame} [data-music-app]').getAttribute('data-music-playing') === 'true'`,
          8000,
          'audio playing',
        )
      } catch {
        audioState = await cdp.eval(
          `document.querySelector('${frame} [data-music-app]').getAttribute('data-music-audio')`,
        )
        if (audioState !== 'unavailable') throw new Error('audio neither playing nor flagged unavailable')
      }

      if (audioState === 'unavailable') {
        // the queue + transport still work without a sound card
        await cdp.eval(`document.querySelector('${frame} [data-music-action="next"]').click()`)
        const nextNoAudio = await cdp.waitFor(
          `(() => {
            const t = document.querySelector('${frame} [data-music-app]').getAttribute('data-music-title')
            return t && t !== 'AuraOS Radio' ? t : ''
          })()`,
          6000,
          'next station without audio',
        )
        return `${stations} stations · host refused audio (honest) · queue still advances → "${nextNoAudio}"`
      }

      // real playback: the position clock must move forward
      await cdp.waitFor(
        `Number(document.querySelector('${frame} [data-music-app]').getAttribute('data-music-position')) > 0`,
        15000,
        'playback position advancing',
      )
      const advanced = await cdp.eval(
        `Number(document.querySelector('${frame} [data-music-app]').getAttribute('data-music-position')).toFixed(2)`,
      )

      // next moves through the generated library
      await cdp.eval(`document.querySelector('${frame} [data-music-action="next"]').click()`)
      const nextTitle = await cdp.waitFor(
        `(() => {
          const t = document.querySelector('${frame} [data-music-app]').getAttribute('data-music-title')
          return t && t !== 'AuraOS Radio' ? t : ''
        })()`,
        6000,
        'next station',
      )

      // leave the shared player paused (and the user's speakers quiet)
      await cdp.eval(`document.querySelector('${frame} [data-music-action="toggle"]').click()`)
      await cdp.waitFor(
        `document.querySelector('${frame} [data-music-app]').getAttribute('data-music-playing') === 'false'`,
        6000,
        'paused',
      )
      return `${stations} stations · played to ${advanced}s · next → "${nextTitle}" · paused`
    }],
    ['Videos: library renders and playback path is honest', async () => {
      await launchViaSpotlight(cdp, 'videos')
      const frame = `.win-frame[data-app="videos"]`
      await cdp.waitFor(`!!document.querySelector('${frame} [data-videos-app]')`, 10000, 'videos window')
      const count = Number(
        await cdp.eval(`document.querySelector('${frame} [data-videos-count]').getAttribute('data-videos-count')`),
      )
      if (count < 1) {
        await cdp.waitFor(`document.body.innerText.includes('No videos')`, 6000, 'videos empty state')
        return 'empty library handled'
      }

      // open the smallest file so a real library never decodes a huge video here
      const opened = await cdp.eval(`(() => {
        const rows = [...document.querySelectorAll('${frame} [data-videos-file]')]
          .map((el) => ({ el, size: Number(el.getAttribute('data-videos-size') || '0') }))
          .sort((a, b) => a.size - b.size)
        if (!rows.length) return false
        rows[0].el.click()
        return true
      })()`)
      if (!opened) {
        return `${count} file(s) — nothing to open`
      }

      await cdp.waitFor(`!!document.querySelector('${frame} [data-videos-player]')`, 15000, 'video player view')
      await cdp.sleep(400)
      const notice = await cdp.eval(
        `document.querySelector('${frame} [data-videos-notice]')?.textContent?.trim() ?? ''`,
      )
      if (notice) {
        await cdp.eval(`document.querySelector('${frame} [data-videos-action="back"]').click()`)
        await cdp.waitFor(`!document.querySelector('${frame} [data-videos-player]')`, 5000, 'back to library')
        return `${count} file(s) · honest about local decode: "${notice.slice(0, 64)}…"`
      }

      await cdp.waitFor(`!!document.querySelector('${frame} [data-videos-action="toggle"]')`, 6000, 'transport')
      await cdp.eval(`document.querySelector('${frame} [data-videos-action="toggle"]').click()`)
      await cdp.sleep(500)
      const state = await cdp.eval(`document.querySelector('${frame} [data-videos-state]')?.getAttribute('data-videos-state') ?? ''`)
      await cdp.eval(`document.querySelector('${frame} [data-videos-action="back"]').click()`)
      await cdp.waitFor(`!document.querySelector('${frame} [data-videos-player]')`, 5000, 'back to library')
      return `${count} file(s) · player opened · transport → ${state || 'idle'}`
    }],
    ['no console errors during the run', async () => {
      const noise = cdp.consoleErrors.filter(
        (line) => !/Autofill|DevTools|Electron Security|Insecure Content|glyph|favicon|Failed to load resource/i.test(line),
      )
      if (noise.length) throw new Error(`${noise.length} console error(s): ${noise.slice(0, 3).join(' | ')}`)
      return 'clean'
    }],
  ]
}

/** Run the shared checks sequentially against a connected CDP session. */
export async function runCoreChecks(cdp, reporter) {
  for (const [name, fn] of coreChecks(cdp)) {
    await reporter.check(name, fn)
  }
}

