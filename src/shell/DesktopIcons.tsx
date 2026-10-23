import { useState, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent } from 'react'
import { FileText, FolderKanban, Home, Settings, TerminalSquare, Info } from 'lucide-react'
import { launchApp } from '../core/apps/registry'
import { quickLook } from '../core/quickLook'
import { AppIconTile } from '../ui/controls'

export interface DeskItem {
  id: string
  label: string
  icon: typeof Home
  tint: [string, string]
  /** filesystem path, when the shortcut points at a real location */
  path?: string
  run: () => void
}

const ITEMS: DeskItem[] = [
  { id: 'home', label: 'Home', icon: Home, tint: ['#f5c542', '#ff9f43'], path: '~', run: () => void launchApp('files', { path: '~' }) },
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderKanban,
    tint: ['#7c5cff', '#4f8cff'],
    path: '~/Projects',
    run: () => void launchApp('files', { path: '~/Projects' }),
  },
  {
    id: 'readme',
    label: 'Readme.md',
    icon: FileText,
    tint: ['#6aa8ff', '#22c9c9'],
    path: '~/Projects/auraos/README.md',
    run: () => void launchApp('files', { path: '~/Projects/auraos/README.md', select: true }),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: TerminalSquare,
    tint: ['#2ecf7f', '#22c9c9'],
    run: () => void launchApp('terminal'),
  },
  { id: 'settings', label: 'Settings', icon: Settings, tint: ['#8a93a6', '#5b6472'], run: () => void launchApp('settings') },
  { id: 'about', label: 'About', icon: Info, tint: ['#6aa8ff', '#a06bff'], run: () => void launchApp('about') },
]

const COL_HEIGHT = 5

/**
 * Desktop shortcut grid (click = select, double-click / Enter = launch).
 * Right-clicking the background or an icon opens the shared context menu.
 */
export function DesktopIcons({
  onClear,
  onBackgroundContext,
  onItemContext,
}: {
  onClear: () => void
  onBackgroundContext?: (e: RMouseEvent) => void
  onItemContext?: (e: RMouseEvent, item: DeskItem) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)

  const activate = (item: DeskItem) => {
    setSelected(item.id)
    item.run()
  }

  const onKeyDown = (e: RKeyboardEvent<HTMLButtonElement>, item: DeskItem) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      activate(item)
      return
    }
    // Space = Quick Look (macOS Finder convention)
    if (e.key === ' ' && item.path) {
      e.preventDefault()
      quickLook.open(item.path)
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
      <div
        style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            setSelected(null)
            onClear()
          }
        }}
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget) return
          e.preventDefault()
          setSelected(null)
          onBackgroundContext?.(e)
        }}
      >
        {ITEMS.map((item, index) => {
          const col = Math.floor(index / COL_HEIGHT)
          const row = index % COL_HEIGHT
          return (
            <button
              key={item.id}
              type="button"
              className="desktop-icon"
              data-selected={selected === item.id ? 'true' : 'false'}
              style={{ left: 16 + col * 94, top: 40 + row * 96, pointerEvents: 'auto' }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSelected(item.id)}
              onDoubleClick={() => activate(item)}
              onKeyDown={(e) => onKeyDown(e, item)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setSelected(item.id)
                onItemContext?.(e, item)
              }}
              title={item.label}
            >
              <AppIconTile icon={item.icon} tint={item.tint} size={46} radius={12} />
              <span className="label">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
