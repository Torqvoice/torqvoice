import { expect, test } from '@playwright/test'

/**
 * What the server refuses on a form is said under the field it is about, in
 * the person's words: the server's schema, its error shape and the form all
 * have to be put together for this to work, so it is checked here end to end.
 *
 * It used to be a box over the form reading "email: Invalid email". An
 * address the browser takes as one ("kari@nordvik") is still refused by the
 * server, which is how this reaches the server at all. Nothing is saved.
 */
test('an email the server refuses is said under the email, and nothing typed is lost', async ({
  page,
}) => {
  await page.goto('/customers')
  await page.getByRole('button', { name: 'Add Customer' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add New Customer' })
  await expect(dialog).toBeVisible()

  const name = `E2E field errors ${Date.now()}`
  await dialog.locator('#name').fill(name)
  await dialog.locator('#email').fill('kari@nordvik')
  await dialog.locator('button[type="submit"]').click()

  const email = dialog.locator('#email')
  await expect(dialog.getByText('Enter an email address like name@example.com.')).toBeVisible()
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toBeFocused()
  await expect(page.getByText(/Invalid email/)).toHaveCount(0)
  // The dialog stays on what was typed.
  await expect(dialog.locator('#name')).toHaveValue(name)
  await expect(email).toHaveValue('kari@nordvik')

  // Fixing it takes the mark away.
  await email.fill('kari@example.com')
  await expect(dialog.getByText('Enter an email address like name@example.com.')).toHaveCount(0)
  await expect(email).not.toHaveAttribute('aria-invalid', 'true')
})
