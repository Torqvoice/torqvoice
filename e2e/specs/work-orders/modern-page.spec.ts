import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  deleteTechnicians,
  insertTechnician,
  jobAssignment,
  ownerOrganizationId,
  paymentsFor,
} from '../../support/db'
import { fillSettled, settle } from '../../support/hydration'
import { TINY_PNG } from '../../support/pdf'
import { setInvoiceLock } from '../../support/settings'
import {
  addPart,
  jobIdOf,
  newWorkOrder,
  partRows,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
  useModernLayout,
} from '../../support/work-order'

/**
 * What the overhauled work order page does, beyond laying the classic one's
 * fields out differently. `modern-layout.spec.ts` covers switching to it and
 * the one-copy-of-each-field rule; this file drives the things that exist
 * only here or behave differently here: the job facts and the header's type,
 * the concern story (condition, cause, correction, confirm) and the question
 * before completing a job with a concern nobody confirmed, the files card,
 * the technician list, the notes, and a locked invoice that still takes a
 * status, a payment and an internal note.
 *
 * Every test opens the page from a context carrying the layout cookie, so the
 * rest of the suite stays on the classic page. The jobs are made on the
 * classic page first, each with a part: `/service/new` hands back an
 * untouched draft younger than five seconds instead of making a new one.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

let vehicleUrl = ''
let factsJob = ''
let filesJob = ''
let scheduleJob = ''

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  factsJob = await jobWithPart(page, `E2E modern facts ${stamp}`)
  filesJob = await jobWithPart(page, `E2E modern files ${stamp}`)
  scheduleJob = await jobWithPart(page, `E2E modern schedule ${stamp}`)
  await page.close()
})

test.beforeEach(async ({ context, baseURL }) => {
  await useModernLayout(context, baseURL ?? 'http://127.0.0.1:3100')
})

async function jobWithPart(page: Page, title: string): Promise<string> {
  const url = await newWorkOrder(page, vehicleUrl, title)
  await addPart(page, { name: `${title} part`, quantity: 1, unitPrice: 500 })
  await saveWorkOrder(page)
  return url
}

/** Opens a job on the overhauled page and waits for it to be usable. */
async function openModern(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await settle(page)
  await expect(page.getByTestId('service-layout-modern')).toBeVisible()
}

/**
 * Clicks low in a notes box, well below the first line, and types. The box is
 * taller than what is written in it, and a click in that empty space has to
 * put the cursor in the text the way a textarea does.
 */
