import { describe, expect, it } from 'vitest'
import { columnsOf } from '@/lib/backup/rows'

describe('columnsOf', () => {
  it('keeps the id, so everything pointing at the row still finds it', () => {
    expect(columnsOf({ id: 'abc', name: 'Brake pad' })).toEqual({ id: 'abc', name: 'Brake pad' })
  })

  it('drops nested rows, which belong to their own table', () => {
    const row = { id: 'q1', total: 10, partItems: [{ id: 'p1' }], attachments: [] }
    expect(columnsOf(row)).toEqual({ id: 'q1', total: 10 })
  })

  it('turns timestamps back into dates', () => {
    const columns = columnsOf({ createdAt: '2026-08-23T10:11:12.000Z' })
    expect(columns.createdAt).toBeInstanceOf(Date)
    expect((columns.createdAt as Date).toISOString()).toBe('2026-08-23T10:11:12.000Z')
  })

  it('leaves text that merely looks date-ish alone', () => {
    const columns = columnsOf({ note: '2026-08-23', plate: 'AB-12-345' })
    expect(columns.note).toBe('2026-08-23')
    expect(columns.plate).toBe('AB-12-345')
  })

  it('keeps nulls, which are a value rather than a gap', () => {
    expect(columnsOf({ customerId: null })).toEqual({ customerId: null })
  })

  it('takes the importing organisation over the one in the file', () => {
    const columns = columnsOf(
      { id: 'm1', organizationId: 'from-another-instance' },
      {
        organizationId: 'mine',
      }
    )
    expect(columns.organizationId).toBe('mine')
  })

  it('replaces a user who has no account here', () => {
    // Stock movements name whoever moved the stock, and that person may not
    // exist on the instance the backup is restored to.
    const columns = columnsOf({ userId: 'someone-else' }, { userId: 'me' })
    expect(columns.userId).toBe('me')
  })
})
