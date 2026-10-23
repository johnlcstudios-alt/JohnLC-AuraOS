export interface Wallpaper {
  id: string
  name: string
  /** css class applied to the wallpaper layer */
  className: string
  /** supports the drifting "live" layer */
  live: boolean
  /** preview swatch for the picker */
  swatch: string
  dark?: boolean
}

export const WALLPAPERS: Wallpaper[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    className: 'wp-aurora',
    live: true,
    swatch: 'radial-gradient(circle at 30% 20%, #3b1e6e, #0f4c81 60%, #090a14)',
    dark: true,
  },
  {
    id: 'mesh',
    name: 'Nebula Mesh',
    className: 'wp-mesh',
    live: true,
    swatch: 'radial-gradient(circle at 25% 25%, #ff8ab5, #7c5cff 55%, #22d3ee)',
    dark: true,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    className: 'wp-sunset',
    live: true,
    swatch: 'radial-gradient(circle at 30% 75%, #ff7a45, #ff3d81 55%, #150a18)',
    dark: true,
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    className: 'wp-ocean',
    live: true,
    swatch: 'radial-gradient(circle at 25% 20%, #0ea5e9, #14b8a6 60%, #04121f)',
    dark: true,
  },
  {
    id: 'graphite',
    name: 'Graphite',
    className: 'wp-graphite',
    live: false,
    swatch: 'linear-gradient(150deg, #16181d, #3a3f4b)',
    dark: true,
  },
  {
    id: 'paper',
    name: 'Paper',
    className: 'wp-paper',
    live: false,
    swatch: 'linear-gradient(150deg, #ffffff, #dbe7ff)',
    dark: false,
  },
]

export const DEFAULT_WALLPAPER = 'aurora'

export function wallpaperById(id: string): Wallpaper | undefined {
  return WALLPAPERS.find((w) => w.id === id)
}
