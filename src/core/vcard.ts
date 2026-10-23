export interface VCardPhone {
  label: string
  value: string
}

export interface VCardEmail {
  label: string
  value: string
}

/** Address-book entry, in the shape a vCard 3.0 subset can round-trip. */
export interface VCardData {
  uid: string
  firstName: string
  lastName: string
  org: string
  jobTitle: string
  phones: VCardPhone[]
  emails: VCardEmail[]
  /** free-form single-line address */
  address: string
  /** YYYY-MM-DD */
  birthday: string
  notes: string
}

export function emptyCard(uid: string): VCardData {
  return {
    uid,
    firstName: '',
    lastName: '',
    org: '',
    jobTitle: '',
    phones: [],
    emails: [],
    address: '',
    birthday: '',
    notes: '',
  }
}

export function fullName(card: Pick<VCardData, 'firstName' | 'lastName'>): string {
  const name = `${card.firstName} ${card.lastName}`.trim()
  return name
}

function fold(line: string): string {
  if (line.length <= 73) return line
  const parts: string[] = [line.slice(0, 73)]
  let rest = line.slice(73)
  while (rest.length) {
    parts.push(` ${rest.slice(0, 72)}`)
    rest = rest.slice(72)
  }
  return parts.join('\r\n')
}

export function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function unescapeValue(value: string): string {
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

/** Human label for a TYPE parameter list (CELL → Mobile, WORK,FAX → Work Fax). */
function labelFor(params: Record<string, string>): string {
  const type = (params.TYPE ?? params.type ?? '').split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
  if (!type.length || type.includes('CELL') || type.includes('VOICE')) {
    return type.includes('WORK') ? 'Work' : type.includes('HOME') ? 'Home' : 'Mobile'
  }
  const named = type.filter((t) => !['PREF', 'INTERNET', 'HOME'].includes(t))
  const raw = (named.length ? named : type).join(' ')
  return raw
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/** Parse every vCard in a document (a single export can hold many). */
export function parseVcards(text: string, makeUid: () => string): VCardData[] {
  const lines = unfold(text)
  const cards: VCardData[] = []
  let current: VCardData | null = null
  let inCard = false

  for (const line of lines) {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VCARD') {
      inCard = true
      current = emptyCard(makeUid())
      continue
    }
    if (upper === 'END:VCARD') {
      inCard = false
      if (current && (fullName(current) || current.org)) cards.push(current)
      current = null
      continue
    }
    if (!inCard || !current) continue

    const prop = parseProp(line)
    if (!prop) continue
    switch (prop.name) {
      case 'UID':
        current.uid = prop.value.trim() || current.uid
        break
      case 'N': {
        const parts = prop.value.split(';')
        current.lastName = unescapeValue(parts[0] ?? '')
        current.firstName = unescapeValue(parts[1] ?? '')
        break
      }
      case 'FN': {
        if (!fullName(current)) {
          const parts = unescapeValue(prop.value).trim().split(/\s+/)
          current.firstName = parts.slice(0, -1).join(' ') || parts[0] || ''
          current.lastName = parts.length > 1 ? (parts[parts.length - 1] ?? '') : ''
        }
        break
      }
      case 'ORG':
        current.org = unescapeValue(prop.value.split(';')[0] ?? '')
        break
      case 'TITLE':
        current.jobTitle = unescapeValue(prop.value)
        break
      case 'TEL':
        current.phones.push({ label: labelFor(prop.params), value: unescapeValue(prop.value).trim() })
        break
      case 'EMAIL':
        current.emails.push({ label: labelFor(prop.params), value: unescapeValue(prop.value).trim() })
        break
      case 'ADR': {
        const parts = prop.value.split(';').map((p) => unescapeValue(p).trim())
        current.address = [parts[2], parts[3], parts[4], parts[5], parts[6]].filter(Boolean).join(', ')
        break
      }
      case 'BDAY': {
        const raw = prop.value.trim()
        const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
        const compact = /^(\d{4})(\d{2})(\d{2})/.exec(raw)
        if (iso) current.birthday = `${iso[1]}-${iso[2]}-${iso[3]}`
        else if (compact) current.birthday = `${compact[1]}-${compact[2]}-${compact[3]}`
        break
      }
      case 'NOTE':
        current.notes = unescapeValue(prop.value)
        break
      default:
        break
    }
  }

  return cards
}

/** Serialise one entry as a vCard 3.0 document. */
export function serializeVcard(card: VCardData): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0']
  lines.push(`UID:${card.uid}`)
  lines.push(`N:${escapeValue(card.lastName)};${escapeValue(card.firstName)};;;`)
  lines.push(`FN:${escapeValue(fullName(card) || card.org || 'Unknown')}`)
  if (card.org) lines.push(`ORG:${escapeValue(card.org)}`)
  if (card.jobTitle) lines.push(`TITLE:${escapeValue(card.jobTitle)}`)
  for (const phone of card.phones) {
    if (phone.value) lines.push(`TEL;TYPE=${phone.label.toUpperCase().replace(/\s+/g, ',')}:${escapeValue(phone.value)}`)
  }
  for (const email of card.emails) {
    if (email.value) lines.push(`EMAIL;TYPE=${email.label.toUpperCase().replace(/\s+/g, ',')}:${escapeValue(email.value)}`)
  }
  if (card.address) lines.push(`ADR;TYPE=HOME:;;${escapeValue(card.address)};;;;`)
  if (card.birthday) lines.push(`BDAY:${card.birthday}`)
  if (card.notes) lines.push(`NOTE:${escapeValue(card.notes)}`)
  lines.push('END:VCARD')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Serialise a whole address book into a single multi-vCard document. */
export function serializeVcardBook(cards: VCardData[]): string {
  return cards.map((card) => serializeVcard(card)).join('')
}
