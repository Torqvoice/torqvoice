import { describe, expect, it } from 'vitest'
import {
  descriptionLines,
  linesAsDescription,
  withoutRepeats,
} from '@/features/calendar/Lib/appointment'
import { bookingConcerns } from '@/features/calendar/Lib/booking.server'
import { printedDescription } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'

describe('a description as plain lines', () => {
  it('gives a line per paragraph and list item, with the formatting gone', () => {
    expect(
      descriptionLines(
        '<p>Front brakes <strong>squeal</strong> when cold</p><ul><li><p>Oil service</p></li><li><p>Check wipers</p></li></ul><p></p>'
      )
    ).toEqual(['Front brakes squeal when cold', 'Oil service', 'Check wipers'])
  })

  it('breaks a paragraph at its line breaks and reads what was escaped', () => {
    expect(descriptionLines('<p>Tyres &lt; 3&nbsp;mm<br>Fish &amp; chips</p>')).toEqual([
      'Tyres < 3 mm',
      'Fish & chips',
    ])
  })

  it('takes text that never was rich text as it is', () => {
    expect(descriptionLines('Brakes\nOil service')).toEqual(['Brakes', 'Oil service'])
  })

  it('keeps comparisons and addresses in angle brackets, which are not formatting', () => {
    expect(
      descriptionLines('Pressure < 2 bar; voltage > 12 V\nMail <accounts@example.com> when done')
    ).toEqual(['Pressure < 2 bar; voltage > 12 V', 'Mail <accounts@example.com> when done'])
    expect(descriptionLines('<p>a <b>b</b> <span class="x">c</span><br/>d</p>')).toEqual([
      'a b c',
      'd',
    ])
  })

  it('says nothing for a description that says nothing', () => {
    expect(descriptionLines('<p></p>')).toEqual([])
    expect(descriptionLines(null)).toEqual([])
  })

  it('goes back to a description a paragraph a line, escaped', () => {
    expect(linesAsDescription(['Tyres < 3 mm', 'Oil'])).toBe('<p>Tyres &lt; 3 mm</p><p>Oil</p>')
    expect(descriptionLines(linesAsDescription(['Tyres < 3 mm', 'Oil']))).toEqual([
      'Tyres < 3 mm',
      'Oil',
    ])
  })

  it('adds only what is not already said', () => {
    expect(withoutRepeats(['Brakes'], ['Brakes', 'Oil', 'Oil'])).toEqual(['Brakes', 'Oil'])
  })
})

describe("a booked job's conditions", () => {
  it('are the work lines, then what the description adds', () => {
    expect(bookingConcerns('Brakes', '<p>Brakes</p><p>Customer waits</p>', 'Brake job')).toEqual([
      'Brakes',
      'Customer waits',
    ])
  })

  it('are the title only when neither says anything', () => {
    expect(bookingConcerns('', '<p></p>', ' Brake job ')).toEqual(['Brake job'])
    expect(bookingConcerns(undefined, '<p>Squeals</p>', 'Brake job')).toEqual(['Squeals'])
  })
})

describe('the description on the printed work order', () => {
  it('prints one kept as rich text as its lines, not its tags', () => {
    expect(printedDescription('<p>Front brakes squeal</p><ul><li><p>Oil</p></li></ul>')).toBe(
      'Front brakes squeal\nOil'
    )
  })

  it('leaves plain text as it was written', () => {
    expect(printedDescription('Pressure < 2 bar\n\nSecond paragraph')).toBe(
      'Pressure < 2 bar\n\nSecond paragraph'
    )
    expect(printedDescription(null)).toBeNull()
  })
})
