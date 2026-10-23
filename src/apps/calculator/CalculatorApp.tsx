import { useEffect, useMemo, useState } from 'react'
import { Delete } from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import { bus, EVT, type AppArgsEvent } from '../../core/bus'
import { evaluate } from '../../core/calc'
import { useWindowManager } from '../../core/wm/useWindowManager'

type Mode = 'standard' | 'scientific'

interface CalcKey {
  id: string
  label: string
  /** token appended to the working expression */
  insert?: string
  action?: 'clear' | 'back' | 'equals' | 'negate'
  kind?: 'num' | 'op' | 'fn' | 'accent' | 'danger'
}

/** three extra rows shown in scientific mode */
const SCIENTIFIC: CalcKey[] = [
  { id: 'sin', label: 'sin', insert: 'sin(', kind: 'fn' },
  { id: 'cos', label: 'cos', insert: 'cos(', kind: 'fn' },
  { id: 'tan', label: 'tan', insert: 'tan(', kind: 'fn' },
  { id: 'sqrt', label: '√', insert: 'sqrt(', kind: 'fn' },
  { id: 'ln', label: 'ln', insert: 'ln(', kind: 'fn' },
  { id: 'log', label: 'log', insert: 'log(', kind: 'fn' },
  { id: 'sq', label: 'x²', insert: '^2', kind: 'fn' },
  { id: 'inv', label: '1/x', insert: '^-1', kind: 'fn' },
  { id: 'pi', label: 'π', insert: 'pi', kind: 'fn' },
  { id: 'e', label: 'e', insert: 'e', kind: 'fn' },
  { id: 'lparen', label: '(', insert: '(', kind: 'fn' },
  { id: 'rparen', label: ')', insert: ')', kind: 'fn' },
]

const PAD: CalcKey[] = [
  { id: 'ac', label: 'AC', action: 'clear', kind: 'danger' },
  { id: 'back', label: '⌫', action: 'back', kind: 'fn' },
  { id: 'pct', label: '%', insert: '%', kind: 'fn' },
  { id: 'div', label: '÷', insert: '÷', kind: 'op' },

  { id: '7', label: '7', insert: '7' },
  { id: '8', label: '8', insert: '8' },
  { id: '9', label: '9', insert: '9' },
  { id: 'mul', label: '×', insert: '×', kind: 'op' },

  { id: '4', label: '4', insert: '4' },
  { id: '5', label: '5', insert: '5' },
  { id: '6', label: '6', insert: '6' },
  { id: 'sub', label: '−', insert: '-', kind: 'op' },

  { id: '1', label: '1', insert: '1' },
  { id: '2', label: '2', insert: '2' },
  { id: '3', label: '3', insert: '3' },
  { id: 'add', label: '+', insert: '+', kind: 'op' },

  { id: 'neg', label: '±', action: 'negate', kind: 'fn' },
  { id: '0', label: '0', insert: '0' },
  { id: 'dot', label: '.', insert: '.' },
  { id: 'eq', label: '=', action: 'equals', kind: 'accent' },
]

/** Pretty-print an expression with the operator glyphs a calculator shows. */
function pretty(expr: string): string {
  return expr
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/\bsqrt\(/g, '√(')
    .replace(/\bpi\b/g, 'π')
}

