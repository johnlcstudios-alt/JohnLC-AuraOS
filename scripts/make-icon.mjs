/**
 * Generate the JohnLC AuraOS app/installer icon with zero dependencies.
 *
 * The artwork mirrors the inline SVG favicon in index.html: a rounded gradient
 * tile (blue -> violet) with a white ring and centre dot. Output:
 *   build/icon.png  512x512  (window icon / generic consumers)
 *   build/icon.ico  256x256  (Windows executable + NSIS installer)
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'build')

const GRADIENT_FROM = [0x6a, 0xa8, 0xff]
const GRADIENT_TO = [0xa0, 0x6b, 0xff]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(size, rgba) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0 // filter type: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Render the icon at `size` px, supersampled 4x for clean edges. */
function render(size) {
  const SS = 4
  const rgba = Buffer.alloc(size * size * 4)
  const center = size / 2
  const cornerRadius = size * 0.24
  const ringRadius = size * 0.21875
  const ringWidth = size * 0.09375
  const dotRadius = size * 0.09375

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let inside = 0
      let mark = 0

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS

          // Signed distance to a rounded square.
          const qx = Math.abs(px - center) - (center - cornerRadius)
          const qy = Math.abs(py - center) - (center - cornerRadius)
          const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - cornerRadius
          if (outside > 0) continue

          inside += 1
          const distance = Math.hypot(px - center, py - center)
          if (Math.abs(distance - ringRadius) <= ringWidth / 2 || distance <= dotRadius) mark += 1
        }
      }

      if (!inside) continue

      const offset = (y * size + x) * 4
      const t = (x / size + y / size) / 2
      let r = GRADIENT_FROM[0] + (GRADIENT_TO[0] - GRADIENT_FROM[0]) * t
      let g = GRADIENT_FROM[1] + (GRADIENT_TO[1] - GRADIENT_FROM[1]) * t
      let b = GRADIENT_FROM[2] + (GRADIENT_TO[2] - GRADIENT_FROM[2]) * t

      const white = mark / (SS * SS)
      r = r * (1 - white) + 255 * white
      g = g * (1 - white) + 255 * white
      b = b * (1 - white) + 255 * white

      rgba[offset] = Math.round(r)
      rgba[offset + 1] = Math.round(g)
      rgba[offset + 2] = Math.round(b)
      rgba[offset + 3] = Math.round((inside / (SS * SS)) * 255)
    }
  }

  return rgba
}

/** A single-image ICO containing a 256x256 PNG (supported since Vista). */
function encodeIco(png256) {
  const header = Buffer.from([0, 0, 1, 0, 1, 0]) // reserved, type=icon, count=1
  const entry = Buffer.alloc(16)
  entry[0] = 0 // width: 0 means 256
  entry[1] = 0 // height: 0 means 256
  entry[2] = 0 // palette colours
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png256.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)
  return Buffer.concat([header, entry, png256])
}

mkdirSync(OUT_DIR, { recursive: true })
const png512 = encodePng(512, render(512))
const png256 = encodePng(256, render(256))
writeFileSync(path.join(OUT_DIR, 'icon.png'), png512)
writeFileSync(path.join(OUT_DIR, 'icon.ico'), encodeIco(png256))
console.log(`icons written: build/icon.png (${png512.length} B), build/icon.ico (${png256.length + 22} B)`)
