/**
 * Generates square PWA / favicon PNGs from the workshop logo.
 * The design asset is often a JPEG with a fake checkerboard or flat grey
 * border; we flood-fill similar neutral pixels from the image edges so the
 * tab icon blends on dark UI without a white box.
 *
 * Run: pnpm run icons:generate
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const src = path.join(root, 'design-assets', 'logo-taller-el-moni.jpg')
const iconsDir = path.join(root, 'public', 'icons')
const appDir = path.join(root, 'src', 'app')

const transparent = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * @param {Buffer} rgb
 * @param {number} width
 * @param {number} height
 * @param {number} channels
 */
function rgbaWithEdgeFloodTransparency(rgb, width, height, channels) {
  const isBorderBackground = (r, g, b) => {
    const M = Math.max(r, g, b)
    const m = Math.min(r, g, b)
    if (M - m > 22) return false
    return (r + g + b) / 3 >= 135
  }

  const idx = (x, y) => (y * width + x) * channels
  const visited = new Uint8Array(width * height)
  /** @type {number[]} */
  const queue = []

  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const p = y * width + x
    if (visited[p]) return
    const i = idx(x, y)
    const r = rgb[i]
    const g = rgb[i + 1]
    const b = rgb[i + 2]
    if (!isBorderBackground(r, g, b)) return
    visited[p] = 1
    queue.push(x, y)
  }

  for (let x = 0; x < width; x++) {
    tryPush(x, 0)
    tryPush(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y)
    tryPush(width - 1, y)
  }

  let qi = 0
  while (qi < queue.length) {
    const x = queue[qi++]
    const y = queue[qi++]
    tryPush(x - 1, y)
    tryPush(x + 1, y)
    tryPush(x, y - 1)
    tryPush(x, y + 1)
  }

  const out = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const si = idx(x, y)
      const di = p * 4
      out[di] = rgb[si]
      out[di + 1] = rgb[si + 1]
      out[di + 2] = rgb[si + 2]
      out[di + 3] = visited[p] ? 0 : 255
    }
  }
  return out
}

async function loadSourceRgba() {
  const meta = await sharp(src).metadata()
  if (meta.hasAlpha) {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    if (info.channels !== 4) {
      throw new Error(`Expected 4-channel RGBA, got ${info.channels}`)
    }
    return { rgba: data, width: info.width, height: info.height }
  }

  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 3) {
    throw new Error(`Expected 3-channel RGB without alpha, got ${info.channels}`)
  }
  return {
    rgba: rgbaWithEdgeFloodTransparency(data, info.width, info.height, info.channels),
    width: info.width,
    height: info.height,
  }
}

/**
 * @param {Buffer} rgba
 * @param {number} width
 * @param {number} height
 * @param {number} size
 * @param {string} outPath
 */
async function squarePng(rgba, width, height, size, outPath) {
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .resize(size, size, {
      fit: 'contain',
      position: 'centre',
      background: transparent,
    })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(outPath)
}

async function main() {
  await mkdir(iconsDir, { recursive: true })
  await mkdir(appDir, { recursive: true })

  const { rgba, width, height } = await loadSourceRgba()

  await squarePng(rgba, width, height, 16, path.join(iconsDir, 'favicon-16x16.png'))
  await squarePng(rgba, width, height, 32, path.join(iconsDir, 'favicon-32x32.png'))
  await squarePng(rgba, width, height, 180, path.join(iconsDir, 'apple-touch-icon.png'))
  await squarePng(rgba, width, height, 192, path.join(iconsDir, 'icon-192.png'))
  await squarePng(rgba, width, height, 512, path.join(iconsDir, 'icon-512.png'))
  await squarePng(rgba, width, height, 32, path.join(appDir, 'icon.png'))

  console.log('PWA icons generated from', src)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
