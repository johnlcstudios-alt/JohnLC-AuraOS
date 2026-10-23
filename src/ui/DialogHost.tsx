import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, HelpCircle, Info, X } from 'lucide-react'
import { dialogs } from '../core/dialogs'
import { useStore } from '../core/hooks'

/**
 * Renders the queued in-app dialogs produced by `dialogs.alert/confirm/prompt`.
 * Presented as a centred glass sheet with light backdrop blur.
 */
export function DialogHost() {
  const dialog = useStore(dialogs)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (dialog?.kind === 'prompt') {
      setValue(dialog.defaultValue ?? '')
      const id = window.setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 30)
      return () => window.clearTimeout(id)
    }
    setValue('')
    return
  }, [dialog])

  return (
    <AnimatePresence>
      {dialog ? (
        <motion.div
          key="dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[27000] grid place-items-center"
          style={{ background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(3px)' }}
          data-overlay="dialog"
          data-dialog-kind={dialog.kind}
          onPointerDown={() => dialog.kind === 'alert' && dialogs.settle(dialog.id, undefined)}
        >
          <motion.div
            key={dialog.id}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong w-[380px] max-w-[86vw] overflow-hidden rounded-[16px] p-5"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') dialogs.settle(dialog.id, dialog.kind === 'confirm' ? false : null)
              if (e.key === 'Enter' && dialog.kind !== 'alert') {
                dialogs.settle(dialog.id, dialog.kind === 'prompt' ? value : true)
              }
            }}
          >
            <div className="flex items-start gap-3">
              {(() => {
                const Icon = dialog.icon ?? (dialog.danger ? AlertTriangle : dialog.kind === 'confirm' ? HelpCircle : Info)
                const tint = dialog.danger ? 'var(--danger)' : 'var(--accent)'
                return (
                  <span
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-white"
                    style={{ background: tint }}
                  >
                    <Icon size={17} />
                  </span>
                )
              })()}
              <div className="min-w-0 flex-1">
                {dialog.title ? <div className="text-[13.5px] font-semibold text-ink">{dialog.title}</div> : null}
                <div className={`text-[13px] ${dialog.title ? 'mt-0.5 text-muted' : 'text-ink'}`}>{dialog.message}</div>
                {dialog.detail ? <div className="mt-1.5 text-[12px] text-faint">{dialog.detail}</div> : null}
              </div>
              {dialog.kind === 'alert' ? (
                <button type="button" className="menu-item -mr-1 -mt-1 w-auto p-1" onClick={() => dialogs.settle(dialog.id, undefined)}>
                  <X size={14} />
                </button>
              ) : null}
            </div>

            {dialog.kind === 'prompt' ? (
              <input
                ref={inputRef}
                className="field mt-3.5 w-full"
                value={value}
                placeholder={dialog.placeholder}
                onChange={(e) => setValue(e.target.value)}
              />
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              {dialog.kind !== 'alert' ? (
                <button
                  type="button"
                  data-dialog-action="cancel"
                  className="rounded-[9px] border border-line px-3.5 py-1.5 text-[12.5px] text-muted transition-colors hover:text-ink"
                  style={{ background: 'var(--hover)' }}
                  onClick={() => dialogs.settle(dialog.id, dialog.kind === 'confirm' ? false : null)}
                >
                  {dialog.cancelLabel ?? 'Cancel'}
                </button>
              ) : null}
              <button
                type="button"
                data-dialog-action="confirm"
                className="rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-transform active:scale-[0.98]"
                style={{ background: dialog.danger ? 'var(--danger)' : 'var(--accent)' }}
                onClick={() => dialogs.settle(dialog.id, dialog.kind === 'prompt' ? value : true)}
              >
                {dialog.confirmLabel ?? 'OK'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
