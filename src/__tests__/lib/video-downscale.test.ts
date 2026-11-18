import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/files/manager', () => ({
  discardUnsavedUpload: vi.fn(),
  releaseFiles: vi.fn(),
}))

import { downscaleArgs, needsDownscale, parseProbedSize } from '@/lib/video-downscale'

describe('needsDownscale', () => {
  it('leaves 1080p alone, whichever way the phone was held', () => {
    expect(needsDownscale(1920, 1080)).toBe(false)
    expect(needsDownscale(1080, 1920)).toBe(false)
    expect(needsDownscale(1280, 720)).toBe(false)
  })

  it('catches 4K and 1440p in both orientations', () => {
    expect(needsDownscale(3840, 2160)).toBe(true)
    expect(needsDownscale(2160, 3840)).toBe(true)
    expect(needsDownscale(2560, 1440)).toBe(true)
  })
})

describe('parseProbedSize', () => {
  it('reads the size ffprobe prints', () => {
    expect(parseProbedSize('3840x2160\n')).toEqual({ width: 3840, height: 2160 })
  })

  it('reads the first line when a stream prints side data after it', () => {
    expect(parseProbedSize('1920x1080\n\n')).toEqual({ width: 1920, height: 1080 })
  })

  it('has no size for anything else', () => {
    expect(parseProbedSize('')).toBeNull()
    expect(parseProbedSize('N/A')).toBeNull()
    expect(parseProbedSize('0x0')).toBeNull()
  })
})

describe('downscaleArgs', () => {
  const args = downscaleArgs('/uploads/in.mov', 'mp4', '/uploads/out.mp4')

  it('pins the demuxer and opens local files only', () => {
    expect(args.slice(0, 7)).toEqual([
      '-nostdin',
      '-protocol_whitelist',
      'file,crypto',
      '-f',
      'mov',
      '-i',
      '/uploads/in.mov',
    ])
  })

  it('scales the shorter side to 1080 so an upright clip stays upright', () => {
    const filter = args[args.indexOf('-vf') + 1]
    expect(filter).toBe("scale='if(gt(iw,ih),-2,1080)':'if(gt(iw,ih),1080,-2)'")
  })

  it('keeps picture and sound and nothing else', () => {
    expect(args).toContain('-sn')
    expect(args).toContain('-dn')
    expect(args.filter((arg) => arg === '-map')).toHaveLength(2)
  })

  it('writes the output last', () => {
    expect(args.at(-1)).toBe('/uploads/out.mp4')
  })
})
