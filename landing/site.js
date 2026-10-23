/**
 * JohnLC AuraOS — landing site interactions.
 * Zero dependencies. All features degrade gracefully without JavaScript.
 */

;(() => {
  'use strict'

  const REPO = 'johnlcstudios-alt/JohnLC-AuraOS'
  const RELEASES_URL = `https://github.com/${REPO}/releases`
  const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`
  const LATEST_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`
  const THEME_KEY = 'auraos-site-theme'
  const RELEASE_CACHE_KEY = 'auraos-latest-release-v1'
  const RELEASE_CACHE_TTL = 5 * 60 * 1000
  const STATUS_FALLBACK = 'GitHub Releases'

  const root = document.documentElement
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ------------------------------------------------------------------------
     Theme
     --------------------------------------------------------------------- */

  function getStoredTheme() {
    try {
      const value = window.localStorage.getItem(THEME_KEY)
      return value === 'light' || value === 'dark' ? value : null
    } catch {
      return null
    }
  }

  function applyTheme(theme, persist) {
    root.dataset.theme = theme

    const themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor) {
      themeColor.setAttribute('content', theme === 'light' ? '#f2f5fb' : '#070911')
    }

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
      button.setAttribute('aria-label', label)
      button.setAttribute('title', label)
    })

    if (persist) {
      try {
        window.localStorage.setItem(THEME_KEY, theme)
      } catch {
        /* Storage can be unavailable in private or restricted contexts. */
      }
    }
  }

  function initTheme() {
    const systemLight =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches

    applyTheme(getStoredTheme() || (systemLight ? 'light' : 'dark'), false)

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light', true)
      })
    })

    if (typeof window.matchMedia !== 'function') return

    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (event) => {
      if (!getStoredTheme()) applyTheme(event.matches ? 'light' : 'dark', false)
    }

    if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange)
    else if (typeof query.addListener === 'function') query.addListener(onChange)
  }

  /* ------------------------------------------------------------------------
     Sticky header
     --------------------------------------------------------------------- */

  function initHeader() {
    const header = document.querySelector('[data-header]')
    if (!header) return

    let frame = 0

    const update = () => {
      frame = 0
      header.classList.toggle('is-scrolled', window.scrollY > 6)
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    update()
  }

  /* ------------------------------------------------------------------------
     Mobile navigation
     --------------------------------------------------------------------- */

  function initNavigation() {
    const toggle = document.querySelector('[data-menu-toggle]')
    const nav = document.getElementById('site-nav')
    if (!toggle || !nav) return

    const setNav = (open) => {
      document.body.classList.toggle('nav-open', open)
      toggle.setAttribute('aria-expanded', String(open))
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
    }

    toggle.addEventListener('click', () => {
      setNav(!document.body.classList.contains('nav-open'))
    })

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setNav(false))
    })

    document.addEventListener('click', (event) => {
      if (!document.body.classList.contains('nav-open')) return
      if (nav.contains(event.target) || toggle.contains(event.target)) return
      setNav(false)
    })

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !document.body.classList.contains('nav-open')) return
      setNav(false)
      toggle.focus()
    })

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) setNav(false)
    })
  }

  /* ------------------------------------------------------------------------
     Copy buttons
     --------------------------------------------------------------------- */

  let toastTimer = 0

  function showToast(message) {
    const toast = document.querySelector('[data-toast]')
    if (!toast) return

    toast.textContent = message
    toast.classList.add('show')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1900)
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        /* Fall through to the selection-based fallback. */
      }
    }

    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.top = '-1000px'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()

    let copied = false
    try {
      copied = document.execCommand('copy')
    } catch {
      copied = false
    }

    field.remove()
    return copied
  }

  function initCopyButtons() {
    document.querySelectorAll('[data-copy-target]').forEach((button) => {
      button.addEventListener('click', async () => {
        const target = document.getElementById(button.dataset.copyTarget || '')
        if (!target) return

        const text = (target.textContent || '').trim()
        if (!text) return

        const copied = await writeClipboard(text)
        if (!copied) {
          showToast('Copy failed — select the text manually')
          return
        }

        const original = button.textContent
        button.textContent = 'Copied'
        showToast('Copied to clipboard')
        window.setTimeout(() => {
          button.textContent = original
        }, 1600)
      })
    })
  }

  /* ------------------------------------------------------------------------
     Latest GitHub release
     --------------------------------------------------------------------- */

  const formatSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return ''
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
    return `${bytes} B`
  }

  const normalizeVersion = (release) => {
    const tag = String(release.tag_name || '').trim()
    if (tag) return /^v/i.test(tag) ? tag : `v${tag}`

    const match = String(release.name || '').match(/v?\d+(?:\.\d+){1,3}(?:[-+][0-9a-z.-]+)?/i)
    if (!match) return 'Latest'
    return /^v/i.test(match[0]) ? match[0] : `v${match[0]}`
  }

  const findInstaller = (release) => {
    const assets = Array.isArray(release.assets) ? release.assets : []
    const installers = assets.filter((asset) => /\.exe$/i.test(String(asset.name || '')))
    return installers.find((asset) => /setup/i.test(asset.name)) || installers[0] || null
  }

  const getChecksum = (release, installer) => {
    const digest = installer && typeof installer.digest === 'string' ? installer.digest : ''
    if (digest) {
      const value = digest.includes(':') ? digest.slice(digest.indexOf(':') + 1) : digest
      if (/^[a-f0-9]{64}$/i.test(value)) return value.toUpperCase()
    }

    const match = String(release.body || '').match(/\b[a-f0-9]{64}\b/i)
    return match ? match[0].toUpperCase() : ''
  }

  function setReleaseStatus(text, isFallback) {
    document.querySelectorAll('[data-release-status]').forEach((status) => {
      while (status.firstChild) status.removeChild(status.firstChild)

      status.appendChild(document.createElement('i'))
      status.appendChild(document.createTextNode(` ${text}`))
      status.classList.toggle('is-fallback', Boolean(isFallback))
      status.setAttribute(
        'title',
        isFallback
          ? 'Showing the GitHub Releases page'
          : 'Resolved from the latest GitHub release',
      )
    })
  }

  function applyRelease(release) {
    if (!release || typeof release !== 'object') return

    const version = normalizeVersion(release)
    const installer = findInstaller(release)
    const downloadUrl =
      (installer && installer.browser_download_url) || release.html_url || LATEST_RELEASE_URL
    const notesUrl = release.html_url || LATEST_RELEASE_URL
    const size =
      installer && Number.isFinite(installer.size) && installer.size > 0
        ? formatSize(installer.size)
        : ''
    const checksum = getChecksum(release, installer)

    document.querySelectorAll('[data-download]').forEach((link) => {
      link.setAttribute('href', downloadUrl)
      link.setAttribute(
        'title',
        installer
          ? `Download JohnLC AuraOS ${version} for Windows`
          : 'Open the latest JohnLC AuraOS release',
      )
    })

    document.querySelectorAll('[data-release-notes]').forEach((link) => {
      link.setAttribute('href', notesUrl)
    })

    document.querySelectorAll('[data-version]').forEach((element) => {
      element.textContent = version
    })

    if (size) {
      document.querySelectorAll('[data-size]').forEach((element) => {
        element.textContent = size
      })
    }

    document.querySelectorAll('[data-checksum]').forEach((element) => {
      element.textContent = checksum || 'See release notes'
      if (checksum) element.setAttribute('title', `SHA-256: ${checksum}`)
      else element.removeAttribute('title')
    })

    document.querySelectorAll('[data-copy-target="checksum-value"]').forEach((button) => {
      button.disabled = !checksum
      button.setAttribute(
        'title',
        checksum ? 'Copy SHA-256 checksum' : 'Checksum is listed in the release notes',
      )
    })

    setReleaseStatus(installer ? 'Latest release' : 'Release page', !installer)
  }

  function useReleaseFallback() {
    document.querySelectorAll('[data-download]').forEach((link) => {
      link.setAttribute('href', LATEST_RELEASE_URL)
      link.setAttribute('title', 'Open the latest JohnLC AuraOS release on GitHub')
    })

    document.querySelectorAll('[data-release-notes]').forEach((link) => {
      link.setAttribute('href', LATEST_RELEASE_URL)
    })

    setReleaseStatus(STATUS_FALLBACK, true)
  }

  function readReleaseCache() {
    try {
      const raw = window.sessionStorage.getItem(RELEASE_CACHE_KEY)
      if (!raw) return null

      const cached = JSON.parse(raw)
      if (!cached || !cached.savedAt || !cached.release) return null

      if (Date.now() - cached.savedAt > RELEASE_CACHE_TTL) {
        window.sessionStorage.removeItem(RELEASE_CACHE_KEY)
        return null
      }

      return cached.release
    } catch {
      return null
    }
  }

  function writeReleaseCache(release) {
    try {
      const slim = {
        tag_name: release.tag_name || '',
        name: release.name || '',
        html_url: release.html_url || '',
        body: release.body || '',
        assets: (Array.isArray(release.assets) ? release.assets : []).map((asset) => ({
          name: asset.name || '',
          size: asset.size || 0,
          digest: asset.digest || '',
          browser_download_url: asset.browser_download_url || '',
        })),
      }

      window.sessionStorage.setItem(
        RELEASE_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), release: slim }),
      )
    } catch {
      /* Caching is best effort. */
    }
  }

  async function resolveLatestRelease() {
    if (typeof window.fetch !== 'function') {
      useReleaseFallback()
      return
    }

    const controller =
      typeof window.AbortController === 'function' ? new AbortController() : null
    const timer = controller
      ? window.setTimeout(() => controller.abort(), 8000)
      : 0

    try {
      const response = await window.fetch(LATEST_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
        signal: controller ? controller.signal : undefined,
      })

      if (!response.ok) throw new Error('GitHub release request failed')

      const release = await response.json()
      if (!release || typeof release !== 'object') throw new Error('Invalid release response')

      applyRelease(release)
      writeReleaseCache(release)
    } catch {
      useReleaseFallback()
    } finally {
      if (timer) window.clearTimeout(timer)
    }
  }

  function initRelease() {
    const cached = readReleaseCache()
    if (cached) {
      applyRelease(cached)
      return
    }

    resolveLatestRelease()
  }

  /* ------------------------------------------------------------------------
     Scroll reveal
     --------------------------------------------------------------------- */

  function initReveal() {
    if (reduceMotion || typeof window.IntersectionObserver !== 'function') return

    const targets = Array.from(
      document.querySelectorAll(
        [
          '.section-heading',
          '.feature-card',
          '.preview-card',
          '.app-card',
          '.download-highlights article',
          '.shells-card',
          '.open-source-card',
          '.final-cta',
          '.install-card',
          '.requirements-card',
          '.release-item',
          '.release-card',
          '.faq-item',
          '.other-platforms-card',
        ].join(','),
      ),
    )

    if (!targets.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('in-view')
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.06, rootMargin: '0px 0px -36px 0px' },
    )

    targets.forEach((element, index) => {
      element.classList.add('reveal')
      element.style.transitionDelay = `${Math.min(index % 4, 3) * 55}ms`
      observer.observe(element)
    })
  }

  /* ------------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */

  function init() {
    initTheme()
    initHeader()
    initNavigation()
    initCopyButtons()
    initRelease()
    initReveal()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
})()
