export interface IcsEvent {
  uid: string
  summary: string
  description: string
  location: string
  /** epoch ms */
  start: number
  /** epoch ms (exclusive for all-day events) */
  end: number
  allDay: boolean
}

/** RFC 5545 line folding: 75 octets per line, continuations start with a space. */
function fold(line: string): string {
  if (line.length <= 73) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 73))
  rest = rest.slice(73)
  while (rest.length) {
    parts.push(` ${rest.slice(0, 72)}`)
    rest = rest.slice(72)
  }
  return parts.join('\r\n')
}

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function unescapeText(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = value[i + 1]
    i += 1
    if (next === 'n' || next === 'N') out += '\n'
    else if (next === undefined) out += '\\'
    else out += next
  }
  return out
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Local floating date-time, `YYYYMMDDTHHMMSS` (no timezone, valid for VCALENDAR). */
export function formatStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

export function formatDateOnly(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

/** `YYYY-MM-DD` in local time (for `<input type="date">`). */
export function toDateInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** `YYYY-MM-DDTHH:MM` in local time (for `datetime-local`). */
export function formatLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function parseDateOnly(value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
}

export function parseStamp(value: string): number | null {
  const raw = value.trim()
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(raw)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (!h) return new Date(Number(y), Number(mo) - 1, Number(d)).getTime()
  if (z) {
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0'))
  }
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0')).getTime()
}

/** Unfold logical lines (drops continuation whitespace). */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const lines: string[] = []
  for (const line of raw) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (lines.length) lines[lines.length - 1] += line.slice(1)
      continue
    }
    lines.push(line)
  }
  return lines
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

/** `DTSTART;TZID=Europe/Paris:20260118T140000` → name/params/value. */
function parseProp(line: string): Prop | null {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const segments = head.split(';')
  const name = segments[0].toUpperCase()
  const params: Record<string, string> = {}
  for (const seg of segments.slice(1)) {
    const eq = seg.indexOf('=')
    if (eq < 0) continue
    params[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1)
  }
  return { name, params, value }
}

function addDays(ms: number, days: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/** Parse every VEVENT in a VCALENDAR document. Unknown properties are ignored. */
export function parseIcs(text: string): IcsEvent[] {
  const lines = unfold(text)
  const events: IcsEvent[] = []
  let current: Partial<IcsEvent> | null = null
  let inEvent = false

  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper.startsWith('BEGIN:VEVENT')) {
      inEvent = true
      current = {}
      continue
    }
    if (upper.startsWith('END:VEVENT')) {
      inEvent = false
      if (current && current.start !== undefined) {
        const allDay = current.allDay === true
        const end = current.end ?? (allDay ? addDays(current.start, 1) : current.start + 3600_000)
        events.push({
          uid: current.uid ?? `imported-${Math.random().toString(36).slice(2, 10)}`,
          summary: current.summary ?? '(untitled)',
          description: current.description ?? '',
          location: current.location ?? '',
          start: current.start,
          end: end > current.start ? end : current.start + 3600_000,
          allDay,
        })
      }
      current = null
      continue
    }
    if (!inEvent || !current) continue

    const prop = parseProp(line)
    if (!prop) continue
    switch (prop.name) {
      case 'UID':
        current.uid = prop.value.trim()
        break
      case 'SUMMARY':
        current.summary = unescapeText(prop.value)
        break
      case 'DESCRIPTION':
        current.description = unescapeText(prop.value)
        break
      case 'LOCATION':
        current.location = unescapeText(prop.value)
        break
      case 'DTSTART': {
        const stamp = prop.params.VALUE === 'DATE' ? parseDateOnly(prop.value) : parseStamp(prop.value)
        if (stamp !== null) {
          current.start = stamp
          current.allDay = prop.params.VALUE === 'DATE' || !prop.value.includes('T')
        }
        break
      }
      case 'DTEND': {
        const stamp = prop.params.VALUE === 'DATE' ? parseDateOnly(prop.value) : parseStamp(prop.value)
        if (stamp !== null) current.end = stamp
        break
      }
      default:
        break
    }
  }

  return events.sort((a, b) => a.start - b.start)
}

/** Serialise events into a standalone VCALENDAR document. */
export function serializeIcs(events: IcsEvent[], calendarName = 'AuraOS Calendar'): string {
  const stamp = formatStamp(Date.now())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JohnLC AuraOS//Calendar 1.0//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]

  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.uid}`)
    lines.push(`DTSTAMP:${stamp}`)
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.start)}`)
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(event.end > event.start ? event.end : addDays(event.start, 1))}`)
    } else {
      lines.push(`DTSTART:${formatStamp(event.start)}`)
      lines.push(`DTEND:${formatStamp(event.end > event.start ? event.end : event.start + 3600_000)}`)
    }
    lines.push(`SUMMARY:${escapeText(event.summary || '(untitled)')}`)
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
