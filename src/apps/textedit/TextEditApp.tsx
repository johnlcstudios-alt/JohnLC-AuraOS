import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { FileText, FolderOpen, Plus, Save, SaveAll, WrapText, ZoomIn, ZoomOut } from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import type { DialogFilter } from '../../../shared/bridge'
import { bridge } from '../../core/ipc/bridge'
import { wm } from '../../core/wm/WindowManager'
import { dialogs } from '../../core/dialogs'
import { notify } from '../../core/notifications'

const TEXT_FILTERS: DialogFilter[] = [
  { name: 'Text', extensions: ['txt', 'md', 'markdown', 'log', 'csv', 'json', 'ini', 'xml', 'yml', 'yaml'] },
  { name: 'All files', extensions: ['*'] },
]

const UNTITLED = 'Untitled.txt'

/** Last path segment, tolerating both separators and the mock `~` home. */
function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * TextEdit — a real plain-text / Markdown editor.
 *
 * Documents are read and written through the filesystem bridge, so in native
 * mode it opens and saves actual files on disk. Unsaved edits register a close
 * guard with the window manager: the window asks before throwing work away.
 */
export function TextEditApp({ windowId, args }: AppProps) {
  const [path, setPath] = useState<string | null>(null)
  const [name, setName] = useState(UNTITLED)
  const [text, setText] = useState('')
  const [savedText, setSavedText] = useState('')
  const [busy, setBusy] = useState(false)
  const [wrap, setWrap] = useState(true)
  const [fontSize, setFontSize] = useState(13)
  const [error, setError] = useState<string | null>(null)

  const dirty = text !== savedText
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const pathRef = useRef(path)
  pathRef.current = path
  const nameRef = useRef(name)
  nameRef.current = name
  const textRef = useRef(text)
  textRef.current = text

  const editorRef = useRef<HTMLTextAreaElement>(null)
  /** guards StrictMode's double-mount: load exactly once */
  const openedRef = useRef(false)

  // ---- load ------------------------------------------------------------
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    const target = typeof args.path === 'string' ? args.path : null
    if (!target) return
    setBusy(true)
    void bridge.fs
      .readText(target)
      .then((content) => {
        setPath(target)
        setName(baseName(target))
        setText(content)
        setSavedText(content)
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : `Could not open ${target}`
        setError(message)
        notify({ title: 'TextEdit could not open the file', body: message, kind: 'error', appId: 'textedit' })
      })
      .finally(() => setBusy(false))
  }, [args.path])

  // keep the window title in sync with the document name + dirty marker
  useEffect(() => {
    wm.setTitle(windowId, `${dirty ? '• ' : ''}${name}`)
  }, [windowId, name, dirty])

  // ---- unsaved-work guard ---------------------------------------------
  useEffect(() => {
    return wm.addCloseGuard(windowId, () => {
      if (!dirtyRef.current) return true
      return dialogs.confirm({
        title: 'Discard unsaved changes?',
        message: `${nameRef.current} has unsaved changes.`,
        detail: 'Closing the window now will discard them.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
        icon: FileText,
      })
    })
  }, [windowId])

  // ---- commands --------------------------------------------------------
  const newDocument = useCallback(() => {
    setPath(null)
    setName(UNTITLED)
    setText('')
    setSavedText('')
    setError(null)
    editorRef.current?.focus()
  }, [])

  const openDocument = useCallback(async () => {
    const picked = await bridge.dialog
      .openFile({ title: 'Open document', filters: TEXT_FILTERS, defaultPath: '~/Documents' })
      .catch(() => null)
    const target = picked?.[0]
    if (!target) return
    setBusy(true)
    try {
      const content = await bridge.fs.readText(target)
      setPath(target)
      setName(baseName(target))
      setText(content)
      setSavedText(content)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not open ${target}`
      setError(message)
      notify({ title: 'TextEdit could not open the file', body: message, kind: 'error', appId: 'textedit' })
    } finally {
      setBusy(false)
    }
  }, [])

  const writeTo = useCallback(async (target: string, content: string) => {
    try {
      await bridge.fs.writeText(target, content)
      setPath(target)
      setName(baseName(target))
      setSavedText(content)
      setError(null)
      notify({ title: 'Document saved', body: target, kind: 'success', appId: 'textedit', banner: false })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not save ${target}`
      setError(message)
      notify({ title: 'TextEdit could not save the file', body: message, kind: 'error', appId: 'textedit' })
      return false
    }
  }, [])

  const saveAs = useCallback(async () => {
    const target = await bridge.dialog
      .saveFile({
        title: 'Save document',
        defaultPath: pathRef.current ?? `~/Documents/${nameRef.current}`,
        filters: TEXT_FILTERS,
      })
      .catch(() => null)
    if (!target) return false
    return writeTo(target, textRef.current)
  }, [writeTo])

  const save = useCallback(async () => {
    if (!pathRef.current) return saveAs()
    return writeTo(pathRef.current, textRef.current)
  }, [saveAs, writeTo])

  // ---- keyboard (Ctrl/Cmd + N / O / S) ---------------------------------
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    if (e.code === 'KeyN') {
      e.preventDefault()
      newDocument()
    } else if (e.code === 'KeyO') {
      e.preventDefault()
      void openDocument()
    } else if (e.code === 'KeyS' && !e.shiftKey) {
      e.preventDefault()
      void save()
    }
  }

  return (
    <div
      className="flex h-full w-full min-h-0 flex-col"
      data-textedit-path={path ?? ''}
      data-textedit-name={name}
      data-textedit-dirty={dirty ? 'true' : 'false'}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-0.5 px-2 py-1.5" style={{ borderBottom: '1px solid var(--line)' }}>
        <button type="button" className="icon-btn" title="New document (Ctrl+N)" aria-label="New document" data-textedit-action="new" onClick={newDocument}>
          <Plus size={15} />
        </button>
        <button type="button" className="icon-btn" title="Open… (Ctrl+O)" aria-label="Open document" data-textedit-action="open" onClick={() => void openDocument()}>
          <FolderOpen size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Save (Ctrl+S)"
          aria-label="Save"
          data-textedit-action="save"
          data-active={dirty ? 'true' : 'false'}
          onClick={() => void save()}
        >
          <Save size={15} />
        </button>
        <button type="button" className="icon-btn" title="Save as…" aria-label="Save as" data-textedit-action="save-as" onClick={() => void saveAs()}>
          <SaveAll size={15} />
        </button>

        <span className="mx-1 h-[18px] w-px" style={{ background: 'var(--line)' }} />

        <button
          type="button"
          className="icon-btn"
          title="Toggle word wrap"
          aria-label="Toggle word wrap"
          data-textedit-action="wrap"
          data-active={wrap ? 'true' : 'false'}
          onClick={() => setWrap((v) => !v)}
        >
          <WrapText size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Smaller text"
          aria-label="Smaller text"
          data-textedit-action="zoom-out"
          onClick={() => setFontSize((s) => Math.max(10, s - 1))}
        >
          <ZoomOut size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Larger text"
          aria-label="Larger text"
          data-textedit-action="zoom-in"
          onClick={() => setFontSize((s) => Math.min(24, s + 1))}
        >
          <ZoomIn size={15} />
        </button>

        <span className="ml-auto truncate pl-2 text-[11.5px] text-muted">{name}</span>
      </div>

      {error ? (
        <div className="px-3 py-1.5 text-[11.5px]" style={{ borderBottom: '1px solid var(--line)', color: 'var(--danger)' }}>
          {error}
        </div>
      ) : null}

      <textarea
        ref={editorRef}
        className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 outline-none"
        style={{
          fontSize,
          whiteSpace: wrap ? 'pre-wrap' : 'pre',
          overflowWrap: wrap ? 'break-word' : 'normal',
          overflowX: wrap ? 'hidden' : 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          lineHeight: 1.6,
        }}
        placeholder={busy ? 'Loading…' : 'Start typing…'}
        spellCheck
        value={text}
        data-textedit-text
        onChange={(e) => setText(e.target.value)}
      />

      <div
        className="flex items-center justify-between gap-3 px-3 py-1.5 text-[10.5px] text-faint"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <span className="truncate" title={path ?? undefined}>
          {path ?? 'Not saved yet'}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span data-textedit-count="lines">{text.split('\n').length} lines</span>
          <span data-textedit-count="words">{countWords(text)} words</span>
          <span data-textedit-count="chars">{text.length} chars</span>
          <span data-textedit-dirty-label>{dirty ? 'Unsaved' : 'Saved'}</span>
        </span>
      </div>
    </div>
  )
}

export default TextEditApp
