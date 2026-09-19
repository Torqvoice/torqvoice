import { expect, test } from '@playwright/test'
import { settle } from '../../support/hydration'
import { addPart, newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * The overhauled work order page, and the rule that nobody is moved to it
 * without asking.
 *
 * The classic page carries an invitation; accepting it switches this browser
 * (a cookie, so the server renders the right page from then on), and the new
 * page carries the way back. Both pages are the same form, so what these
 * tests hold the new one to is what `layout.spec.ts` holds the old one to:
 * each field once, and a save that keeps what was on screen.
 *
 * Every test here starts from a context with no layout cookie, so the rest of
 * the suite, which shares the owner's storage state, stays on the classic page.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const partName = `E2E wiper blade ${stamp}`

let jobUrl = ''

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E modern layout ${stamp}`)
  await addPart(page, { name: partName, quantity: 2, unitPrice: 150 })
  await saveWorkOrder(page)
  await page.close()
})

test.describe('the overhauled work order page', () => {
  test('is offered on the classic page and not forced on anybody', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)

    await expect(page.getByTestId('service-layout')).toBeVisible()
    await expect(page.getByTestId('service-layout-modern')).toHaveCount(0)
    await expect(page.getByTestId('try-new-layout')).toContainText(
      'The work order page has been overhauled.'
    )
  })

  test('opens on "Try it now", survives a reload, and leads back', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)

    await page.getByRole('button', { name: 'Try it now' }).click()
    await expect(page.getByTestId('service-layout-modern')).toBeVisible()
    await expect(page.getByTestId('service-layout')).toHaveCount(0)
    await expect(page.getByTestId('try-new-layout')).toHaveCount(0)

    // The choice is the server's to read: a reload lands on the new page
    // without the classic one flashing past first.
    await page.reload()
    await settle(page)
    await expect(page.getByTestId('service-layout-modern')).toBeVisible()
    // The top of the page is the work order's number and its status, then
    // what the job is called.
    const hero = page.getByTestId('service-hero')
    await expect(hero.getByTestId('service-number')).not.toBeEmpty()
    await expect(hero.getByTestId('service-status')).toHaveText('Pending')
    await expect(hero).toContainText(`E2E modern layout ${stamp}`)

    await page.getByRole('button', { name: 'Back to the classic layout' }).click()
    await expect(page.getByTestId('service-layout')).toBeVisible()
    await page.reload()
    await settle(page)
    await expect(page.getByTestId('service-layout')).toBeVisible()
  })

  test('holds one copy of each field and keeps photos on the job', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)
    await page.getByRole('button', { name: 'Try it now' }).click()
    await expect(page.getByTestId('service-layout-modern')).toBeVisible()

    for (const selector of [
      'input[name="title"]',
      '#invoiceNumber',
      '#invoiceDate',
      '#mileage',
      'input[name="techName"]',
      'input[name="serviceDate"]',
      'textarea[placeholder="Name *"]',
    ]) {
      await expect(page.locator(selector), `${selector} appears once`).toHaveCount(1)
    }

    const duplicates = await page.evaluate(() => {
      const form = document.querySelector('form')
      if (!form) return ['no form']
      const seen = new Map<string, number>()
      for (const el of form.querySelectorAll<HTMLInputElement>('input[name], textarea[name]')) {
        seen.set(el.name, (seen.get(el.name) ?? 0) + 1)
      }
      return [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name)
    })
    expect(duplicates, 'field names used twice in the form').toEqual([])

    // No tab bar at the top of the page: photos, documents, diagnostics,
    // video and status reports are tabs of one card on the job itself.
    const files = page.getByTestId('files-media')
    await expect(files).toBeVisible()
    await expect(page.getByRole('button', { name: /^Images/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Status Reports/ })).toHaveCount(0)
    for (const name of [/^Photos/, /^Documents/, /^Diagnostics/, /^Video/, /^Status Reports/]) {
      await expect(files.getByRole('tab', { name })).toBeVisible()
    }
    await expect(files.getByTestId('media-add')).toContainText('Add photos')
    await files.getByRole('tab', { name: /^Status Reports/ }).click()
    await expect(files.getByTestId('status-reports-section')).toBeVisible()
  })

  test('saves the same job the classic page does', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)
    await page.getByRole('button', { name: 'Try it now' }).click()
    await expect(page.getByTestId('service-layout-modern')).toBeVisible()

    // The part saved from the classic page is here, with its figures.
    await expect(page.locator('textarea[placeholder="Name *"]')).toHaveValue(partName)

    // The stepper is the status control: walk the job on and save.
    const stepper = page.getByTestId('status-stepper')
    await stepper.getByRole('button', { name: /In Progress/i }).click()
    await expect(stepper.getByRole('button', { name: /In Progress/i })).toHaveAttribute(
      'aria-current',
      'step'
    )
    // The title is edited in the header, behind its pencil; the form carries
    // it as a hidden field, so Save takes it with everything else.
    const title = `E2E modern layout ${stamp} renamed`
    await page.getByTestId('edit-title').click()
    await page.getByTestId('title-input').fill(title)
    await page.getByTestId('title-input').press('Enter')
    await expect(page.getByTestId('service-title')).toHaveText(title)
    await expect(page.locator('input[name="title"]')).toHaveValue(title)
    await saveWorkOrder(page)

    // Read back on the classic page, which is what everybody else still uses.
    await page.getByRole('button', { name: 'Back to the classic layout' }).click()
    await expect(page.getByTestId('service-layout')).toBeVisible()
    await page.reload()
    await settle(page)
    await expect(page.locator('input[name="title"]')).toHaveValue(title)
    await expect(page.getByRole('combobox').filter({ hasText: 'In Progress' })).toBeVisible()
    await expect(page.locator('textarea[placeholder="Name *"]')).toHaveValue(partName)
  })

  test('stacks into one column on a phone without overflowing sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(jobUrl)
    await settle(page)
    await page.getByRole('button', { name: 'Try it now' }).click()
    const layout = page.getByTestId('service-layout-modern')
    await expect(layout).toBeVisible()

    const overflow = await layout.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow, 'sideways overflow in pixels').toBeLessThanOrEqual(1)

    const main = await page.getByTestId('service-main').boundingBox()
    const sidebar = await page.getByTestId('service-sidebar').boundingBox()
    expect(sidebar?.y ?? 0, 'the sidebar sits under the job').toBeGreaterThan(
      (main?.y ?? 0) + (main?.height ?? 0) - 1
    )
  })
})
