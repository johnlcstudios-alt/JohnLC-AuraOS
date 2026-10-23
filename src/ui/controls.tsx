import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

export function GlassPanel({
  children,
  className = '',
  strong = false,
  style,
}: {
  children: ReactNode
  className?: string
  strong?: boolean
  style?: CSSProperties
}) {
  return (
    <div className={`${strong ? 'glass-strong' : 'glass'} ${className}`} style={style}>
      {children}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-disabled={disabled ? 'true' : 'false'}
      onClick={() => !disabled && onChange(!checked)}
      className="relative h-[20px] w-[34px] shrink-0 rounded-full border transition-colors duration-200"
      style={{
        background: checked ? 'var(--accent)' : 'var(--line-strong)',
        borderColor: checked ? 'transparent' : 'var(--line)',
      }}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        className="absolute top-[1px] block h-[16px] w-[16px] rounded-full bg-white shadow"
        style={{ left: checked ? 17 : 1 }}
      />
    </button>
  )
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  icon,
  className = '',
  ariaLabel,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (next: number) => void
  icon?: LucideIcon
  className?: string
  ariaLabel?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  const Icon = icon
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {Icon ? <Icon size={15} className="shrink-0 text-muted" /> : null}
      <div className="relative h-[20px] flex-1">
        <div
          className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 overflow-hidden rounded-full"
          style={{ background: 'var(--line-strong)' }}
        >
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
        <input
          aria-label={ariaLabel}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent"
          style={{ WebkitAppearance: 'none' }}
        />
      </div>
    </div>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (next: T) => void
  className?: string
}) {
  return (
    <div className={`inline-flex rounded-[9px] border border-line p-[2px] ${className}`} style={{ background: 'var(--hover)' }}>
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="relative flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12.5px] transition-colors"
            style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}
          >
            {active ? (
              <motion.span
                layoutId={`seg-${options.map((o) => o.value).join('-')}`}
                className="absolute inset-0 rounded-[7px]"
                style={{ background: 'var(--active)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              />
            ) : null}
            <span className="relative flex items-center gap-1.5">
              {Icon ? <Icon size={13} /> : null}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export interface MenuItemDef {
  id?: string
  label?: string
  icon?: LucideIcon
  shortcut?: string
  onSelect?: () => void
  disabled?: boolean
  separator?: boolean
  checked?: boolean
  danger?: boolean
  submenuLabel?: string
}

export function MenuList({
  items,
  onClose,
  width = 240,
  className = '',
  style,
}: {
  items: MenuItemDef[]
  onClose?: () => void
  width?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -2 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      className={`glass-strong overflow-hidden rounded-[11px] p-1 ${className}`}
      style={{ width, ...style }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className="my-1 h-px" style={{ background: 'var(--line)' }} />
        }
        const Icon = item.icon
        return (
          <button
            key={item.id ?? `${item.label}-${index}`}
            type="button"
            data-disabled={item.disabled ? 'true' : 'false'}
            className="menu-item text-[12.5px]"
            onClick={() => {
              if (item.disabled) return
              item.onSelect?.()
              onClose?.()
            }}
          >
            <span className="grid w-[15px] place-items-center">
              {item.checked ? <Check size={13} /> : Icon ? <Icon size={14} /> : null}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut ? <span className="text-[11px] opacity-60">{item.shortcut}</span> : null}
          </button>
        )
      })}
    </motion.div>
  )
}

export function AppIconTile({
  icon: Icon,
  tint,
  size = 34,
  radius = 9,
}: {
  icon: LucideIcon
  tint: [string, string]
  size?: number
  radius?: number
}) {
  return (
    <span
      className="grid shrink-0 place-items-center text-white shadow"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundImage: `linear-gradient(145deg, ${tint[0]}, ${tint[1]})`,
        boxShadow: '0 4px 14px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.35)',
      }}
    >
      <Icon size={Math.round(size * 0.56)} strokeWidth={2} />
    </span>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-transparent"
      style={{ width: size, height: size, borderTopColor: 'var(--accent)', borderRightColor: 'var(--accent)' }}
    />
  )
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <Icon size={30} className="text-faint" />
      <div className="text-[13px] text-muted">{title}</div>
      {hint ? <div className="text-[11.5px] text-faint">{hint}</div> : null}
    </div>
  )
}
