import { clipboard, nativeImage } from 'electron'

/**
 * Thin wrapper over Electron's clipboard. Images are exchanged as PNG data-urls
 * so the renderer can preview them and drop them straight into <img> tags.
 */
export const clipboardService = {
  readText(): string {
    return clipboard.readText()
  },

  writeText(text: string): void {
    clipboard.writeText(text)
  },

  readImage(): string | null {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    return image.toDataURL()
  },

  writeImage(dataUrl: string): void {
    const image = nativeImage.createFromDataURL(dataUrl)
    if (image.isEmpty()) throw new Error('Clipboard image was empty')
    clipboard.writeImage(image)
  },
}
