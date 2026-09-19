import { describe, expect, it } from 'vitest'
import {
  mapReminderColumns,
  parseTimeOfDay,
  parseYesNo,
  planReminderImport,
  REMINDER_COLUMNS,
  REMINDER_TEMPLATE_ROWS,
  type ReminderImportContext,
} from '@/features/vehicles/Lib/reminderImport'

const HEADERS = REMINDER_COLUMNS.map((c) => c.header)

function ctx(over: Partial<ReminderImportContext> = {}): ReminderImportContext {
  return {
    vehicles: [
      {
        id: 'v1',
        licensePlate: 'AB 12345',
        vin: '1HGBH41JXMN109186',
        customerId: 'c1',
        year: 2018,
        make: 'Volvo',
        model: 'V70',
      },
      {
        id: 'v2',
        licensePlate: 'CD 67890',
        vin: null,
        customerId: null,
        year: 2020,
        make: 'Tesla',
        model: 'Model 3',
      },
    ],
    customers: [
      { id: 'c1', name: 'Anna Berg', email: 'anna@example.com', customerNumber: '1001' },
      { id: 'c2', name: 'Ola Hansen', email: null, customerNumber: '1002' },
      { id: 'c3', name: 'Ola Hansen', email: 'ola@example.com', customerNumber: '1003' },
    ],
    openReminders: [],
    timeZone: 'Europe/Oslo',
    ...over,
  }
}

/** A row in template order from the fields given. */
function row(fields: Partial<Record<(typeof REMINDER_COLUMNS)[number]['key'], string>>): string[] {
  return REMINDER_COLUMNS.map((c) => fields[c.key] ?? '')
}

describe('reminder import headers', () => {
  it('reads the template headers', () => {
    const { columns, ignored } = mapReminderColumns(HEADERS)
    expect(ignored).toEqual([])
    REMINDER_COLUMNS.forEach((c, i) => expect(columns[c.key]).toEqual([i]))
  })

  it('recognises other names and languages, and lists what it ignores', () => {
    const { columns, ignored } = mapReminderColumns([
      'Tittel',
      'Dato',
      'Reg.nr',
      'Kunde',
      'E-post',
      'Km',
      'Colour',
    ])
    expect(columns.title).toEqual([0])
    expect(columns.dueDate).toEqual([1])
    expect(columns.licensePlate).toEqual([2])
    // Both customer columns are tried.
    expect(columns.customer).toEqual([3, 4])
    expect(columns.dueMileage).toEqual([5])
    expect(ignored).toEqual(['Colour'])
  })
})

describe('reminder import cells', () => {
  it('reads times in 24-hour and 12-hour forms', () => {
    expect(parseTimeOfDay('14:30').value).toBe('14:30')
    expect(parseTimeOfDay('9.05').value).toBe('09:05')
    expect(parseTimeOfDay('2:30 PM').value).toBe('14:30')
    expect(parseTimeOfDay('12 am').value).toBe('00:00')
    expect(parseTimeOfDay('').valid).toBe(true)
    expect(parseTimeOfDay('25:00').valid).toBe(false)
    expect(parseTimeOfDay('noon').valid).toBe(false)
  })

  it('reads yes and no in the app languages', () => {
    for (const yes of ['yes', 'Ja', 'sí', 'oui', 'x', 'TRUE', '1', 'evet']) {
      expect(parseYesNo(yes)).toEqual({ value: true, valid: true })
    }
    for (const no of ['no', 'Nei', 'nein', 'non', 'não', 'hayır', '', '0']) {
      expect(parseYesNo(no)).toEqual({ value: false, valid: true })
    }
    expect(parseYesNo('maybe').valid).toBe(false)
  })
})

