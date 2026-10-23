import { bridge, isNative } from './ipc/bridge'

export type RepeatMode = 'off' | 'all' | 'one'

/** Recipe for a synthesised ambient loop — the generated stations' sheet music. */
export interface AmbientSpec {
  /** chord tones in Hz */
  freqs: number[]
  /** loop length in seconds */
  seconds: number
  /** lowpass cutoff in Hz */
  cutoff: number
}

export interface MediaTrack {
  id: string
  title: string
  artist: string
  /** absolute URL or data-URL of the audio; omit for a generated track */
  src?: string
  artwork?: string
  tint?: [string, string]
  /** when true, the audio is synthesised at play time (see renderAmbientLoop) */
  generated?: boolean
  /** chord/filter recipe used when `generated` (defaults to the AuraOS Radio pad) */
  spec?: AmbientSpec
  /** seconds; only used as a fallback before metadata loads */
  duration?: number
}

export interface MediaSnapshot {
  current: MediaTrack | null
  playing: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
  queueLength: number
  /** false when the environment cannot render audio at all */
  audioAvailable: boolean
}

const EMPTY: MediaSnapshot = {
  current: null,
  playing: false,
  position: 0,
  duration: 0,
  volume: 1,
  muted: false,
  repeat: 'off',
  shuffle: false,
  queueLength: 0,
  audioAvailable: true,
}

/** Encode an AudioBuffer to a 16-bit PCM WAV Blob. */
function bufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c += 1) channels.push(buffer.getChannelData(c))

  let offset = 44
  for (let i = 0; i < numFrames; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

/** The classic AuraOS Radio pad: A minor 9th, 24 s. */
const DEFAULT_AMBIENT: AmbientSpec = { freqs: [110, 164.81, 220, 261.63, 329.63], seconds: 24, cutoff: 1800 }

/** Read a Blob into a base64 data-url (used to hand audio to the desktop host). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read audio blob'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Render a calm ambient chord loop offline and return a URL an <audio> element
 * can load. Zero assets, zero dependencies — the AuraOS Radio track is
 * genuinely audible.
 *
 * On the desktop host the loop is written to a temp file and served as
 * `file://`, because Chromium blocks `data:`/`blob:` media on `file://` pages.
 * In the browser a blob URL is used directly.
 */
async function renderAmbientLoop(spec?: AmbientSpec): Promise<string> {
  const OfflineCtx: typeof OfflineAudioContext | undefined =
    typeof OfflineAudioContext !== 'undefined'
      ? OfflineAudioContext
      : (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!OfflineCtx) throw new Error('OfflineAudioContext unavailable')
  const { freqs, seconds, cutoff } = spec ?? DEFAULT_AMBIENT
  const sampleRate = 44100
  const ctx = new OfflineCtx(2, Math.floor(sampleRate * seconds), sampleRate)
  const master = ctx.createGain()
  master.gain.value = 0.0001
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  filter.Q.value = 0.7
  master.connect(filter)
  filter.connect(ctx.destination)

  // the pad voices
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator()
    osc.type = i % 2 === 0 ? 'sine' : 'triangle'
    osc.frequency.value = f
    const detune = ctx.createOscillator()
    detune.frequency.value = 0.08 + i * 0.015
    const detuneGain = ctx.createGain()
    detuneGain.gain.value = 1.6
    detune.connect(detuneGain)
    detuneGain.connect(osc.detune)
    const voice = ctx.createGain()
    voice.gain.value = 0.14 / freqs.length
    osc.connect(voice)
    voice.connect(master)
    osc.start(0)
    detune.start(0)
    osc.stop(seconds)
    detune.stop(seconds)
  })

  // fade in / out
  master.gain.setValueAtTime(0.0001, 0)
  master.gain.exponentialRampToValueAtTime(0.9, 2)
  master.gain.setValueAtTime(0.9, seconds - 3)
  master.gain.exponentialRampToValueAtTime(0.0001, seconds - 0.2)

  const rendered = await ctx.startRendering()
  const blob = bufferToWav(rendered)
  if (isNative) {
    const dataUrl = await blobToDataUrl(blob).catch(() => null)
    const fileUrl = dataUrl ? await bridge.fs.writeTempMedia(dataUrl).catch(() => null) : null
    if (fileUrl) return fileUrl
  }
  return URL.createObjectURL(blob)
}

