import { mkdirSync, writeFileSync } from 'fs'
import { deflateSync } from 'zlib'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources')
mkdirSync(outDir, { recursive: true })

const ICON_SIZES = [16, 32, 64, 128, 256, 512, 1024]

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r
}

function renderIcon(size, glyphOnly) {
  const s = size / 64
  const buf = Buffer.alloc(size * size * 4)
  const c1 = [0x63, 0x66, 0xf1]
  const c2 = [0x8b, 0x5c, 0xf6]

  const glyph = (px, py) => {
    if (sdRoundRect(px, py, 32, 27, 7, 17, 7) <= 0) return true
    const dRing = sdCircle(px, py, 32, 45, 15)
    if (py >= 45 && dRing <= 0 && sdCircle(px, py, 32, 45, 20) > 0) return true
    if (Math.hypot(px - 12, py - 45) <= 4) return true
    if (Math.hypot(px - 52, py - 45) <= 4) return true
    if (sdRoundRect(px, py, 32, 58, 10, 2, 2.5) <= 0) return true
    return false
  }

  const base = (px, py) => sdRoundRect(px, py, 32, 32, 32, 32, 14) <= 0

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / s
      const py = (y + 0.5) / s
      const idx = (y * size + x) * 4
      if (!base(px, py)) continue
      const t = Math.min(1, Math.max(0, (px + py) / 128))
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * t)
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * t)
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * t)
      if (glyphOnly) {
        if (glyph(px, py)) {
          buf[idx] = 0
          buf[idx + 1] = 0
          buf[idx + 2] = 0
          buf[idx + 3] = 255
        } else {
          buf[idx] = 0
          buf[idx + 1] = 0
          buf[idx + 2] = 0
          buf[idx + 3] = 0
        }
      } else {
        buf[idx] = glyph(px, py) ? 255 : r
        buf[idx + 1] = glyph(px, py) ? 255 : g
        buf[idx + 2] = glyph(px, py) ? 255 : b
        buf[idx + 3] = 255
      }
    }
  }
  return encodePng(size, size, buf)
}

function encodePng(width, height, rgba) {
  const crcTable = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    return table
  })()

  function crc32(buf) {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([len, typeBuf, data, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

for (const size of ICON_SIZES) {
  writeFileSync(join(outDir, `icon-${size}.png`), renderIcon(size, false))
}

writeFileSync(join(outDir, 'trayTemplate.png'), renderIcon(16, true))
writeFileSync(join(outDir, 'trayTemplate@2x.png'), renderIcon(32, true))
writeFileSync(join(outDir, 'icon.png'), renderIcon(1024, false))

console.log('Icons written to', outDir)
