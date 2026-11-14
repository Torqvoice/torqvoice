/**
 * How many SMS a text is sent, and billed, as. The compose dialog shows this
 * number and the platform SMS allowance counts in it.
 */

import { describe, expect, it } from 'vitest'
import { smsSegmentCount } from '@/lib/sms-segments'

describe('how many SMS a text is sent as', () => {
  it('is none for an empty text', () => {
    expect(smsSegmentCount('')).toBe(0)
  })

  it('is one for up to 160 plain characters', () => {
    expect(smsSegmentCount('Your car is ready for pickup.')).toBe(1)
    expect(smsSegmentCount('a'.repeat(160))).toBe(1)
  })

  it('splits a longer plain text into parts of 153', () => {
    expect(smsSegmentCount('a'.repeat(161))).toBe(2)
    expect(smsSegmentCount('a'.repeat(306))).toBe(2)
    expect(smsSegmentCount('a'.repeat(307))).toBe(3)
  })

  it('treats Norwegian and German letters as plain', () => {
    expect(smsSegmentCount(`Bilen er klar på verkstedet, hilsen Øyvind ${'å'.repeat(110)}`)).toBe(1)
    expect(smsSegmentCount('ä'.repeat(160))).toBe(1)
  })

  it('counts the euro sign and brackets as two characters each', () => {
    expect(smsSegmentCount('€'.repeat(80))).toBe(1)
    expect(smsSegmentCount('€'.repeat(81))).toBe(2)
  })

  it('drops to 70 characters once the text has an emoji or another script', () => {
    expect(smsSegmentCount(`${'a'.repeat(68)}🚗`)).toBe(1)
    expect(smsSegmentCount(`${'a'.repeat(69)}🚗`)).toBe(2)
    expect(smsSegmentCount('Ваш автомобиль готов')).toBe(1)
    expect(smsSegmentCount('я'.repeat(71))).toBe(2)
    expect(smsSegmentCount('я'.repeat(135))).toBe(3)
  })
})