/**
 * The single, shared now-playing engine.
 *
 * Real audio: a track with `src` streams through a hidden <audio> element.
 * Generated audio: a `generated: true` track is synthesised once and played
 * like any other file. Either way the transport state is real and shared by
 * the Control Center, the Top Bar and (later) a Music app; the Media Session
 * API mirrors it to the OS media keys where available.
 */
class MediaStore {
  private queue: MediaTrack[] = []
  private index = -1
  private playing = false
  private position = 0
  private duration = 0
  private volume = 1
  private muted = false
  private repeat: RepeatMode = 'off'
  private shuffle = false
  private audioAvailable = true

  private listeners = new Set<() => void>()
  private audio: HTMLAudioElement | null = null
  private generatedUrls = new Map<string, string>()
  private snapshot: MediaSnapshot = EMPTY

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): MediaSnapshot => this.snapshot

  private get current(): MediaTrack | null {
    return this.index >= 0 ? this.queue[this.index] ?? null : null
  }

  private refresh(emit = true): void {
    this.snapshot = {
      current: this.current,
      playing: this.playing,
      position: this.position,
      duration: this.duration,
      volume: this.volume,
      muted: this.muted,
      repeat: this.repeat,
      shuffle: this.shuffle,
      queueLength: this.queue.length,
      audioAvailable: this.audioAvailable,
    }
    if (emit) this.emit()
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') {
      this.audioAvailable = false
      return null
    }
    if (!this.audio) {
      const audio = new Audio()
      audio.preload = 'auto'
      audio.addEventListener('timeupdate', () => {
        this.position = audio.currentTime
        this.refresh()
      })
      audio.addEventListener('durationchange', () => {
        if (Number.isFinite(audio.duration)) this.duration = audio.duration
        this.refresh()
      })
      audio.addEventListener('ended', () => this.handleEnded())
      audio.addEventListener('play', () => {
        this.playing = true
        this.refresh()
      })
      audio.addEventListener('pause', () => {
        this.playing = false
        this.refresh()
      })
      this.audio = audio
    }
    this.applyVolume()
    return this.audio
  }

  private applyVolume(): void {
    if (this.audio) this.audio.volume = this.muted ? 0 : this.volume
  }

  /** Replace the queue and optionally start a track. */
  setQueue(tracks: MediaTrack[], startIndex = 0): void {
    this.queue = [...tracks]
    this.index = tracks.length ? Math.max(0, Math.min(startIndex, tracks.length - 1)) : -1
    this.position = 0
    this.duration = this.current?.duration ?? 0
    this.refresh()
  }

  enqueue(track: MediaTrack, playNow = false): void {
    const existing = this.queue.findIndex((t) => t.id === track.id)
    if (existing >= 0) this.queue[existing] = track
    else this.queue.push(track)
    if (playNow || this.index < 0) {
      this.index = this.queue.findIndex((t) => t.id === track.id)
      void this.play()
    } else {
      this.refresh()
    }
  }

  /** Play the current track, or a specific one. */
  async play(track?: MediaTrack): Promise<void> {
    if (track) {
      const i = this.queue.findIndex((t) => t.id === track.id)
      if (i >= 0) this.index = i
      else {
        this.queue.push(track)
        this.index = this.queue.length - 1
      }
    }
    if (!this.current) return
    const audio = this.ensureAudio()
    if (!audio) {
      this.playing = true
      this.refresh()
      return
    }
    try {
      const src = await this.resolveSrc(this.current)
      if (audio.src !== src) {
        audio.src = src
        this.position = 0
      }
      this.applyVolume()
      await audio.play()
      this.playing = true
      void bridge.power.preventSleep(true, 'media playback').catch(() => undefined)
      this.updateMediaSession()
    } catch (error) {
      // Autoplay can still be refused on some hosts — report it honestly instead
      // of pretending the track is playing (the smoke tests read this state).
      console.warn('[auraos:media] play() rejected:', error)
      this.playing = false
      this.audioAvailable = false
    }
    this.refresh()
  }

  pause(): void {
    this.audio?.pause()
    this.playing = false
    void bridge.power.preventSleep(false).catch(() => undefined)
    this.refresh()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else void this.play()
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()
    }
    this.playing = false
    this.position = 0
    this.index = -1
    this.queue = []
    this.setMediaSessionHandlers(false)
    void bridge.power.preventSleep(false).catch(() => undefined)
    this.refresh()
  }

  next(): void {
    if (!this.queue.length) return
    this.index = this.shuffle ? this.randomIndex() : (this.index + 1) % this.queue.length
    this.position = 0
    void this.play()
  }

  prev(): void {
    if (!this.queue.length) return
    if (this.position > 3) {
      this.seek(0)
      return
    }
    this.index = this.index <= 0 ? this.queue.length - 1 : this.index - 1
    this.position = 0
    void this.play()
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.duration || seconds))
    this.position = clamped
    if (this.audio && Number.isFinite(this.audio.duration)) this.audio.currentTime = clamped
    this.refresh()
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.volume > 0) this.muted = false
    this.applyVolume()
    this.refresh()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyVolume()
    this.refresh()
  }

  toggleMuted(): void {
    this.setMuted(!this.muted)
  }

  setRepeat(mode: RepeatMode): void {
    this.repeat = mode
    this.refresh()
  }

  cycleRepeat(): void {
    this.setRepeat(this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off')
  }

  toggleShuffle(): void {
    this.shuffle = !this.shuffle
    this.refresh()
  }

  private randomIndex(): number {
    if (this.queue.length <= 1) return 0
    let i = this.index
    while (i === this.index) i = Math.floor(Math.random() * this.queue.length)
    return i
  }

  private handleEnded(): void {
    if (this.repeat === 'one') {
      this.seek(0)
      void this.play()
      return
    }
    if (this.repeat === 'off' && this.index >= this.queue.length - 1 && !this.shuffle) {
      this.playing = false
      this.position = this.duration
      this.refresh()
      return
    }
    this.next()
  }

  private async resolveSrc(track: MediaTrack): Promise<string> {
    if (track.src) return track.src
    if (track.generated) {
      const cached = this.generatedUrls.get(track.id)
      if (cached) return cached
      const url = await renderAmbientLoop(track.spec)
      this.generatedUrls.set(track.id, url)
      return url
    }
    throw new Error('Track has no audio source')
  }

  // ---- Media Session (OS media keys / lock screen) --------------------------
  private sessionBound = false

  private updateMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const track = this.current
    if (!track) return
    try {
      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: 'AuraOS',
          artwork: track.artwork ? [{ src: track.artwork }] : [],
        })
      }
      this.setMediaSessionHandlers(true)
    } catch {
      /* media session is best-effort */
    }
  }

  private setMediaSessionHandlers(on: boolean): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || this.sessionBound === on) return
    try {
      const ms = navigator.mediaSession
      ms.setActionHandler('play', on ? () => void this.play() : null)
      ms.setActionHandler('pause', on ? () => this.pause() : null)
      ms.setActionHandler('nexttrack', on ? () => this.next() : null)
      ms.setActionHandler('previoustrack', on ? () => this.prev() : null)
      ms.setActionHandler('stop', on ? () => this.stop() : null)
      this.sessionBound = on
    } catch {
      /* ignore unsupported actions */
    }
  }
}