describe('planning a reminder import', () => {
  it('turns the template example rows into a vehicle, a customer and a workshop reminder', () => {
    const plan = planReminderImport(HEADERS, REMINDER_TEMPLATE_ROWS as string[][], ctx())
    expect(plan.rows.map((r) => [r.status, r.target?.kind])).toEqual([
      ['ready', 'vehicle'],
      ['ready', 'customer'],
      ['ready', 'workshop'],
    ])
    const [oil, call] = plan.rows
    expect(oil).toMatchObject({
      line: 2,
      dueDay: '2026-11-15',
      dueMileage: 120000,
      notifyEmail: true,
    })
    expect(oil.target).toMatchObject({
      id: 'v1',
      customerId: 'c1',
      label: '2018 Volvo V70 · AB 12345',
    })
    expect(call.dueTime).toBe('09:30')
  })

  it('stores the due time as workshop wall clock, and a day-only reminder at noon', () => {
    const plan = planReminderImport(
      HEADERS,
      [
        row({ title: 'Timed', dueDate: '2026-10-15', dueTime: '14:30' }),
        row({ title: 'Day only', dueDate: '2026-10-15' }),
        row({ title: 'Time in the date cell', dueDate: '2026-10-15 08:15' }),
      ],
      ctx()
    )
    // Oslo is UTC+2 in October.
    expect(plan.rows[0].dueAt?.toISOString()).toBe('2026-10-15T12:30:00.000Z')
    expect(plan.rows[1].dueAt?.toISOString()).toBe('2026-10-15T10:00:00.000Z')
    expect(plan.rows[1].dueTime).toBeNull()
    expect(plan.rows[2].dueTime).toBe('08:15')
  })

  it('detects day-first dates from the column, and follows a chosen format', () => {
    const rows = [
      row({ title: 'A', dueDate: '03.04.2026' }),
      row({ title: 'B', dueDate: '25.04.2026' }),
    ]
    const auto = planReminderImport(HEADERS, rows, ctx())
    expect(auto.dateFormat).toBe('DMY')
    expect(auto.rows[0].dueDay).toBe('2026-04-03')

    const monthFirst = planReminderImport(HEADERS, rows, ctx(), 'MDY')
    expect(monthFirst.rows[0].dueDay).toBe('2026-03-04')
    expect(monthFirst.rows[1]).toMatchObject({ status: 'error', issue: 'badDate' })
  })

  it('matches plates ignoring spaces and dashes, and by VIN', () => {
    const plan = planReminderImport(
      HEADERS,
      [
        row({ title: 'A', dueMileage: '100 000', licensePlate: 'ab-12345' }),
        row({ title: 'B', dueMileage: '5000', vin: '1hgbh41jxmn109186' }),
      ],
      ctx()
    )
    expect(plan.rows.map((r) => r.target && 'id' in r.target && r.target.id)).toEqual(['v1', 'v1'])
    expect(plan.rows[0].dueMileage).toBe(100000)
  })

  it('matches customers by email, number or exact name, and the vehicle wins', () => {
    const plan = planReminderImport(
      HEADERS,
      [
        row({ title: 'A', dueDate: '2026-10-01', customer: 'ANNA@example.com' }),
        row({ title: 'B', dueDate: '2026-10-01', customer: '1002' }),
        row({ title: 'C', dueDate: '2026-10-01', customer: '  anna   berg ' }),
        row({ title: 'D', dueDate: '2026-10-01', customer: 'Ola Hansen' }),
        row({ title: 'E', dueDate: '2026-10-01', customer: 'Kari Nordmann' }),
        row({ title: 'F', dueDate: '2026-10-01', licensePlate: 'CD 67890', customer: 'nobody' }),
      ],
      ctx()
    )
    expect(plan.rows.slice(0, 3).map((r) => r.target && 'id' in r.target && r.target.id)).toEqual([
      'c1',
      'c2',
      'c1',
    ])
    expect(plan.rows[3]).toMatchObject({ status: 'error', issue: 'customerAmbiguous' })
    expect(plan.rows[4]).toMatchObject({
      status: 'error',
      issue: 'customerNotFound',
      issueValue: 'Kari Nordmann',
    })
    expect(plan.rows[5]).toMatchObject({ status: 'ready', target: { kind: 'vehicle', id: 'v2' } })
  })

  it('tries each customer column until one matches', () => {
    const plan = planReminderImport(
      ['Title', 'Due date', 'Customer name', 'Customer email'],
      [['A', '2026-10-01', 'Ola Hansen', 'ola@example.com']],
      ctx()
    )
    expect(plan.rows[0].target).toMatchObject({ kind: 'customer', id: 'c3' })
  })

  it('explains every row it cannot import', () => {
    const plan = planReminderImport(
      HEADERS,
      [
        row({ dueDate: '2026-10-01' }),
        row({ title: 'No due' }),
        row({ title: 'Bad date', dueDate: '31.02.2026' }),
        row({ title: 'Bad time', dueDate: '2026-10-01', dueTime: 'afternoon' }),
        row({ title: 'Time only', dueTime: '10:00', dueMileage: '5000' }),
        row({ title: 'Bad mileage', dueMileage: 'lots' }),
        row({ title: 'Bad flag', dueMileage: '5000', emailNotification: 'maybe' }),
        row({ title: 'Unknown plate', dueMileage: '5000', licensePlate: 'ZZ 99999' }),
        row({
          title: 'Mismatch',
          dueMileage: '5000',
          licensePlate: 'CD 67890',
          vin: '1HGBH41JXMN109186',
        }),
      ],
      ctx()
    )
    expect(plan.rows.map((r) => r.issue)).toEqual([
      'missingTitle',
      'missingDue',
      'badDate',
      'badTime',
      'timeWithoutDate',
      'badMileage',
      'badEmailNotification',
      'vehicleNotFound',
      'vehicleMismatch',
    ])
    expect(plan.rows.every((r) => r.status === 'error')).toBe(true)
  })

  it('reports a plate shared by two vehicles instead of guessing', () => {
    const base = ctx()
    const plan = planReminderImport(
      HEADERS,
      [row({ title: 'A', dueMileage: '5000', licensePlate: 'AB 12345' })],
      ctx({
        vehicles: [...base.vehicles, { ...base.vehicles[1], id: 'v3', licensePlate: 'AB12345' }],
      })
    )
    expect(plan.rows[0]).toMatchObject({ status: 'error', issue: 'vehicleAmbiguous' })
  })

  it('skips reminders that already exist or repeat within the file', () => {
    const first = planReminderImport(
      HEADERS,
      [row({ title: 'Oil change', dueDate: '2026-11-15', licensePlate: 'AB 12345' })],
      ctx()
    )
    const existing = {
      vehicleId: 'v1',
      customerId: 'c1',
      title: 'oil  change',
      dueDate: first.rows[0].dueAt,
      dueMileage: null,
    }
    const plan = planReminderImport(
      HEADERS,
      [
        row({ title: 'Oil change', dueDate: '2026-11-15', licensePlate: 'AB 12345' }),
        row({ title: 'Brakes', dueDate: '2026-11-15' }),
        row({ title: 'brakes', dueDate: '2026-11-15' }),
        // Same title on another day is a different reminder.
        row({ title: 'Oil change', dueDate: '2027-05-15', licensePlate: 'AB 12345' }),
      ],
      ctx({ openReminders: [existing] })
    )
    expect(plan.rows.map((r) => [r.status, r.issue])).toEqual([
      ['duplicate', 'duplicateExisting'],
      ['ready', null],
      ['duplicate', 'duplicateInFile'],
      ['ready', null],
    ])
  })
})
