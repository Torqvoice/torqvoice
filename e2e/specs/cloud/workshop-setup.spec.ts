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
// Signed out: these specs sign up as strangers do.
test.use({
  storageState: { cookies: [], origins: [] },
  timezoneId: 'Europe/Paris',
  locale: 'en-US',
})

const stamp = Date.now()
const EMAIL = `e2e-setup-${stamp}@example.com`
const WORKSHOP = `Garage Martin ${stamp}`

test('a workshop in France gets French documents from an English browser', async ({ page }) => {
  await signUpWithPassword(page, { name: 'E2E Setup', email: EMAIL, password: `E2e-pass-${stamp}` })
  await settle(page)

  // Step 1: the country comes from the clock, and with it French for the
  // customers, opened under the owner's English by itself.
  await expect(page.getByRole('heading', { name: 'Set up your workshop' })).toBeVisible()
  await fillSettled(page.locator('#workshopName'), WORKSHOP)
  await expect(page.locator('#country')).toContainText('France')
  await expect(page.locator('#language')).toContainText('English')
  await expect(page.locator('#docLanguage')).toContainText('Français')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 2: the region.
  await expect(page.getByRole('heading', { name: 'Language and region' })).toBeVisible()
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
  // The design prints the box headings in capitals: "FACTURER À".
  expect(pdf.flat.toLowerCase()).toContain('facturer à')
  expect(pdf.flat.toLowerCase()).not.toContain('bill to')
})

/**
 * Someone on a Norwegian computer whose workshop is in the United Kingdom.
 * Picking the country turns the page and the documents English, keeping what
 * was typed; picking a language afterwards is theirs, and the country no
 * longer moves it.
 */
test.describe('the language follows the country until the owner picks one', () => {
  test.use({ timezoneId: 'Europe/Oslo', locale: 'nb-NO' })

  const email = `e2e-setup-uk-${stamp}@example.com`
  const workshop = `Riverside Motors ${stamp}`

  test('a British workshop set up from a Norwegian computer', async ({ page }) => {
    await signUpWithPassword(page, { name: 'E2E UK', email, password: `E2e-pass-${stamp}` })
    await settle(page)
    await expect(page.locator('html')).toHaveAttribute('lang', 'nb')
    await fillSettled(page.locator('#workshopName'), workshop)

    // The country: "UK" finds it, and the page turns English with the name kept.
    await page.locator('#country').click()
    await page.keyboard.type('UK')
    await page.keyboard.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Set up your workshop' })).toBeVisible()
    await expect(page.locator('#workshopName')).toHaveValue(workshop)
    await expect(page.locator('#language')).toContainText('English')

    // The owner picks Norwegian: their screens and their customers get it.
    await page.locator('#language').click()
    await page.keyboard.type('Norsk')
    await page.keyboard.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('lang', 'nb', { timeout: 15_000 })
    await expect(page.locator('#workshopName')).toHaveValue(workshop)
    await expect(page.locator('#country')).toContainText('Storbritannia')

    // A picked language stays when the country changes.
    await page.locator('#country').click()
    await page.keyboard.type('Irland')
    await page.keyboard.press('Enter')
    await expect(page.locator('#country')).toContainText('Irland')
    await settle(page)
    await expect(page.locator('html')).toHaveAttribute('lang', 'nb')

    // One language for everything: no customer language of its own.
    await expect(page.locator('#docLanguage')).toHaveCount(0)
    await page.locator('form button[type="submit"]').click()
    await page.locator('form button[type="submit"]').click()
    await fillSettled(page.locator('#taxRate'), '23')
    await page.locator('form button[type="submit"]').click()
    await page.locator('form button[type="submit"]').click()
    await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 60_000 })

    const organizationId = await organizationIdFor(email)
    expect(await workshopSetting(organizationId, 'workshop.locale')).toBe('nb')
    expect(await workshopSetting(organizationId, 'workshop.currencyCode')).toBe('EUR')
    expect(await workshopSetting(organizationId, 'workshop.defaultTaxRate')).toBe('23')
  })
})