export const media = new MediaStore()

/** The always-available generated "station" used by the shell demo/radio card. */
export const AURAOS_RADIO: MediaTrack = {
  id: 'auraos-radio',
  title: 'AuraOS Radio',
  artist: 'Generated ambient',
  generated: true,
  spec: DEFAULT_AMBIENT,
  duration: 24,
  tint: ['#a06bff', '#4f8cff'],
}

/**
 * The generated station library: every track is synthesised at play time by
 * `renderAmbientLoop` from its `spec`, so the Music app has real, audible
 * content with zero bundled assets.
 */
export const MEDIA_STATIONS: MediaTrack[] = [
  AURAOS_RADIO,
  {
    id: 'station-night-drives',
    title: 'Night Drives',
    artist: 'Generated ambient',
    generated: true,
    spec: { freqs: [73.42, 110, 146.83, 220, 277.18], seconds: 26, cutoff: 950 },
    duration: 26,
    tint: ['#4f8cff', '#1e3a8a'],
  },
  {
    id: 'station-glass-forest',
    title: 'Glass Forest',
    artist: 'Generated ambient',
    generated: true,
    spec: { freqs: [130.81, 196, 261.63, 329.63, 392], seconds: 22, cutoff: 2600 },
    duration: 22,
    tint: ['#2ecf7f', '#22c9c9'],
  },
  {
    id: 'station-ember-waltz',
    title: 'Ember Waltz',
    artist: 'Generated ambient',
    generated: true,
    spec: { freqs: [87.31, 130.81, 174.61, 261.63], seconds: 20, cutoff: 1400 },
    duration: 20,
    tint: ['#ff9f43', '#ff5c9d'],
  },
]
