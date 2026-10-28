import { expect, test } from '@playwright/test'
import { signUpWithPassword } from '../../support/cloud'
import { foreignServiceRecordId, organizationIdFor, workshopSetting } from '../../support/db'
import { fillSettled, settle } from '../../support/hydration'
import { pdfContent } from '../../support/pdf'

/**
 * The guided setup of a new workshop, through the case that asked for it: an
 * owner in France whose browser speaks English. The language customers get
 * used to follow the owner's screens, so their invoices came out in English.
 * Here the country comes from the clock, French is suggested for the
 * documents, the owner's screens stay English, and the first invoice they
 * download is French.
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })
test.use({ timezoneId: 'Europe/Paris', locale: 'en-US' })

const stamp = Date.now()
const EMAIL = `e2e-setup-${stamp}@example.com`
const WORKSHOP = `Garage Martin ${stamp}`

test('a workshop in France gets French documents from an English browser', async ({ page }) => {
  await signUpWithPassword(page, { name: 'E2E Setup', email: EMAIL, password: `E2e-pass-${stamp}` })
  await settle(page)

  // Step 1: the country comes from the clock.
  await expect(page.getByRole('heading', { name: 'Set up your workshop' })).toBeVisible()
  await fillSettled(page.locator('#workshopName'), WORKSHOP)
  await expect(page.locator('#country')).toContainText('France')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 2: French for the customers, English for the screens.
  await expect(page.getByRole('heading', { name: 'Language and region' })).toBeVisible()
  await expect(page.locator('#docLanguage')).toContainText('Français')
  await expect(page.getByText('Your own screens stay in English.')).toBeVisible()
  await expect(page.getByText(/Euro \(EUR\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 3: a rate the owner types, under the name used in France.
  await expect(page.getByRole('heading', { name: 'Taxes on your invoices' })).toBeVisible()
  await expect(page.locator('#taxName')).toHaveValue('TVA')
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await fillSettled(page.locator('#taxRate'), '20')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 4: the last look, then the workshop.
  await expect(page.getByRole('heading', { name: `Ready to open ${WORKSHOP}` })).toBeVisible()
  await expect(page.getByText('Your screens: English')).toBeVisible()
  await page.getByRole('button', { name: 'Create workshop' }).click()
  await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 60_000 })

  const organizationId = await organizationIdFor(EMAIL)
  expect(await workshopSetting(organizationId, 'workshop.locale')).toBe('fr')
  expect(await workshopSetting(organizationId, 'workshop.currencyCode')).toBe('EUR')
  expect(await workshopSetting(organizationId, 'workshop.taxLabel')).toBe('TVA')
  expect(await workshopSetting(organizationId, 'workshop.defaultTaxRate')).toBe('20')

  // The owner's screens are English, and the invoice they download is French.
  const jobId = await foreignServiceRecordId(organizationId)
  const response = await page.request.get(`/api/protected/services/${jobId}/pdf`)
  expect(response.ok()).toBe(true)
  const pdf = await pdfContent(await response.body())
  expect(pdf.flat).toContain('FACTURE')
  expect(pdf.flat).toContain('Facturer à')
  expect(pdf.flat).not.toContain('Bill To')
})
