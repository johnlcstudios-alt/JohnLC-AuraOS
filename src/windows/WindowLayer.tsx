import { Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useWindowManager } from '../core/wm/useWindowManager'
import { getApp } from '../core/apps/registry'
import { WindowFrame } from './WindowFrame'
import { Spinner } from '../ui/controls'

function WindowFallback({ name, subtitle }: { name: string; subtitle?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
      <Spinner size={22} />
      <div className="text-center">
        <div className="text-[13px] font-medium text-ink">{name}</div>
        {subtitle ? <div className="mt-0.5 text-[11.5px] text-faint">{subtitle}</div> : null}
      </div>
    </div>
  )
}

export function WindowLayer() {
  const { windows, snapPreview, activeDesktop } = useWindowManager()

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
      <AnimatePresence>
        {windows.map((win) => {
          const app = getApp(win.appId)
          const Comp = app?.component
          return (
            <WindowFrame key={win.id} win={win} onScreen={win.desktop === activeDesktop}>
              {Comp ? (
                <Suspense fallback={<WindowFallback name={app.name} subtitle={app.subtitle} />}>
                  <Comp windowId={win.id} args={win.args} />
                </Suspense>
              ) : (
                <WindowFallback name="Unknown app" subtitle={win.appId} />
              )}
            </WindowFrame>
          )
        })}
      </AnimatePresence>

      <AnimatePresence>
        {snapPreview ? (
          <motion.div
            key="snap-preview"
            className="snap-preview"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.13, ease: [0.16, 1, 0.3, 1] }}
            style={{
              left: snapPreview.rect.x,
              top: snapPreview.rect.y,
              width: snapPreview.rect.w,
              height: snapPreview.rect.h,
              zIndex: 999999,
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
