import { expect, test } from '@playwright/test'
import { signUpWithPassword } from '../../support/cloud'
import { settle } from '../../support/hydration'

/**
 * The sign-up and sign-in pages as a stranger meets them, in cloud mode.
 *
 * Four in ten people who landed on sign-up left without touching the form, on
 * a page that said nothing about what they were signing up for. The pages now
 * make the case beside the form, point a newcomer who clicked "Login" at a
 * free account before the form, and let a visitor change the language before
 * they have an account to keep it on. The last is the one that can quietly
 * break: a language picked on sign-up has to survive the sign-up itself.
 */

test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()

test.describe('the sign-up page', () => {
  test('makes its case beside the form', async ({ page }) => {
    await page.goto('/auth/sign-up')
    await settle(page)

    await expect(page.getByRole('heading', { name: 'Start your free workshop' })).toBeVisible()
    await expect(page.getByText('Ready in under a minute. No credit card required.')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Workshop management/ })).toBeVisible()
    await expect(page.getByText('Free plan, no credit card')).toBeVisible()

    // And the form is still the thing to do.
    for (const field of ['#name', '#email', '#password']) {
      await expect(page.locator(field)).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Create free account' })).toBeVisible()
  })

  test('keeps a language picked before signing up, into onboarding', async ({ page, context }) => {
    await page.goto('/auth/sign-up')
    await settle(page)

    await expect(async () => {
      await page.getByRole('combobox', { name: 'Language' }).click()
      await expect(page.getByRole('option', { name: 'Norsk Bokmål' })).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('option', { name: 'Norsk Bokmål' }).click()

    await expect(page.getByRole('heading', { name: 'Start ditt gratis verksted' })).toBeVisible({
      timeout: 30_000,
    })
    const cookie = (await context.cookies()).find((c) => c.name === 'locale')
    expect(cookie?.value, 'kept for the visits after this one').toBe('nb')

    // Signed up in Norwegian, and onboarding speaks it too.
    await signUpWithPassword(page, {
      name: 'E2E Norsk',
      email: `e2e-norsk-${stamp}@example.com`,
      password: `E2e-pass-${stamp}`,
    })
    await expect(page.getByRole('heading', { name: 'Sett opp verkstedet ditt' })).toBeVisible()
  })
})

test.describe('the sign-in page', () => {
  test('points a newcomer at a free account before the form', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await settle(page)

    await expect(page.getByText('New to Torqvoice?')).toBeVisible()
    const link = page.getByRole('link', { name: 'Create a free account' })
    await expect(link).toHaveAttribute('href', /\/auth\/sign-up/)

    // Above the form, where a newcomer who clicked "Login" reads, rather than
    // under it.
    const linkBox = await link.boundingBox()
    const emailBox = await page.locator('#email').boundingBox()
    expect(linkBox && emailBox && linkBox.y < emailBox.y, 'the link sits above the form').toBe(true)

    await link.click()
    await page.waitForURL(/\/auth\/sign-up/)
    await expect(page.getByRole('heading', { name: 'Start your free workshop' })).toBeVisible()
  })
})
