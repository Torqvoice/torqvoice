import { describe, expect, it } from 'vitest'
import {
  ffmpegInputFormat,
  isDeclaredVideo,
  sniffDeclaredVideo,
  sniffVideoContainer,
} from '@/lib/video-sniff'

/** The opening box of an ISO base media file: size, "ftyp", brand, version. */
function mp4Header(brand = 'isom'): Uint8Array {
  const bytes = new Uint8Array(32)
  bytes.set([0x00, 0x00, 0x00, 0x20], 0)
  bytes.set(new TextEncoder().encode(`ftyp${brand}`), 4)
  return bytes
}

/** The EBML header WebM and Matroska files open with. */
function webmHeader(): Uint8Array {
  const bytes = new Uint8Array(32)
  bytes.set([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01], 0)
  return bytes
}

const text = (value: string) => new TextEncoder().encode(value)

const PLAYLIST = text(
  '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\nfile:///proc/self/environ\n#EXT-X-ENDLIST\n'
)
const CONCAT = text("ffconcat version 1.0\nfile '/proc/self/environ'\n")

describe('sniffVideoContainer', () => {
  it('reads an MP4 from the ftyp box at byte 4', () => {
    expect(sniffVideoContainer(mp4Header())).toBe('mp4')
  })

  it('reads a QuickTime file the same way', () => {
    expect(sniffVideoContainer(mp4Header('qt  '))).toBe('mp4')
  })

  it('reads a WebM from the EBML header', () => {
    expect(sniffVideoContainer(webmHeader())).toBe('webm')
  })

  it('refuses an HLS playlist and a concat script', () => {
    expect(sniffVideoContainer(PLAYLIST)).toBeNull()
    expect(sniffVideoContainer(CONCAT)).toBeNull()
  })

  it('refuses an empty buffer and one too short to hold a header', () => {
    expect(sniffVideoContainer(new Uint8Array(0))).toBeNull()
    expect(sniffVideoContainer(mp4Header().slice(0, 8))).toBeNull()
  })
})

describe('sniffDeclaredVideo', () => {
  it('accepts bytes that are the container the type promises', () => {
    expect(sniffDeclaredVideo('video/mp4', mp4Header())).toBe('mp4')
    expect(sniffDeclaredVideo('video/quicktime', mp4Header('qt  '))).toBe('mp4')
    expect(sniffDeclaredVideo('video/webm', webmHeader())).toBe('webm')
  })

  it('refuses a playlist declared as video/mp4', () => {
    expect(sniffDeclaredVideo('video/mp4', PLAYLIST)).toBeNull()
  })

  it('refuses a container other than the one declared', () => {
    expect(sniffDeclaredVideo('video/mp4', webmHeader())).toBeNull()
    expect(sniffDeclaredVideo('video/webm', mp4Header())).toBeNull()
  })

  it('refuses a video type no route accepts', () => {
    expect(sniffDeclaredVideo('video/x-matroska', webmHeader())).toBeNull()
    expect(sniffDeclaredVideo('application/vnd.apple.mpegurl', PLAYLIST)).toBeNull()
  })

  it('refuses an empty buffer', () => {
    expect(sniffDeclaredVideo('video/mp4', new Uint8Array(0))).toBeNull()
  })
})

describe('isDeclaredVideo', () => {
  it('is true for video types only', () => {
    expect(isDeclaredVideo('video/mp4')).toBe(true)
    expect(isDeclaredVideo('image/png')).toBe(false)
    expect(isDeclaredVideo('text/plain')).toBe(false)
  })
})

describe('ffmpegInputFormat', () => {
  it('pins the demuxer that matches the sniffed container', () => {
    expect(ffmpegInputFormat('mp4')).toBe('mov')
    expect(ffmpegInputFormat('webm')).toBe('matroska')
  })
})
