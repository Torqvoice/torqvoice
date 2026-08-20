import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  TIRE_MESSAGE_REASONS,
  interpolate,
  reasonForCondition,
  type MessageVariables,
} from '@/features/tire-hotel/Lib/messageTemplates'

/**
 * Message templates carry `{placeholders}` that the composer substitutes
 * itself. Two things can silently break them: a translator inventing a name
 * the caller never supplies, and next-intl parsing the braces as ICU
 * arguments before the composer sees the string. The first is caught here;
 * the second is why the dialog reads these with `t.raw`.
 */

const ROOT = process.cwd()
const LOCALES = fs
  .readdirSync(path.join(ROOT, 'messages'))
  .filter((entry) => fs.statSync(path.join(ROOT, 'messages', entry)).isDirectory())

/** Everything the composer is able to fill in. */
const SUPPLIED: MessageVariables = {
  customer_name: 'Hansen',
  vehicle: 'Volvo XC60',
  plate: 'EK46936',
  season: 'winter',
  size: '225/45R17',
  tread: '3.2 mm',
  positions: 'front left, front right',
  shop_name: 'Nordic Dekk',
  shelf: 'B-04-2',
}

function templatesFor(locale: string) {
  const messaging = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'messages', locale, 'tireHotel.json'), 'utf-8')
  ).messaging as { subjects: Record<string, string>; bodies: Record<string, string> }
  return messaging
}

describe('interpolate', () => {
  it('substitutes what it is given', () => {
    expect(interpolate('Hi {customer_name}', SUPPLIED)).toBe('Hi Hansen')
  })

  it('leaves an unknown placeholder visible rather than dropping it', () => {
    // A typo in a shop's own wording should show up as itself, not vanish
    // into a sentence that reads fine and says the wrong thing.
    expect(interpolate('Hi {nope}', SUPPLIED)).toBe('Hi {nope}')
  })

  it('handles a template with no placeholders', () => {
    expect(interpolate('Your tires are ready', SUPPLIED)).toBe('Your tires are ready')
  })
})

describe('message templates', () => {
  it.each(LOCALES)('%s defines every reason', (locale) => {
    const { subjects, bodies } = templatesFor(locale)
    for (const reason of TIRE_MESSAGE_REASONS) {
      expect(subjects[reason], `${locale} has no subject for ${reason}`).toBeTruthy()
      expect(bodies[reason], `${locale} has no body for ${reason}`).toBeTruthy()
    }
  })

  it.each(LOCALES)('%s only uses placeholders the composer supplies', (locale) => {
    const { subjects, bodies } = templatesFor(locale)

    for (const reason of TIRE_MESSAGE_REASONS) {
      for (const [kind, template] of [
        ['subject', subjects[reason]],
        ['body', bodies[reason]],
      ] as const) {
        const rendered = interpolate(template, SUPPLIED)
        const leftover = rendered.match(/\{(\w+)\}/g)
        expect(
          leftover,
          `${locale} ${reason} ${kind} uses ${leftover?.join(', ')}, which nothing fills in`
        ).toBeNull()
      }
    }
  })

  it.each(LOCALES)('%s keeps the low-tread message specific', (locale) => {
    // The whole point of this one is that it names the reading. A translation
    // that drops the measurement turns a sales prompt into a vague nudge.
    const { bodies } = templatesFor(locale)
    expect(bodies.low_tread, `${locale} low_tread should cite the tread`).toContain('{tread}')
    expect(bodies.low_tread, `${locale} low_tread should name the customer`).toContain(
      '{customer_name}'
    )
  })
})

describe('reason for a reading', () => {
  it('treats a worn set as the one worth a message', () => {
    expect(reasonForCondition('replace')).toBe('low_tread')
  })

  it('does not chase a set that is merely close', () => {
    // Worth mentioning at pickup, not worth an unprompted message.
    expect(reasonForCondition('fair')).toBe('stored')
    expect(reasonForCondition('good')).toBe('stored')
    expect(reasonForCondition(null)).toBe('stored')
  })
})
