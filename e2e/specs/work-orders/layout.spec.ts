import { expect, test } from '@playwright/test'
import { settle } from '../../support/hydration'
import { addPart, newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * The shape of the work order page, and the one rule underneath it: each field
 * exists once.
 *
 * Both columns used to be rendered twice, one layer per breakpoint with the
 * other hidden by CSS, which put two of every input in the document under the
 * same id and name. The form submitted the hidden copy's values, native
 * validation objected to controls the browser then refused to focus and
 * abandoned the submit in silence, and every editor row was mounted twice.
 * These tests are what keeps the page down to one copy.
 *
 * The rest is what the layout has to keep doing either way: the job and the
 * sidebar scrolling separately on a wide screen, one stack on a narrow one,
 * a sidebar that can be dragged, and a page that never grows taller than the
 * window whatever is piled into it.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

let jobUrl = ''

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E layout ${stamp}`)
  await addPart(page, { name: `E2E cabin filter ${stamp}`, quantity: 1, unitPrice: 240 })
  await saveWorkOrder(page)
  await page.close()
})

test.describe('the work order page', () => {
  test('holds one copy of each field, not one per breakpoint', async ({ page }) => {
    await page.goto(jobUrl)
    await expect(page.getByTestId('service-layout')).toBeVisible()
    // Counted on a page that has finished arriving: across a navigation the
    // old document and the new one can both answer for a moment, and a count
    // taken then is a count of two pages.
    await settle(page)

    // Named fields, an id, and an editor row: one of each.
    for (const selector of [
      'input[name="title"]',
      '#invoiceNumber',
      'textarea[placeholder="Name *"]',
    ]) {
      await expect(page.locator(selector), `${selector} appears once`).toHaveCount(1)
    }

    // And nothing in the form shares a name with anything else in it.
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
  })

  test('scrolls the job and the sidebar separately on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await page.goto(jobUrl)

    const main = page.getByTestId('service-main')
    const sidebar = page.getByTestId('service-sidebar')

    // The two columns share one row of the grid, so they are the same height
    // as the layer around them and each takes its own overflow.
    const layerHeight = await page.getByTestId('service-layout').evaluate((el) => el.clientHeight)
    for (const [name, column] of [
      ['the job', main],
      ['the sidebar', sidebar],
    ] as const) {
      const box = await column.evaluate((el) => ({
        client: el.clientHeight,
        scroll: el.scrollHeight,
        overflowY: getComputedStyle(el).overflowY,
      }))
      expect(box.client, `${name} fills the row`).toBe(layerHeight)
      expect(box.overflowY, `${name} scrolls itself`).toBe('auto')
      expect(box.scroll, `${name} has more than fits`).toBeGreaterThan(box.client)
    }

    await main.evaluate((el) => el.scrollBy(0, 200))
    expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(
      await sidebar.evaluate((el) => el.scrollTop),
      'scrolling the job leaves the sidebar where it was'
    ).toBe(0)
  })

  test('never lets the page grow taller than the window', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await page.goto(jobUrl)

    // The whole reason the shell is built the way it is: content in either
    // column must not push the document past the viewport.
    const overflow = await page.evaluate(
      () => (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight
    )
    expect(overflow, 'the document is no taller than the window').toBeLessThanOrEqual(1)
  })

  test('lets the sidebar be dragged wider', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 })
    await page.goto(jobUrl)

    const sidebar = page.getByTestId('service-sidebar')
    const before = (await sidebar.boundingBox())?.width ?? 0
    const handle = page.getByTestId('service-resize')
    const grip = await handle.boundingBox()
    expect(grip, 'the drag handle is on screen').not.toBeNull()

    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip!.x - 160, grip!.y + grip!.height / 2, { steps: 8 })
    await page.mouse.up()

    const after = (await sidebar.boundingBox())?.width ?? 0
    expect(after, 'dragging left widens the sidebar').toBeGreaterThan(before + 100)
  })

  test('stacks into one scroller on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(jobUrl)

    // Still one of each field, and still exactly one of them.
    await expect(page.locator('input[name="title"]')).toHaveCount(1)
    await expect(page.locator('input[name="title"]')).toBeVisible()

    // Nothing to drag when there is nothing beside anything.
    await expect(page.getByTestId('service-resize')).toBeHidden()

    // One scroller around the pair, rather than one each.
    const layer = page.getByTestId('service-layout')
    expect(await layer.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true)
    for (const id of ['service-main', 'service-sidebar']) {
      expect(
        await page.getByTestId(id).evaluate((el) => el.scrollHeight > el.clientHeight + 1),
        `${id} does not scroll on its own`
      ).toBe(false)
    }

    await layer.evaluate((el) => el.scrollBy(0, 300))
    expect(await layer.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  })

  test('saves from a narrow screen, with the values that are on it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(jobUrl)

    const title = page.locator('input[name="title"]')
    const renamed = `E2E layout narrow ${stamp}`
    await expect(async () => {
      await title.fill(renamed)
      await expect(title).toHaveValue(renamed, { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveWorkOrder(page)

    // The old shell submitted whichever copy the layout had hidden, so a
    // narrow screen could save the desktop copy's stale title.
    await page.reload()
    await settle(page)
    await expect(page.locator('input[name="title"]')).toHaveCount(1)
    await expect(page.locator('input[name="title"]')).toHaveValue(renamed)
  })
})