async function typeInNotes(page: Page, card: Locator, text: string): Promise<void> {
  const area = card.getByTestId('rich-text-area')
  const editor = card.locator('.ProseMirror')
  await expect(async () => {
    const box = await area.boundingBox()
    if (!box) throw new Error('notes box not on screen')
    await area.click({ position: { x: box.width / 2, y: box.height - 12 } })
    await expect(editor).toBeFocused({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.keyboard.type(text)
  await expect(editor).toContainText(text)
}

function stepper(page: Page): Locator {
  return page.getByTestId('status-stepper')
}

async function expectStatus(page: Page, name: RegExp): Promise<void> {
  await expect(stepper(page).getByRole('button', { name })).toHaveAttribute('aria-current', 'step')
}

test.describe('the overhauled work order page', () => {
  test('keeps the type, set in the header, and the mileage, set on the facts card', async ({
    page,
  }) => {
    await openModern(page, factsJob)

    const facts = page.getByTestId('job-facts')
    await expect(facts).toContainText('Camry')
    await expect(facts.getByRole('link', { name: 'Open customer' })).toBeVisible()

    const type = page.getByTestId('service-type')
    await expect(async () => {
      await type.click()
      await expect(page.getByRole('option', { name: 'Repair' })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('option', { name: 'Repair' }).click()
    await fillSettled(page.locator('#mileage'), '123456')
    await saveWorkOrder(page)

    await page.reload()
    await settle(page)
    await expect(page.getByTestId('service-type')).toContainText('Repair')
    await expect(page.locator('#mileage')).toHaveValue('123456')
  })

  test('shows the whole customer and vehicle under "More info", with the VIN one click from the clipboard', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: baseURL ?? 'http://127.0.0.1:3100',
    })
    await openModern(page, factsJob)
    const facts = page.getByTestId('job-facts')
    const details = facts.getByTestId('vehicle-details')
    await expect(details).toHaveCount(0)

    await expect(async () => {
      await facts.getByRole('button', { name: 'More info' }).click()
      await expect(details).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await expect(details.getByTestId('vehicle-detail-vehicle')).toContainText('Camry')
    // The same switch opens the customer's half: every customer has a "since".
    await expect(facts.getByTestId('customer-details')).toContainText('Customer since')

    // The reason for the list: the VIN, copied without leaving the job.
    const vinRow = details.getByTestId('vehicle-detail-vin')
    const vin = (await vinRow.locator('dd span').first().innerText()).trim()
    expect(vin).toMatch(/^[A-HJ-NPR-Z0-9]{17}$/)
    await vinRow.getByRole('button', { name: 'Copy VIN' }).click()
    await expect(vinRow.getByRole('button', { name: 'Copied' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(vin)

    // The plate on the card copies too; the vehicle's name is the link.
    const plate = facts.getByTestId('copy-plate')
    const plateText = (await plate.innerText()).trim()
    await plate.click()
    await expect(plate).toContainText('Copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(plateText)
    await expect(plate).toHaveText(plateText)

    // Left open, it opens again next time; closed, it stays closed.
    await page.reload()
    await settle(page)
    await expect(page.getByTestId('vehicle-details')).toBeVisible()
    await page.getByTestId('job-facts').getByRole('button', { name: 'Less info' }).click()
    await expect(page.getByTestId('vehicle-details')).toHaveCount(0)
    await expect(page.getByTestId('customer-details')).toHaveCount(0)
  })

  test('writes in both notes from a click anywhere in the box, and saves them', async ({
    page,
  }) => {
    await openModern(page, factsJob)

    const internal = `Pads measured 2 mm on the left ${stamp}`
    const customer = `Front pads replaced, discs within limits ${stamp}`
    await typeInNotes(page, page.getByTestId('notes-internal'), internal)
    await typeInNotes(page, page.getByTestId('notes-customer'), customer)
    await saveWorkOrder(page)

    await page.reload()
    await settle(page)
    await expect(page.getByTestId('notes-internal').locator('.ProseMirror')).toContainText(internal)
    await expect(page.getByTestId('notes-customer').locator('.ProseMirror')).toContainText(customer)
  })

  test('tells a concern as condition, cause, correction and confirmation', async ({ page }) => {
    await openModern(page, factsJob)

    const concerns = page.getByTestId('customer-concerns')
    const story = concerns.getByTestId('concern-story').first()
    const words = {
      condition: `Squeal from the front left when braking ${stamp}`,
      cause: 'Inner pad worn to the backing plate',
      correction: 'Replaced front pads and cleaned the slides',
      confirm: 'Test drive, no noise',
    }

    await fillSettled(
      story.getByPlaceholder('What the customer reported, or what you observed'),
      words.condition
    )
    await story.getByTestId('concern-step-cause').click()
    await story.getByPlaceholder('What testing showed the root cause to be').fill(words.cause)
    await story.getByTestId('concern-step-correction').click()
    await story.getByPlaceholder('What was done to fix it').fill(words.correction)
    await story.getByTestId('concern-step-confirm').click()
    await story
      .getByPlaceholder('How the fix was checked: test drive, re-scan, symptom gone')
      .fill(words.confirm)
    await story.getByTestId('concern-confirmed').click()
    await expect(story).toContainText('Stamped with your name when you save')
    await saveWorkOrder(page)

    await page.reload()
    await settle(page)
    const saved = page.getByTestId('customer-concerns').getByTestId('concern-story').first()
    await expect(saved.getByTestId('concern-step-condition')).toContainText(words.condition)
    await expect(saved.getByTestId('concern-step-cause')).toContainText(words.cause)
    await expect(saved.getByTestId('concern-step-correction')).toContainText(words.correction)
    await expect(saved.getByTestId('concern-step-confirm')).toContainText(words.confirm)
    await saved.getByTestId('concern-step-confirm').click()
    // The stamp is the server's: who ticked it, and when.
    await expect(saved).toContainText('Confirmed by')
    await expect(page.getByTestId('concerns-confirmed')).toHaveText('1 of 1 confirmed')
  })

  test('asks before completing a job with a concern nobody confirmed', async ({ page }) => {
    await openModern(page, factsJob)

    const concerns = page.getByTestId('customer-concerns')
    const stories = concerns.getByTestId('concern-story')
    const add = concerns.getByRole('button', { name: 'Add another' })
    // A blank row may already be waiting; otherwise ask for one.
    if (await add.isEnabled()) {
      const before = await stories.count()
      await expect(async () => {
        await add.click()
        await expect(stories).toHaveCount(before + 1, { timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
    }
    const open = `Aircon smells musty ${stamp}`
    await stories
      .last()
      .getByPlaceholder('What the customer reported, or what you observed')
      .fill(open)
    await saveWorkOrder(page)

    const question = page.getByRole('alertdialog', { name: 'Complete with unconfirmed concerns?' })
    await stepper(page)
      .getByRole('button', { name: /Completed/ })
      .click()
    await expect(question).toContainText(open)
    await question.getByRole('button', { name: 'Cancel' }).click()
    await expect(question).toBeHidden()
    await expect(stepper(page).getByRole('button', { name: /Completed/ })).not.toHaveAttribute(
      'aria-current',
      'step'
    )

    await stepper(page)
      .getByRole('button', { name: /Completed/ })
      .click()
    await question.getByRole('button', { name: 'Complete anyway' }).click()
    await expectStatus(page, /Completed/)
    await saveWorkOrder(page)

    await page.reload()
    await settle(page)
    await expectStatus(page, /Completed/)
  })

  test('files photos and video on the job, shown to the customer until hidden', async ({
    page,
  }) => {
    await openModern(page, filesJob)
    const files = page.getByTestId('files-media')
    const tiles = files.getByTestId('media-tile')

    // A photo: shown to the customer from the moment it lands, then hidden.
    await files.locator('input[type="file"]').setInputFiles({
      name: `e2e-photo-${stamp}.png`,
      mimeType: 'image/png',
      buffer: TINY_PNG,
    })
    await expect(tiles).toHaveCount(1)
    await expect(tiles.first()).toContainText('Customer can see')
    await expect(async () => {
      await tiles.first().getByRole('button', { name: 'Hide from the customer' }).click()
      await expect(tiles.first()).not.toContainText('Customer can see', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    // Read back: the switch turns before the write lands.
    await expect(async () => {
      await page.reload()
      await settle(page)
      await expect(page.getByTestId('media-tile').first()).not.toContainText('Customer can see', {
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })

    // A video goes to the customer too, as on the classic page: the shared
    // link plays it. And it plays here, not in a new tab.
    const clip = `e2e-clip-${stamp}.mp4`
    await files.getByRole('tab', { name: /^Video/ }).click()
    await files.locator('input[type="file"]').setInputFiles({
      name: clip,
      mimeType: 'video/mp4',
      // The server keeps the bytes as they came when it cannot re-encode them.
      buffer: Buffer.from(`not really a video ${stamp}`),
    })
    await expect(tiles).toHaveCount(1)
    await expect(tiles.first()).toContainText('Customer can see')
    await tiles.first().getByRole('button', { name: clip }).click()
    const player = page.getByRole('dialog', { name: clip })
    await expect(player.locator('video')).toHaveAttribute('src', /\/api\/protected\/files\//)
    await page.keyboard.press('Escape')
    await expect(player).toBeHidden()
  })

  test('lands a link to an old tab on that tab of the files card', async ({ page }) => {
    await page.goto(`${filesJob}?tab=documents`)
    await settle(page)
    const files = page.getByTestId('files-media')
    await expect(files.getByRole('tab', { name: /^Documents/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(files).toBeInViewport()
  })

  test.describe('the technician list', () => {
    let technicianId = ''
    const technicianName = `E2E Mechanic ${stamp}`

    test.beforeAll(async () => {
      technicianId = await insertTechnician(await ownerOrganizationId(), technicianName)
    })

    test.afterAll(async () => {
      await deleteTechnicians([technicianId])
    })

    test('puts a technician on the job with one click', async ({ page }) => {
      await openModern(page, scheduleJob)

      const list = page.getByRole('radiogroup', { name: 'Technician' })
      const technician = list.getByRole('radio', { name: new RegExp(technicianName) })
      await expect(async () => {
        await technician.click()
        await expect(technician).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      await expect
        .poll(async () => (await jobAssignment(jobIdOf(scheduleJob))).technicianId)
        .toBe(technicianId)

      await page.reload()
      await settle(page)
      await expect(
        page
          .getByRole('radiogroup', { name: 'Technician' })
          .getByRole('radio', { name: new RegExp(technicianName) })
      ).toHaveAttribute('aria-checked', 'true')
      // The way to the workshop's defaults is here, as on the classic picker.
      await expect(page.getByRole('link', { name: 'Set Defaults' })).toHaveAttribute(
        'href',
        '/settings/workshop'
      )
    })
  })

  test.describe('on a locked invoice', () => {
    let lockedJob = ''

    test.beforeAll(async ({ browser }) => {
      const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
      // On first, so the share below is a send the lock counts.
      await setInvoiceLock(page, { enabled: true, trigger: 'sent' })
      lockedJob = await jobWithPart(page, `E2E modern locked ${stamp}`)
      await shareLink(page)
      await page.close()
    })

    test.afterAll(async ({ browser }) => {
      const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
      await setInvoiceLock(page, { enabled: false, trigger: 'sent' })
      await page.close()
    })

    test('freezes what is owed and nothing else', async ({ page }) => {
      await openModern(page, lockedJob)
      await expect(
        page.getByText('This invoice is locked because it has been sent', { exact: true })
      ).toBeVisible()

      // Frozen: the lines, the mileage, and the notes the invoice prints.
      await expect(partRows(page).first()).toBeDisabled()
      await expect(page.locator('#mileage')).toBeDisabled()
      // Still readable: the vehicle's details open on a locked invoice too.
      await page.getByTestId('job-facts').getByRole('button', { name: 'More info' }).click()
      await expect(page.getByTestId('vehicle-details')).toBeVisible()
      await expect(page.getByTestId('notes-customer').locator('.ProseMirror')).toHaveAttribute(
        'contenteditable',
        'false'
      )

      // Still moving: the status, saved on its own.
      await stepper(page)
        .getByRole('button', { name: /Waiting Parts/ })
        .click()
      await expectStatus(page, /Waiting Parts/)

      // Still written: the internal notes, saved on their own.
      const note = `Customer will collect on Friday ${stamp}`
      await typeInNotes(page, page.getByTestId('notes-internal'), note)
      await expect(page.getByText('Saved', { exact: true })).toBeVisible()

      // Still paid: the bar's button opens a form that works, and Enter in
      // the amount records the payment rather than saving the job.
      const bar = page.getByTestId('money-bar')
      await bar.getByRole('button', { name: 'Take payment' }).click()
      const amount = page.locator('#paymentAmount')
      await expect(amount).toBeEnabled()
      await expect(amount).toBeFocused()
      await amount.fill('100')
      await amount.press('Enter')
      await expect(page.getByText('Payment recorded', { exact: true })).toBeVisible()
      // Recording a payment offers to tell the customer; not today.
      const notify = page.getByRole('dialog', { name: /^Notify / })
      await expect(notify).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(notify).toBeHidden()
      await expect(bar.getByTestId('money-paid')).toContainText('100')
      await expect.poll(async () => (await paymentsFor(jobIdOf(lockedJob))).length).toBe(1)
      expect((await paymentsFor(jobIdOf(lockedJob)))[0].amount).toBe(100)

      await page.reload()
      await settle(page)
      await expectStatus(page, /Waiting Parts/)
      await expect(page.getByTestId('notes-internal').locator('.ProseMirror')).toContainText(note)
      const activity = page
        .getByRole('heading', { name: 'Activity', exact: true })
        .locator('xpath=ancestor::*[.//ol][1]')
      await expect(activity).toContainText('Invoice link shared')
      await expect(activity).toContainText('Payment of')
    })

    test('keeps both notes read-only on the classic page, rather than losing what is typed', async ({
      page,
      context,
    }) => {
      await context.clearCookies({ name: 'workOrderLayout' })
      await page.goto(lockedJob)
      await settle(page)
      await expect(page.getByTestId('service-layout')).toBeVisible()
      await expect(page.locator('.ProseMirror').first()).toHaveAttribute('contenteditable', 'false')
    })
  })
})
