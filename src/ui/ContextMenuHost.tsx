import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { contextMenu, type ContextMenuItem } from '../core/contextMenu'
import { useStore } from '../core/hooks'

const MENU_W = 236

/** Flip the menu so it never spills past the viewport edges. */
function useClampedPosition(x: number, y: number, ref: React.RefObject<HTMLElement>) {
  const [pos, setPos] = useState({ x, y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const nx = x + width > window.innerWidth - 8 ? Math.max(8, window.innerWidth - width - 8) : x
    const ny = y + height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - height - 8) : y
    setPos({ x: nx, y: ny })
  }, [x, y, ref])
  return pos
}

function Submenu({ items, onClose }: { items: ContextMenuItem[]; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-strong absolute left-[calc(100%+4px)] top-[-4px] z-10 overflow-hidden rounded-[11px] p-1"
      style={{ width: MENU_W }}
    >
      {items.map((item, i) => (
        <ItemButton key={item.id ?? `sub-${i}`} item={item} onClose={onClose} />
      ))}
    </motion.div>
  )
}

function ItemButton({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  const [hover, setHover] = useState(false)
  if (item.separator) return <div className="my-1 h-px" style={{ background: 'var(--line)' }} />
  const Icon = item.icon
  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        data-disabled={item.disabled ? 'true' : 'false'}
        className="menu-item text-[12.5px]"
        style={item.danger ? { color: 'var(--danger)' } : undefined}
        onClick={(e) => {
          e.stopPropagation()
          if (item.disabled || item.submenu) return
          item.onSelect?.()
          onClose()
        }}
      >
        <span className="grid w-[15px] place-items-center">
          {item.checked ? <span className="text-[12px]">✓</span> : Icon ? <Icon size={14} /> : null}
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        {item.shortcut ? <span className="text-[11px] opacity-60">{item.shortcut}</span> : null}
        {item.submenu ? <ChevronRight size={13} className="opacity-70" /> : null}
      </button>
      <AnimatePresence>{item.submenu && hover ? <Submenu items={item.submenu} onClose={onClose} /> : null}</AnimatePresence>
    </div>
  )
}

/**
 * Renders the single global context menu opened via `contextMenu.open(...)`.
 * Closes on outside click, Escape, scroll, resize or window blur.
 */
export function ContextMenuHost() {
  const menu = useStore(contextMenu)
  const ref = useRef<HTMLDivElement>(null)
  const pos = useClampedPosition(menu?.x ?? 0, menu?.y ?? 0, ref)

  useEffect(() => {
    if (!menu) return
    const close = () => contextMenu.close()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') contextMenu.close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  return (
    <AnimatePresence>
      {menu ? (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="glass-strong fixed z-[26000] overflow-visible rounded-[11px] p-1"
          data-menu="context"
          style={{ left: pos.x, top: pos.y, width: MENU_W, transformOrigin: 'top left' }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.header ? (
            <div className="truncate px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
              {menu.header}
            </div>
          ) : null}
          {menu.items.map((item, i) => (
            <ItemButton key={item.id ?? `ctx-${i}`} item={item} onClose={() => contextMenu.close()} />
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
