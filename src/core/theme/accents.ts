export interface Accent {
  id: string
  name: string
  hex: string
  /** "r g b" for rgb(var(--accent-rgb) / a) usages */
  rgb: string
}

export const ACCENTS: Accent[] = [
  { id: 'blue', name: 'Ocean Blue', hex: '#4f8cff', rgb: '79 140 255' },
  { id: 'graphite', name: 'Graphite', hex: '#8a93a6', rgb: '138 147 166' },
  { id: 'violet', name: 'Amethyst', hex: '#a06bff', rgb: '160 107 255' },
  { id: 'pink', name: 'Flamingo', hex: '#ff5c9d', rgb: '255 92 157' },
  { id: 'red', name: 'Inferno', hex: '#ff5f57', rgb: '255 95 87' },
  { id: 'orange', name: 'Sunset', hex: '#ff9f43', rgb: '255 159 67' },
  { id: 'yellow', name: 'Honey', hex: '#f5c542', rgb: '245 197 66' },
  { id: 'green', name: 'Mint', hex: '#2ecf7f', rgb: '46 207 127' },
  { id: 'teal', name: 'Turquoise', hex: '#22c9c9', rgb: '34 201 201' },
  { id: 'indigo', name: 'Midnight', hex: '#6b7cff', rgb: '107 124 255' },
]

export const DEFAULT_ACCENT = 'blue'

export function accentById(id: string): Accent {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]
}
