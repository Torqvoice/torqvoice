/**
 * A request sent from the booking page starts with the quick choice the
 * customer picked, then a blank line, then their own words. Shown as one
 * paragraph the two ran together; every screen sets the choice apart.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REQUEST_TOPIC_LABELS } from '@/features/portal/Lib/requestTopics'
import { locales } from '@/i18n/config'
import { requestTitle, splitRequestText } from '@/features/portal/Lib/requestText'

describe('what a customer asked for, taken apart', () => {
  it('sets the quick choice apart from the words after it', () => {
    expect(
      splitRequestText('Something is wrong\n\nA knocking noise from the front left over bumps.')
    ).toEqual({
      topic: 'Something is wrong',
      body: 'A knocking noise from the front left over bumps.',
    })
  })

  it('keeps the line breaks the customer typed in their own words', () => {
    expect(splitRequestText('Tyre change\n\nWinter set.\n\nThey are in your tyre hotel.')).toEqual({
      topic: 'Tyre change',
      body: 'Winter set.\n\nThey are in your tyre hotel.',
    })
  })

  it('is the words alone when there is no choice to set apart', () => {
    expect(splitRequestText('Could you check the wiper blades?')).toEqual({
      topic: null,
      body: 'Could you check the wiper blades?',
    })
    // A choice with nothing after it is the whole request.
    expect(splitRequestText('Service')).toEqual({ topic: null, body: 'Service' })
    // One line break is a sentence going on, not a choice.
    expect(splitRequestText('Brakes squeal\nmostly when cold')).toEqual({
      topic: null,
      body: 'Brakes squeal\nmostly when cold',
    })
    expect(splitRequestText(null)).toEqual({ topic: null, body: '' })
  })

  it('does not take a first paragraph the customer wrote themselves for a choice', () => {
    // The form allows several paragraphs with nothing picked.
    const own = 'Brakes squeal.\n\nOnly when cold.'
    expect(splitRequestText(own)).toEqual({ topic: null, body: own })
    expect(requestTitle(own)).toBe('Brakes squeal. Only when cold.')
    const nearly = 'something is wrong\n\nA knocking noise.'
    expect(splitRequestText(nearly)).toEqual({ topic: null, body: nearly })
  })

  it('knows the quick choices in every language the portal speaks', () => {
    expect(splitRequestText('Noe er galt\n\nDet banker foran.')).toEqual({
      topic: 'Noe er galt',
      body: 'Det banker foran.',
    })
    // Straight from the message files, for every locale and every choice.
    for (const locale of locales) {
      const file = join(process.cwd(), 'messages', locale, 'portal.json')
      const topics: Record<string, string> = JSON.parse(readFileSync(file, 'utf8')).book.topics
      expect(Object.keys(topics).length).toBeGreaterThan(0)
      for (const label of Object.values(topics)) {
        expect(REQUEST_TOPIC_LABELS.has(label.trim()), `${locale}: ${label}`).toBe(true)
      }
    }
  })
})

describe('the title of the work order made from a request', () => {
  it('is one line with the choice set off from the words', () => {
    expect(requestTitle('Brakes\n\nSquealing when cold.')).toBe('Brakes: Squealing when cold.')
    expect(requestTitle('Could you check the wipers?')).toBe('Could you check the wipers?')
  })

  it('is cut to sixty characters', () => {
    const title = requestTitle(
      'Something is wrong\n\nA knocking noise from the front left over bumps, worse when cold.'
    )
    expect(title).toBe('Something is wrong: A knocking noise from the front left ...')
    expect(title).toHaveLength(60)
  })
})
