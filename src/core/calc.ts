/**
 * A tiny, dependency-free, *safe* arithmetic evaluator used by Spotlight and the
 * Calculator app. No `eval`: a tokenizer feeds a recursive-descent parser, so an
 * arbitrary string can never execute code.
 *
 * Supports: + - * / % ^ ( ), unary minus, decimals, the functions
 * sqrt/abs/round/floor/ceil/min/max/log/ln/sin/cos/tan and the constants pi/e.
 */

export interface CalcResult {
  value: number
  /** the expression, lightly normalised for display */
  expression: string
  /** a tidy string form of the value */
  display: string
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  sqrt: ([a]) => Math.sqrt(a),
  abs: ([a]) => Math.abs(a),
  round: ([a, b]) => (b === undefined ? Math.round(a) : Number(a.toFixed(b))),
  floor: ([a]) => Math.floor(a),
  ceil: ([a]) => Math.ceil(a),
  min: (args) => Math.min(...args),
  max: (args) => Math.max(...args),
  log: ([a]) => Math.log10(a),
  ln: ([a]) => Math.log(a),
  sin: ([a]) => Math.sin(a),
  cos: ([a]) => Math.cos(a),
  tan: ([a]) => Math.tan(a),
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

function tokenize(input: string): Token[] | null {
  const s = input.replace(/,/g, '')
  const tokens: Token[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === ' ') {
      i += 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < s.length && /[0-9._]/.test(s[j])) j += 1
      const raw = s.slice(i, j).replace(/_/g, '')
      const value = Number(raw)
      if (!Number.isFinite(value)) return null
      tokens.push({ type: 'num', value })
      i = j
      continue
    }
    if (/[a-zA-Z]/.test(ch)) {
      let j = i
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j += 1
      tokens.push({ type: 'ident', value: s.slice(i, j).toLowerCase() })
      i = j
      continue
    }
    if ('+-*/%^()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch === '×' ? '*' : ch === '÷' ? '/' : ch })
      i += 1
      continue
    }
    // normalize common unicode operators before tokenizing
    return null
  }
  return tokens
}

/** Normalise pretty operators/whitespace so "12 × 3" works. */
function normalize(input: string): string {
  return input
    .replace(/[×✕]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/\*\*/g, '^')
    .trim()
}

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++]
  }

  private matchOp(value: string): boolean {
    const t = this.peek()
    if (t && t.type === 'op' && t.value === value) {
      this.pos += 1
      return true
    }
    return false
  }

  parseExpression(): number {
    let left = this.parseTerm()
    for (;;) {
      if (this.matchOp('+')) left += this.parseTerm()
      else if (this.matchOp('-')) left -= this.parseTerm()
      else return left
    }
  }

  private parseTerm(): number {
    let left = this.parseFactor()
    for (;;) {
      if (this.matchOp('*')) left *= this.parseFactor()
      else if (this.matchOp('/')) left /= this.parseFactor()
      else if (this.matchOp('%')) left %= this.parseFactor()
      else return left
    }
  }

  private parseFactor(): number {
    const base = this.parseUnary()
    if (this.matchOp('^')) return base ** this.parseFactor()
    return base
  }

  private parseUnary(): number {
    if (this.matchOp('-')) return -this.parseUnary()
    if (this.matchOp('+')) return this.parseUnary()
    return this.parsePrimary()
  }

  private parsePrimary(): number {
    const token = this.next()
    if (!token) throw new Error('unexpected end')
    if (token.type === 'num') return token.value
    if (token.type === 'ident') {
      if (token.value in CONSTANTS) {
        const value = CONSTANTS[token.value]
        if (this.matchOp('(')) {
          if (!this.matchOp(')')) throw new Error('bad constant call')
        }
        return value
      }
      const fn = FUNCTIONS[token.value]
      if (!fn) throw new Error(`unknown name ${token.value}`)
      if (!this.matchOp('(')) throw new Error('expected ( after function')
      const args: number[] = []
      if (!this.matchOp(')')) {
        args.push(this.parseExpression())
        while (this.matchOp(',')) args.push(this.parseExpression())
        if (!this.matchOp(')')) throw new Error('missing )')
      }
      return fn(args)
    }
    if (token.type === 'op' && token.value === '(') {
      const value = this.parseExpression()
      if (!this.matchOp(')')) throw new Error('missing )')
      return value
    }
    throw new Error('unexpected token')
  }

  get done(): boolean {
    return this.pos >= this.tokens.length
  }
}

function format(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return value.toLocaleString()
  const rounded = Number(value.toFixed(10))
  return String(rounded)
}

/** Evaluate an expression, or return null when it is not valid arithmetic. */
export function evaluate(raw: string): CalcResult | null {
  const expression = normalize(raw)
  if (!expression) return null
  // ignore things that are clearly prose and not arithmetic: require a digit
  if (!/\d/.test(expression)) return null
  try {
    const tokens = tokenize(expression)
    if (!tokens || !tokens.length) return null
    // require at least one operator so plain "42" stays a search term
    const hasOperator = tokens.some((t) => t.type === 'op') || tokens.some((t) => t.type === 'ident' && t.value in FUNCTIONS)
    if (!hasOperator) return null
    const parser = new Parser(tokens)
    const value = parser.parseExpression()
    if (!parser.done || !Number.isFinite(value)) return null
    return { value, expression, display: format(value) }
  } catch {
    return null
  }
}
