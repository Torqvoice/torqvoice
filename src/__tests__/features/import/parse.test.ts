import ExcelJS from 'exceljs'
import iconv from 'iconv-lite'
import { describe, expect, it } from 'vitest'
import { decodeText, parseImportFile, tidyColumns } from '@/features/import/Lib/parse'

/**
 * Files arrive as whatever the old system produced: semicolon CSV in a
 * Windows encoding, an Excel workbook with real dates, a phone's vCard. All of
 * them must come out as the same header-plus-rows shape.
 */
describe('import file parsing', () => {
  it('reads comma and semicolon CSV, with quotes and a BOM', async () => {
    const csv = Buffer.from(
      '﻿Name;Email;"Phone"\r\n"Berg, Anna";anna@example.com;"+47 912 34 567"\r\n\r\n'
    )
    const sheet = await parseImportFile(csv, 'customers.csv')
    expect(sheet.format).toBe('csv')
    expect(sheet.delimiter).toBe(';')
    expect(sheet.encoding).toBe('UTF-8')
    expect(sheet.columns).toEqual(['Name', 'Email', 'Phone'])
    expect(sheet.rows).toEqual([['Berg, Anna', 'anna@example.com', '+47 912 34 567']])
  })

  it('falls back to Windows-1252 when the bytes are not UTF-8', async () => {
    const latin = iconv.encode('Navn,By\nBjørn Sæther,Tromsø\n', 'win1252')
    expect(decodeText(latin).encoding).toBe('Windows-1252')
    const sheet = await parseImportFile(latin, 'kunder.csv')
    expect(sheet.rows[0]).toEqual(['Bjørn Sæther', 'Tromsø'])
  })

  it('names blank headers, disambiguates duplicates and drops empty trailing columns', async () => {
    expect(tidyColumns(['Name', '', 'Name', null])).toEqual([
      'Name',
      'Column 2',
      'Name (2)',
      'Column 4',
    ])
    const sheet = await parseImportFile(Buffer.from('Name,Email,,\nAnna,a@x.com,,\n'), 'x.csv')
    expect(sheet.columns).toEqual(['Name', 'Email'])
    expect(sheet.rows).toEqual([['Anna', 'a@x.com']])
  })

  it('reads an Excel workbook, turning dates and numbers into text', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Jobs')
    ws.addRow(['Date', 'Plate', 'Total'])
    ws.addRow([new Date(Date.UTC(2024, 2, 15)), 'AB 12345', 1890.5])
    const buffer = Buffer.from(await wb.xlsx.writeBuffer())
    const sheet = await parseImportFile(buffer, 'jobs.xlsx')
    expect(sheet.format).toBe('xlsx')
    expect(sheet.sheetName).toBe('Jobs')
    expect(sheet.columns).toEqual(['Date', 'Plate', 'Total'])
    expect(sheet.rows).toEqual([['2024-03-15', 'AB 12345', '1890.5']])
  })

  it('reads a workbook that was renamed to .csv', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('S').addRows([['Name'], ['Anna']])
    const buffer = Buffer.from(await wb.xlsx.writeBuffer())
    const sheet = await parseImportFile(buffer, 'renamed.csv')
    expect(sheet.format).toBe('xlsx')
    expect(sheet.rows).toEqual([['Anna']])
  })

  it('reads vCards into the customer columns', async () => {
    const vcf = Buffer.from(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:Berg;Anna;;;',
        'FN:Anna Berg',
        'ORG:Berg Transport AS;',
        'TEL;TYPE=HOME:22 33 44 55',
        'TEL;TYPE=CELL:+47 912 34 567',
        'EMAIL;TYPE=INTERNET:anna@example.com',
        'ADR;TYPE=HOME:;;Storgata 1;Oslo;;0155;Norway',
        'NOTE:Prefers SMS\\, not calls',
        'END:VCARD',
        'BEGIN:VCARD',
        'FN:',
        'END:VCARD',
      ].join('\r\n')
    )
    const sheet = await parseImportFile(vcf, 'contacts.vcf')
    expect(sheet.format).toBe('vcard')
    expect(sheet.columns[0]).toBe('Name')
    expect(sheet.rows).toEqual([
      [
        'Anna Berg',
        'Anna',
        'Berg',
        'anna@example.com',
        '+47 912 34 567',
        'Berg Transport AS',
        'Storgata 1, 0155 Oslo, Norway',
        'Prefers SMS, not calls',
      ],
    ])
  })

  it('refuses old .xls, unknown types and empty files with a clear code', async () => {
    await expect(parseImportFile(Buffer.from('x'), 'old.xls')).rejects.toMatchObject({
      code: 'legacy_xls',
    })
    await expect(parseImportFile(Buffer.from('x'), 'doc.pdf')).rejects.toMatchObject({
      code: 'unsupported_format',
    })
    await expect(parseImportFile(Buffer.from('Name\n'), 'empty.csv')).rejects.toMatchObject({
      code: 'empty',
    })
  })
})
