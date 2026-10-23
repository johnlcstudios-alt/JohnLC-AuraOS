import { desktopCapturer, screen } from 'electron'
import type { DisplayInfo } from '../../shared/bridge'

/** Multi-monitor discovery and screenshot capture. */
export const screenService = {
  listDisplays(): DisplayInfo[] {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((display) => ({
      id: String(display.id),
      label: display.label || `Display ${display.id}`,
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        w: display.bounds.width,
        h: display.bounds.height,
      },
      workArea: {
        x: display.workArea.x,
        y: display.workArea.y,
        w: display.workArea.width,
        h: display.workArea.height,
      },
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      primary: display.id === primaryId,
      internal: display.internal,
    }))
  },

  async captureDisplay(id?: string): Promise<string | null> {
    const displays = screen.getAllDisplays()
    const target = id ? displays.find((d) => String(d.id) === id) : screen.getPrimaryDisplay()
    if (!target) return null
    const width = Math.min(Math.round(target.bounds.width * target.scaleFactor), 3840)
    const height = Math.min(Math.round(target.bounds.height * target.scaleFactor), 2160)

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    })
    const match = id ? sources.find((s) => s.display_id === id) : sources[0]
    if (!match) return null
    const image = match.thumbnail
    if (image.isEmpty()) return null
    return image.toDataURL()
  },
}
