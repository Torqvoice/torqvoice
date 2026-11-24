import { expect, type Page, test } from '@playwright/test'
import { ownerOrganizationId, plantQuote, quoteConversion, userIdFor } from '../../support/db'
import { addQuotePart, newQuote } from '../../support/quote'
import {
  newOrderRadio,
  openConvertDialog,
  plantVehicle,
  type PlantedVehicle,
} from '../../support/quote-conversion'

/**
 * A quote's lines are held to the work order's rules.
 *
 * A quote took a priced part at a quantity of zero and a billion parts at a
 * hundred million each, which a work order refuses. The figure is now
 * marked under its field as it is typed and the save says why; a quote
 * written before the rules still opens and converts as it is.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const OWNER = 'demo@torqvoice.com'

/** Clicks Save and expects it to be refused with one sentence. */
async function expectRefused(page: Page, message: RegExp) {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(message).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('Quote saved')).toHaveCount(0)
}

test.describe('a quote line the save would refuse', () => {
  test('a priced part at a quantity of zero is marked and refused', async ({ page }) => {
    await newQuote(page, `E2E quote zero quantity ${stamp}`)
    await addQuotePart(page, { name: `E2E pads ${stamp}`, quantity: 0, unitPrice: 200 })

    const quantity = page.getByRole('spinbutton', { description: 'Must be more than 0.' })
    await expect(quantity).toBeVisible()
    await expect(quantity).toHaveAttribute('aria-invalid', 'true')

    await expectRefused(page, /needs a quantity above zero/i)
    await expect(quantity).toBeFocused()
  })

  test('a billion parts at a hundred million each is marked and refused', async ({ page }) => {
    await newQuote(page, `E2E quote absurd ${stamp}`)
    await addQuotePart(page, {
      name: `E2E discs ${stamp}`,
      quantity: 1_000_000_000,
      unitPrice: 99_999_999,
    })

    await expect(
      page.getByRole('spinbutton', { description: 'Must be 100,000 or less.' })
    ).toBeVisible()
    await expect(page.getByText('Must be 1,000,000,000 or less.')).toBeVisible()
    await expectRefused(page, /figure is too large/i)
  })
})

test.describe('a quote saved before the limits', () => {
  let vehicle: PlantedVehicle
  let quoteId = ''

  test.beforeAll(async () => {
    vehicle = await plantVehicle(`Limits${String(stamp).slice(-6)}`)
    quoteId = await plantQuote(await ownerOrganizationId(OWNER), await userIdFor(OWNER), {
      vehicleId: vehicle.id,
      title: `E2E quote from before the limits ${stamp}`,
      parts: [{ name: `E2E old line ${stamp}`, quantity: 1_000_000_000, unitPrice: 99_999_999 }],
    })
  })

  test('still opens and converts to a work order', async ({ page }) => {
    await page.goto(`/quotes/${quoteId}`)
    await expect(page.locator('#title')).toHaveValue(`E2E quote from before the limits ${stamp}`)

    const dialog = await openConvertDialog(page)
    await expect(newOrderRadio(dialog)).toBeChecked({ timeout: 15_000 })
    await dialog.getByRole('button', { name: 'Convert', exact: true }).click()
    await page.waitForURL(/\/(vehicles\/[^/]+\/service|sales)\/[^/]+$/, { timeout: 60_000 })

    expect((await quoteConversion(quoteId)).status).toBe('converted')
  })
})
