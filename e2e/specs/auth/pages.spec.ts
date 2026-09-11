import { expect, test } from '@playwright/test'
import { settle } from '../../support/hydration'

/**
 * The sign-in and sign-up pages on a self-hosted install.
 *
 * The pages were rebuilt around a cloud sign-up pitch, and a self-hosted
 * install must not get it: its visitors are the workshop's own staff, and a
 * "free plan, no credit card" banner or a Google button would be selling them
 * a product they already run, through a Google client nobody configured. What
 * they do keep is the way to an account above the form and the language
 * switcher, which is theirs as much as anybody's.
 */

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('a self-hosted install', () => {
  test('signs people up without a sales pitch or Google', async ({ page }) => {
    await page.goto('/auth/sign-up')
    await settle(page)

    for (const field of ['#name', '#email', '#password']) {
      await expect(page.locator(field)).toBeVisible()
    }
    await expect(page.getByText('Free plan, no credit card')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  })

  test('puts the way to an account above the sign-in form', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await settle(page)

    const link = page.getByRole('link', { name: 'Create one' })
    await expect(link).toHaveAttribute('href', /\/auth\/sign-up/)
    const linkBox = await link.boundingBox()
    const emailBox = await page.locator('#email').boundingBox()
    expect(linkBox && emailBox && linkBox.y < emailBox.y, 'the link sits above the form').toBe(true)
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  })

  test('lets the language be changed before signing in', async ({ page, context }) => {
    await page.goto('/auth/sign-in')
    await settle(page)
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible()

    await expect(async () => {
      await page.getByRole('combobox', { name: 'Language' }).click()
      await expect(page.getByRole('option', { name: 'Norsk Bokmål' })).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('option', { name: 'Norsk Bokmål' }).click()

    // The page re-renders in Norwegian and the choice is kept.
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toHaveCount(0, {
      timeout: 30_000,
    })
    const cookie = (await context.cookies()).find((c) => c.name === 'locale')
    expect(cookie?.value).toBe('nb')
  })
})
