import { motion } from 'framer-motion'
import { SNAP_LAYOUTS } from '../core/wm/snap'
import type { SnapRegion } from '../core/wm/types'

/**
 * Windows 11 style snap layout chooser: appears under the maximize/zoom control
 * when hovered. Hovering a cell highlights it; clicking snaps the window there.
 */
export function SnapLayoutsMenu({
  onSelect,
  onKeepOpen,
}: {
  onSelect: (region: SnapRegion) => void
  onKeepOpen?: (open: boolean) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      className="glass-strong absolute right-1 top-[34px] z-50 rounded-[13px] p-2.5"
      onMouseEnter={() => onKeepOpen?.(true)}
      onMouseLeave={() => onKeepOpen?.(false)}
      data-snap-menu="true"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-muted">Snap layouts</span>
        <span className="text-[10.5px] text-faint">hover · click to snap</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {SNAP_LAYOUTS.map((layout) => (
          <div key={layout.id} className="flex flex-col gap-1">
            <div
              className="relative h-[46px] w-[78px] overflow-hidden rounded-[7px] border"
              style={{ background: 'var(--hover)', borderColor: 'var(--line)' }}
            >
              {layout.cells.map((cell) => (
                <button
                  key={cell.region}
                  type="button"
                  title={cell.label}
                  aria-label={`${layout.name}: ${cell.label}`}
                  className="group absolute transition-[background,box-shadow] duration-150"
                  style={{
                    left: `calc(${cell.nx * 100}% + 2px)`,
                    top: `calc(${cell.ny * 100}% + 2px)`,
                    width: `calc(${cell.nw * 100}% - 4px)`,
                    height: `calc(${cell.nh * 100}% - 4px)`,
                    background: 'var(--line)',
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent)'
                    e.currentTarget.style.boxShadow = '0 0 0 1px rgb(var(--accent-rgb) / .6)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--line)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                  onClick={() => onSelect(cell.region)}
                />
              ))}
            </div>
            <span className="w-[78px] truncate px-0.5 text-[9.5px] text-faint">{layout.name}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
