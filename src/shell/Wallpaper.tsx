import type { CSSProperties } from 'react'
import { useTheme } from '../core/hooks'
import { wallpaperById } from '../core/theme/wallpapers'

/**
 * Wallpaper layer: CSS gradient presets (optionally "live" with drifting light),
 * or a user-picked image loaded through the bridge as a data URL.
 */
export function Wallpaper() {
  const themeState = useTheme()
  const custom = themeState.customWallpaperData
  const preset = wallpaperById(themeState.wallpaper)

  const style: CSSProperties = custom ? { backgroundImage: `url("${custom}")` } : {}

  return (
    <div
      className={`wallpaper ${custom ? '' : (preset?.className ?? 'wp-aurora')}`}
      data-live={themeState.liveWallpaper && (custom ? true : (preset?.live ?? false)) ? 'true' : 'false'}
      data-wallpaper={custom ? 'custom' : themeState.wallpaper}
      style={style}
      aria-hidden
    />
  )
}