/** Flip the sign of the number at the end of the expression. */
function negate(prev: string): string {
  const match = /(\d*\.?\d+)$/.exec(prev)
  if (!match) return prev
  const start = prev.length - match[0].length
  const before = prev.slice(0, start)
  // already a unary minus right in front of this number → strip it
  if (before.endsWith('-') && (before.length === 1 || /[-+*/^%(]$/.test(before.slice(0, -1)))) {
    return before.slice(0, -1) + match[0]
  }
  return before + '-' + match[0]
}

/**
 * Calculator — a real one: keys build an expression that is evaluated by the
 * dependency-free parser in `core/calc` (no eval anywhere), with a live result
 * preview, a paper-tape history and a scientific keypad.
 */
export function CalculatorApp({ windowId, args }: AppProps) {
  const { focusedId } = useWindowManager()
  const [mode, setMode] = useState<'standard' | 'scientific'>(
    args.mode === 'scientific' ? 'scientific' : 'standard',
  )
  const [expr, setExpr] = useState('')
  const [tape, setTape] = useState<{ id: number; expr: string; result: string }[]>([])
  const [seq, setSeq] = useState(0)

  useEffect(() => {
    return bus.on<AppArgsEvent>(EVT.APP_ARGS, (event) => {
      if (event.windowId !== windowId) return
      if (event.args.mode === 'standard' || event.args.mode === 'scientific') setMode(event.args.mode)
    })
  }, [windowId])

  const preview = useMemo(() => (expr ? evaluate(expr) : null), [expr])
  const big = preview ? preview.display : expr ? pretty(expr) : '0'
  const small = preview ? pretty(expr) : ''

  const clear = () => {
    setExpr('')
  }

  const back = () => setExpr((prev) => prev.slice(0, -1))

  const equals = () => {
    const result = evaluate(expr)
    if (!result) return
    setSeq((n) => n + 1)
    setTape((prev) => [{ id: seq + 1, expr: pretty(result.expression), result: result.display }, ...prev].slice(0, 24))
    setExpr(result.display)
  }

  const press = (key: CalcKey) => {
    if (key.action === 'clear') clear()
    else if (key.action === 'back') back()
    else if (key.action === 'equals') equals()
    else if (key.action === 'negate') setExpr(negate)
    else if (key.insert) setExpr((prev) => prev + key.insert)
  }

  // physical keyboard, but only while this window is the focused one
  useEffect(() => {
    if (focusedId !== windowId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const key = e.key
      if (/^[0-9.]$/.test(key)) {
        setExpr((prev) => prev + key)
      } else if ('+-*/^%()'.includes(key)) {
        setExpr((prev) => prev + (key === '*' ? '×' : key === '/' ? '÷' : key))
      } else if (key === 'Enter' || key === '=') {
        equals()
      } else if (key === 'Backspace') {
        back()
      } else if (key === 'Escape' || key === 'c' || key === 'C') {
        clear()
      } else {
        return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const keys = mode === 'scientific' ? [...SCIENTIFIC, ...PAD] : PAD

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 px-3 pt-3">
        {(['standard', 'scientific'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className="btn !h-[24px] !px-2.5 text-[11px] capitalize"
            data-variant={mode === m ? 'accent' : 'ghost'}
            data-calc-mode={m}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        <span className="ml-auto text-[10.5px] text-faint" data-calc-count={tape.length}>
          {tape.length ? `${tape.length} in history` : ''}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-1 overflow-y-auto px-4 py-3 text-right" data-calc-tape>
        {tape
          .slice(0, 6)
          .reverse()
          .map((row) => (
            <button
              key={row.id}
              type="button"
              className="truncate text-[11.5px] text-faint transition-colors hover:text-muted"
              title={`${row.expr} = ${row.result}`}
              onClick={() => setExpr(row.result)}
            >
              {row.expr} = {row.result}
            </button>
          ))}
        <div className="min-h-[14px] truncate text-[11.5px] text-faint">{small}</div>
        <div className="mono truncate text-[30px] font-light leading-tight" data-calc-display>
          {big}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 p-3 pt-0" data-calc-pad>
        {mode === 'scientific'
          ? SCIENTIFIC.map((key) => (
              <button
                key={key.id}
                type="button"
                className="calc-key"
                data-calc-key={key.id}
                data-kind={key.kind}
                onClick={() => press(key)}
              >
                {key.label}
              </button>
            ))
          : null}
        {PAD.map((key) => (
          <button
            key={key.id}
            type="button"
            className="calc-key"
            data-calc-key={key.id}
            data-kind={key.kind}
            aria-label={key.label}
            onClick={() => press(key)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default CalculatorApp

