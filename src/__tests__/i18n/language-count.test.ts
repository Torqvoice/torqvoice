import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The sign-in page promises a number of languages. It counts the locales the
 * app ships, so adding one updates the claim or fails here: it said 12 for
 * weeks after European Portuguese made it 13.
 */
const ROOT = path.join(process.cwd(), 'messages')
const LOCALES = fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory())

describe('the sign-in page language count', () => {
  it.each(LOCALES)('%s names as many languages as the app ships', (locale) => {
    const auth = JSON.parse(fs.readFileSync(path.join(ROOT, locale, 'auth.json'), 'utf-8'))
    const claim: string = auth.pitch.proof.languages
    expect(claim.match(/\d+/)?.[0]).toBe(String(LOCALES.length))
  })
})
