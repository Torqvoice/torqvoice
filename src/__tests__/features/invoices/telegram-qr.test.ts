// @vitest-environment node
/**
 * The Telegram code on a sheet: printed only when the design has the block
 * on and a bot is connected, resolved the same way for every copy, and
 * placed inside the sheet by the spec builder so the PDF, the shared page
 * and the portal all carry it in the same spot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A plain function behind the mock rather than a vi.fn: a spy whose
// implementation throws is re-reported by the runner after a reset, which
// is not what this file is testing.
let lookup: (orgId: string) => Promise<string | null> = async () => null
const lookups: string[] = []
vi.mock('@/lib/telegram', () => ({
  getOrgTelegramBotUsername: (orgId: string) => {
    lookups.push(orgId)
    return lookup(orgId)
  },
}))

import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import {
  telegramBotLink,
  telegramQrForPrint,
  telegramQrWanted,
} from '@/features/invoices/Lib/telegramQr'
import { getDefaultInvoiceLayout } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

function layoutWithTelegram(visible: boolean) {
  const layout = getDefaultInvoiceLayout()
  return {
    ...layout,
    sections: layout.sections.map((s) => (s.id === 'telegram_qr' ? { ...s, visible } : s)),
  }
}

describe('telegramQrForPrint', () => {
  beforeEach(() => {
    lookup = async () => null
    lookups.length = 0
  })

  it('is off by default: the block starts hidden', () => {
    expect(telegramQrWanted(getDefaultInvoiceLayout())).toBe(false)
    expect(telegramQrWanted(layoutWithTelegram(true))).toBe(true)
  })

  it('prints nothing when the design leaves the block off, without asking for the bot', async () => {
    expect(await telegramQrForPrint('org1', layoutWithTelegram(false))).toBeNull()
    expect(lookups).toEqual([])
  })

  it('prints nothing when no bot is connected', async () => {
    lookup = async () => null
    expect(await telegramQrForPrint('org1', layoutWithTelegram(true))).toBeNull()
  })

  it('encodes the connected bot link when the block is on', async () => {
    lookup = async () => 'eigeland_bot'
    const qr = await telegramQrForPrint('org1', layoutWithTelegram(true))
    expect(qr?.link).toBe('https://t.me/eigeland_bot')
    expect(qr?.dataUri.startsWith('data:image/png;base64,')).toBe(true)
    expect(lookups).toEqual(['org1'])
  })

  it('never lets a broken integration cost the document', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    lookup = async () => {
      throw new Error('catalogue down')
    }
    expect(await telegramQrForPrint('org1', layoutWithTelegram(true))).toBeNull()
    expect(quiet).toHaveBeenCalledOnce()
    quiet.mockRestore()
  })

  it('reads a username with or without the @', () => {
    expect(telegramBotLink('@shop_bot')).toBe('https://t.me/shop_bot')
    expect(telegramBotLink('shop_bot')).toBe('https://t.me/shop_bot')
  })
})

const invoice = {
  id: 'svc_1',
  title: 'Oil change',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-01'),
  shopName: 'Testshop',
  techName: null,
  mileage: null,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 100,
  taxRate: 25,
  taxAmount: 25,
  totalAmount: 125,
  cost: 125,
  invoiceNumber: 'INV-1',
  partItems: [],
  laborItems: [{ description: 'Oil change', hours: 1, rate: 100, total: 100 }],
  customFields: [],
} as unknown as InvoiceData

/** Every image node in a spec, wherever it is nested. */
function images(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out
  const n = node as Record<string, unknown>
  if (n.kind === 'image' && typeof n.src === 'string') out.push(n.src)
  for (const value of Object.values(n)) {
    if (Array.isArray(value)) for (const item of value) images(item, out)
    else if (value && typeof value === 'object') images(value, out)
  }
  return out
}

describe('the code in the sheet', () => {
  const qr = 'data:image/png;base64,QR'

  it('is drawn inside the sheet when the block is on and a code is given', () => {
    const spec = buildInvoicePrintSpec({
      data: invoice,
      workshop: { name: 'Testshop', address: '', phone: '', email: '' },
      template: { layoutConfig: layoutWithTelegram(true) },
      telegramQrDataUri: qr,
      telegramLabel: 'Snakk med oss på Telegram',
    })
    expect(images(spec)).toContain(qr)
    expect(JSON.stringify(spec)).toContain('Snakk med oss på Telegram')
  })

  it('is left out when the block is off, even with a code in hand', () => {
    const spec = buildInvoicePrintSpec({
      data: invoice,
      workshop: { name: 'Testshop', address: '', phone: '', email: '' },
      template: { layoutConfig: layoutWithTelegram(false) },
      telegramQrDataUri: qr,
    })
    expect(images(spec)).not.toContain(qr)
  })
})
