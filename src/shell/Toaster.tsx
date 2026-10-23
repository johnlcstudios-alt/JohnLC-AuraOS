import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { bus, EVT, type ToastEvent } from '../core/bus'

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: AlertTriangle,
}

interface ActiveToast extends ToastEvent {
  id: number
}

const MAX_TOASTS = 4
const LIFETIME = 2600

/** Transient shell toasts, driven by `bus.emit(EVT.TOAST, ...)`. They stack. */
export function Toaster() {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const seq = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const off = bus.on<ToastEvent>(EVT.TOAST, (event) => {
      const id = ++seq.current
      setToasts((prev) => [...prev, { ...event, id }].slice(-MAX_TOASTS))
      const timer = setTimeout(() => {
        timers.current.delete(id)
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, LIFETIME)
      timers.current.set(id, timer)
    })
    return () => {
      off()
      timers.current.forEach((t) => clearTimeout(t))
      timers.current.clear()
    }
  }, [])

  return (
    <div className="toast-stack" data-overlay="toaster">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind ?? 'info']
          return (
            <motion.div
              key={toast.id}
              layout
              className="toast glass-strong flex items-center gap-2"
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 480, damping: 34 }}
            >
              <Icon size={14} style={{ color: toast.kind === 'error' ? 'var(--danger)' : 'var(--accent)' }} />
              <span>{toast.text}</span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
