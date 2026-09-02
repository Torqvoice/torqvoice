import { describe, expect, it } from 'vitest'
import { suggestMapping } from '@/features/import/Lib/suggest'
import { detectPreset } from '@/features/import/Lib/presets'

/**
 * A shop's export arrives with headers in its own language and its own
 * system's vocabulary. The suggester's job is to get most columns right on
 * sight so the user only corrects the odd one.
 */
describe('mapping suggestion', () => {
  it('maps English shop-system headers', () => {
    const { mapping, dateFormat } = suggestMapping(
      ['Customer', 'Email Address', 'Mobile', 'Company Name', 'Street', 'Zip', 'City'],
      [['Anna Berg', 'anna@example.com', '91234567', 'Berg AS', 'Storgata 1', '0155', 'Oslo']],
      'customers'
    )
    expect(mapping).toEqual({
      '0': 'customer.name',
      '1': 'customer.email',
      '2': 'customer.phone',
      '3': 'customer.company',
      '4': 'customer.street',
      '5': 'customer.postalCode',
      '6': 'customer.city',
    })
    expect(dateFormat).toBe('auto')
  })

  it('maps German, Norwegian and Polish vehicle headers', () => {
    const { mapping } = suggestMapping(
      [
        'Kennzeichen',
        'Fahrgestellnummer',
        'Marke',
        'Modell',
        'Baujahr',
        'Kilometerstand',
        'Kraftstoff',
      ],
      [['B-AB 1234', 'WVWZZZ1KZAW123456', 'VW', 'Golf', '2015', '125.000', 'Benzin']],
      'vehicles'
    )
    expect(mapping).toEqual({
      '0': 'vehicle.licensePlate',
      '1': 'vehicle.vin',
      '2': 'vehicle.make',
      '3': 'vehicle.model',
      '4': 'vehicle.year',
      '5': 'vehicle.mileage',
      '6': 'vehicle.fuelType',
    })

    const nb = suggestMapping(['Reg.nr', 'Merke', 'Modell', 'Årsmodell', 'Eier'], [], 'vehicles')
    expect(nb.mapping['0']).toBe('vehicle.licensePlate')
    expect(nb.mapping['3']).toBe('vehicle.year')

    const pl = suggestMapping(
      ['Nr rejestracyjny', 'Marka', 'Model', 'Rocznik', 'Przebieg'],
      [],
      'vehicles'
    )
    expect(pl.mapping['0']).toBe('vehicle.licensePlate')
    expect(pl.mapping['4']).toBe('vehicle.mileage')
  })

  it('reads a history export where bare words belong to the job', () => {
    const { mapping, dateFormat, decimalSeparator } = suggestMapping(
      ['Date', 'Plate', 'Description', 'Mileage', 'Total', 'Notes', 'Invoice #'],
      [
        ['15.03.2024', 'AB 12345', 'Oil change', '84500', '1.890,50', 'Customer waited', '1042'],
        ['28.11.2023', 'AB 12345', 'Brake pads', '79000', '3.200,00', '', '1001'],
      ],
      'services'
    )
    expect(mapping).toEqual({
      '0': 'service.date',
      '1': 'vehicle.licensePlate',
      '2': 'service.description',
      '3': 'service.mileage',
      '4': 'service.total',
      '5': 'service.notes',
      '6': 'service.invoiceNumber',
    })
    expect(dateFormat).toBe('DMY')
    expect(decimalSeparator).toBe(',')
  })

  it('falls back to the values when the header says nothing', () => {
    const { mapping, source } = suggestMapping(
      ['Column A', 'Column B', 'Column C', 'Column D'],
      [
        ['Anna Berg', 'anna@example.com', '+47 912 34 567', 'JTDBR32E720012345'],
        ['Ola Nordmann', 'ola@example.com', '+47 913 45 678', 'WVWZZZ1KZAW123456'],
      ],
      'vehicles'
    )
    expect(mapping['1']).toBe('customer.email')
    expect(mapping['2']).toBe('customer.phone')
    expect(mapping['3']).toBe('vehicle.vin')
    expect(source['1']).toBe('values')
    expect(mapping['0']).toBeUndefined()
  })

  it('never assigns one field to two columns', () => {
    const { mapping } = suggestMapping(['Email', 'E-mail', 'Phone', 'Telefon'], [], 'customers')
    expect(mapping).toEqual({ '0': 'customer.email', '2': 'customer.phone' })
  })

  it('only offers fields the entity can carry', () => {
    const { mapping } = suggestMapping(['Name', 'Invoice number', 'Plate'], [], 'customers')
    expect(mapping).toEqual({ '0': 'customer.name' })
  })

  it('recognises Google Contacts and Outlook exports', () => {
    const google = [
      'Name',
      'Given Name',
      'Family Name',
      'E-mail 1 - Value',
      'Phone 1 - Value',
      'Organization 1 - Name',
    ]
    expect(detectPreset(google)?.id).toBe('google-contacts')
    const { mapping, presetId } = suggestMapping(google, [], 'customers')
    expect(presetId).toBe('google-contacts')
    expect(mapping['0']).toBe('customer.name')
    expect(mapping['3']).toBe('customer.email')
    expect(mapping['5']).toBe('customer.company')

    const outlook = [
      'First Name',
      'Last Name',
      'E-mail Address',
      'Mobile Phone',
      'Company',
      'Business Street',
      'Business City',
    ]
    const o = suggestMapping(outlook, [], 'customers')
    expect(o.presetId).toBe('outlook-contacts')
    expect(o.mapping).toEqual({
      '0': 'customer.firstName',
      '1': 'customer.lastName',
      '2': 'customer.email',
      '3': 'customer.phone',
      '4': 'customer.company',
      '5': 'customer.street',
      '6': 'customer.city',
    })
  })
})
