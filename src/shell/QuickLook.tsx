import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, FileText, FolderOpen, Image as ImageIcon, X } from 'lucide-react'
import { bridge } from '../core/ipc/bridge'
import { quickLook } from '../core/quickLook'
import { useStore } from '../core/hooks'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg', 'ico'])
const TEXT_EXT = new Set(['txt', 'md', 'json', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'csv', 'log', 'yml', 'yaml', 'xml', 'sh', 'ps1', 'ini', 'toml'])
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'mkv'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac'])

function extOf(path: string): string {
  const i = path.lastIndexOf('.')
  return i > 0 ? path.slice(i + 1).toLowerCase() : ''
}

function nameOf(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

type Preview =
  | { kind: 'loading' }
  | { kind: 'image'; data: string }
  | { kind: 'text'; data: string }
  | { kind: 'pdf'; data: string }
  | { kind: 'media'; data: string; media: 'video' | 'audio' }
  | { kind: 'folder'; count: number }
  | { kind: 'none'; note: string }

function usePreview(path: string | null): Preview {
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' })

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setPreview({ kind: 'loading' })
    const ext = extOf(path)

    const load = async (): Promise<void> => {
      try {
        if (IMAGE_EXT.has(ext)) {
          const data = await bridge.fs.readDataUrl(path)
          if (!cancelled) setPreview(data ? { kind: 'image', data } : { kind: 'none', note: 'Preview unavailable' })
          return
        }
        if (TEXT_EXT.has(ext)) {
          const text = await bridge.fs.readText(path, 200_000)
          if (!cancelled) setPreview({ kind: 'text', data: text })
          return
        }
        if (ext === 'pdf') {
          const data = await bridge.fs.readDataUrl(path)
          if (!cancelled) setPreview(data ? { kind: 'pdf', data } : { kind: 'none', note: 'Open the PDF in the Files app for the native viewer' })
          return
        }
        if (VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext)) {
          if (!cancelled) setPreview({ kind: 'media', data: '', media: VIDEO_EXT.has(ext) ? 'video' : 'audio' })
          return
        }
        const stat = await bridge.fs.stat(path)
        if (stat.kind === 'dir') {
          const entries = await bridge.fs.list(path)
          if (!cancelled) setPreview({ kind: 'folder', count: entries.length })
          return
        }
        if (!cancelled) setPreview({ kind: 'none', note: `${stat.kind === 'file' ? 'File' : 'Item'} · ${formatBytes(stat.size)}` })
      } catch (error) {
        if (!cancelled) setPreview({ kind: 'none', note: error instanceof Error ? error.message : 'Preview failed' })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [path])

  return preview
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * Quick Look: a large, centred preview for the selected file. Space toggles it
 * from Files / Spotlight / the desktop; Escape closes it.
 */
export function QuickLook() {
  const path = useStore(quickLook)
  const preview = usePreview(path)
  const open = path !== null

  const title = path ? nameOf(path) : ''

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[25000] grid place-items-center p-8"
          data-overlay="quick-look"
          style={{ background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(10px)' }}
          onClick={() => quickLook.close()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong flex max-h-full w-[min(920px,92vw)] flex-col overflow-hidden rounded-[18px]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="grid h-6 w-6 place-items-center rounded-[7px] text-white" style={{ background: 'var(--accent)' }}>
                {IMAGE_EXT.has(extOf(path ?? '')) ? <ImageIcon size={13} /> : <FileText size={13} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{title}</div>
                <div className="truncate text-[11px] text-faint">{path}</div>
              </div>
              <button
                type="button"
                className="menu-item w-auto px-2 py-1 text-[11.5px]"
                onClick={() => void bridge.fs.openWith(path ?? '').catch(() => undefined)}
              >
                <ExternalLink size={13} /> Open
              </button>
              <button type="button" className="menu-item w-auto px-2 py-1 text-[11.5px]" onClick={() => void bridge.fs.reveal(path ?? '')}>
                <FolderOpen size={13} /> Reveal
              </button>
              <button type="button" className="menu-item w-auto p-1.5" onClick={() => quickLook.close()} aria-label="Close preview">
                <X size={14} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-auto p-4" style={{ background: 'var(--surface)' }}>
              {preview.kind === 'loading' ? (
                <div className="grid h-[40vh] place-items-center text-[12.5px] text-faint">Loading preview…</div>
              ) : preview.kind === 'image' ? (
                <img src={preview.data} alt={title} className="mx-auto max-h-[72vh] max-w-full rounded-[10px] object-contain" />
              ) : preview.kind === 'text' ? (
                <pre className="mono min-h-[30vh] whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink">{preview.data}</pre>
              ) : preview.kind === 'pdf' ? (
                <embed src={preview.data} type="application/pdf" className="h-[72vh] w-full rounded-[10px]" />
              ) : preview.kind === 'media' ? (
                <div className="grid h-[40vh] place-items-center text-[12.5px] text-muted">
                  {preview.media === 'video' ? 'Video preview' : 'Audio preview'} · play it in the Media app
                </div>
              ) : preview.kind === 'folder' ? (
                <div className="grid h-[40vh] place-items-center text-[12.5px] text-muted">{preview.count} items in this folder</div>
              ) : (
                <div className="grid h-[40vh] place-items-center text-[12.5px] text-muted">{preview.note}</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
