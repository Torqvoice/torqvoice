/**
 * What a schema refused, turned into something a form can say under the
 * field in the person's language: the field, the kind of problem, the limit.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { fieldErrorsFromZod } from '@/lib/field-errors'

function refused(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input)
  if (result.success) throw new Error('expected the schema to refuse')
  return fieldErrorsFromZod(result.error)
}

describe('field errors from a schema', () => {
  it('names the field and the problem, not the library English', () => {
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      email: z.string().email('Invalid email'),
      year: z.coerce.number().min(1900).max(2028, 'Year is too far in the future'),
      mileage: z.coerce.number().min(0),
    })
    expect(refused(schema, { name: '', email: 'a@b', year: 2099, mileage: -5 })).toEqual([
      { field: 'name', issue: 'required' },
      { field: 'email', issue: 'email' },
      { field: 'year', issue: 'tooLarge', limit: 2028 },
      { field: 'mileage', issue: 'negative' },
    ])
  })

  it('keeps the limit of a length or a lower bound', () => {
    const schema = z.object({
      address: z.string().max(500),
      code: z.string().min(3),
      year: z.coerce.number().min(1900),
    })
    expect(refused(schema, { address: 'x'.repeat(501), code: 'ab', year: 1800 })).toEqual([
      { field: 'address', issue: 'tooLong', limit: 500 },
      { field: 'code', issue: 'tooShort', limit: 3 },
      { field: 'year', issue: 'tooSmall', limit: 1900 },
    ])
  })

  it('says a number is wanted, or a whole one', () => {
    const schema = z.object({ hours: z.coerce.number(), months: z.number().int() })
    expect(refused(schema, { hours: 'abc', months: 1.5 })).toEqual([
      { field: 'hours', issue: 'notNumber' },
      { field: 'months', issue: 'wholeNumber' },
    ])
  })

  it('gives a line in a list its full path, once per field', () => {
    const schema = z.object({
      partItems: z.array(z.object({ quantity: z.number().min(0).max(10) })),
    })
    expect(refused(schema, { partItems: [{ quantity: 1 }, { quantity: -1 }] })).toEqual([
      { field: 'partItems.1.quantity', issue: 'negative' },
    ])
  })
})
