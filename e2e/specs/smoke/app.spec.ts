import { test, expect } from '@playwright/test'

/**
 * The cheapest possible proof that a build is not dead on arrival: the session
 * survives, the main lists render, and the contract the technician app depends
 * on still answers.
 */

test.describe('smoke', () => {
  test('the authenticated shell loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).not.toHaveURL(/\/auth\//)
    await expect(page.locator('#password')).toHaveCount(0)
  })

  test('the seeded workshop has customers and vehicles', async ({ page }) => {
    // Lists render a card for phones and a table for wider screens and hide
    // one of them; the table is the visible one at the desktop size used here.
    await page.goto('/customers')
    await expect(page.getByRole('table').getByText('James Mitchell').first()).toBeVisible()

    // The vehicle list opens as a grid of cards, each headed by the vehicle's
    // name; searched, so the one asserted on is on the first page.
    await page.goto('/vehicles?search=Camry')
    await expect(page.getByRole('heading', { name: /Camry/i }).first()).toBeVisible()
  })

  test('the technician app handshake still answers', async ({ request }) => {
    // The mobile app calls this before a technician can type anything else. A
    // change to its shape strands every phone, and no unit test would notice.
    const response = await request.get('/api/v1/tech/health')
    expect(response.status()).toBe(200)

    const body = (await response.json()) as {
      data?: { service?: string; api?: string; minAppVersion?: string }
    }
    expect(body.data?.service).toBe('torqvoice')
    expect(body.data?.api).toBe('v1')
    expect(body.data?.minAppVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
