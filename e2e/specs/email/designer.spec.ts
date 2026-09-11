import { expect, test } from '@playwright/test'
import { emailTemplateNames, forgetEmailTemplates } from '../../support/db'
import { settle } from '../../support/hydration'
import {
  openPreset,
  openSubjectAndTheme,
  preview,
  railBlock,
  railOrder,
  saveDesign,
  subjectField,
} from '../../support/email-designer'

/**
 * The email designer, from the gallery to a saved template.
 *
 * Every mail a workshop sends is built from one of these, so the failure
 * modes are worth naming: a block hidden in the designer that still prints in
 * the mail, a misspelt tag saved and then sent to a customer as
 * "{custmer_name}", or a template saved under a name that already exists and
 * quietly replacing the other one.
 *
 * The preview is a real iframe of the rendered mail, which is why it can be
 * asserted against at all: what the frame holds is what the mail client gets.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const TEMPLATE = `E2E invoice mail ${stamp}`
const SECOND = `E2E second mail ${stamp}`
/** A sentence nothing else in the app says, to find in the preview and the mail. */
const SENTENCE = `Your invoice is ready, ${stamp}`

test.afterAll(async () => {
  // No test's design is left sending the workshop's mail.
  await forgetEmailTemplates('E2E ')
})

test.describe('the gallery', () => {
  test('offers every kind of mail, each on its built-in template', async ({ page }) => {
    await page.goto('/settings/email-templates')
    await settle(page)

    // The kinds come from EMAIL_KINDS; the page groups them, and each group
    // names the kinds under it.
    for (const kind of [
      'Invoice sent',
      'Quote sent',
      'Inspection report sent',
      'Customer message',
      'Portal sign-in',
    ]) {
      await expect(
        page.getByRole('heading', { name: kind, exact: true }),
        `${kind} has a section`
      ).toBeVisible()
    }

    // Nothing is designed yet, so every kind sends with its preset and says so.
    const builtIn = page.getByText('Built-in', { exact: true })
    expect(await builtIn.count(), 'a built-in card per kind').toBeGreaterThanOrEqual(5)
    expect(await page.getByText('In use', { exact: true }).count()).toBeGreaterThanOrEqual(5)
  })

  test('opens the designer in a tab of its own', async ({ page }) => {
    await page.goto('/settings/email-templates')
    await settle(page)

    // A card is a link, and it opens beside the settings page rather than
    // taking the workshop out of it.
    const card = page.getByRole('link').filter({ hasText: 'Built-in' }).first()
    await expect(card).toHaveAttribute('target', '_blank')
    await expect(card).toHaveAttribute('href', /\/email-designer\?kind=\w+&preset=1/)
  })
})

test.describe('the designer', () => {
  test('shows the mail it is designing, block by block', async ({ page }) => {
    await openPreset(page, 'invoice_sent')

    // The rail and the mail point at each other through these marks, which is
    // how a click in one selects in the other.
    const blocks = await railOrder(page)
    expect(blocks, 'the preset is the mail a workshop expects').toEqual([
      'header',
      'heading',
      'intro',
      'message',
      'summary',
      'cta',
      'attachment',
      'outro',
      'divider',
      'footer',
    ])

    for (const id of blocks.filter((block) => block !== 'divider')) {
      await expect(
        preview(page).locator(`[data-block="${id}"]`),
        `${id} is in the mail`
      ).toBeAttached()
    }

    // The exception, and it is deliberate: the footer is lifted out of the
    // card, and a rule immediately above it would underline nothing, so it
    // goes with it. Moving the footer up brings the rule back.
    await expect(
      preview(page).locator('[data-block="divider"]'),
      'a rule at the foot of the card is dropped with the footer'
    ).toHaveCount(0)
  })

  test('a block clicked in the rail is the one the inspector edits', async ({ page }) => {
    await openPreset(page, 'invoice_sent')
    await expect(async () => {
      await railBlock(page, 'intro').click()
      await expect(railBlock(page, 'intro')).toHaveAttribute('aria-pressed', 'true', {
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })

    // The inspector swaps from "Subject and theme" to that block's own fields.
    await expect(page.getByLabel('Text', { exact: true })).toBeVisible()
    await expect(subjectField(page), 'the subject is put away while a block is open').toHaveCount(0)

    // And the way back, which is how a workshop reaches the subject again.
    await openSubjectAndTheme(page)
    await expect(railBlock(page, 'intro')).toHaveAttribute('aria-pressed', 'false')
  })

  test('line and paragraph spacing set in the theme reach the mail', async ({ page }) => {
    // Every line of body text used to sit at one fixed height and every
    // paragraph at one fixed gap; a workshop that found the mail airy had
    // nothing to turn. The theme has two steps for it now.
    await openPreset(page, 'invoice_sent')
    await openSubjectAndTheme(page)
    const intro = preview(page).locator('[data-block="intro"] td').first()
    await expect(intro).toHaveAttribute('style', /line-height:1\.6;/)

    await page.getByRole('combobox', { name: 'Line spacing' }).click()
    await page.getByRole('option', { name: 'Relaxed', exact: true }).click()
    await expect(intro, 'the body lines open up').toHaveAttribute('style', /line-height:1\.8;/)

    await page.getByRole('combobox', { name: 'Paragraph spacing' }).click()
    await page.getByRole('option', { name: 'Tight', exact: true }).click()
    await expect(intro, 'the text blocks close ranks').toHaveAttribute(
      'style',
      /padding:0 0 10px 0;/
    )

    await page.getByRole('combobox', { name: 'Line spacing' }).click()
    await page.getByRole('option', { name: 'Compact', exact: true }).click()
    await expect(intro).toHaveAttribute('style', /line-height:1\.4;/)
  })

  test('a block hidden in the rail leaves the mail', async ({ page }) => {
    await openPreset(page, 'invoice_sent')
    const row = railBlock(page, 'outro')

    await expect(preview(page).locator('[data-block="outro"]')).toBeAttached()
    await expect(async () => {
      await row.getByRole('button', { name: /Shown in the email/ }).click()
      await expect(
        preview(page).locator('[data-block="outro"]'),
        'the hidden block is not in the mail'
      ).toHaveCount(0, { timeout: 3_000 })
    }).toPass({ timeout: 30_000 })

    // And the row says what it is now, so the eye is not a mystery toggle.
    await expect(row.getByRole('button', { name: /Hidden from the email/ })).toBeVisible()
  })

  test('the plain text half says the same as the mail', async ({ page }) => {
    await openPreset(page, 'invoice_sent')

    // Every mail goes out with both halves; a client that shows text only
    // must still be able to read it, and follow the button.
    await page.getByRole('button', { name: 'Show the plain-text version' }).click()
    const text = await page.locator('pre').first().innerText()
    expect(text.length, 'the text half has words in it').toBeGreaterThan(40)
    // A button cannot be clicked in plain text, so it is spelled out.
    expect(text).toMatch(/https?:\/\//)
  })

  test('a misspelt tag is a problem, and the problem blocks the save', async ({ page }) => {
    await openPreset(page, 'invoice_sent')

    const subject = subjectField(page)
    await expect(subject).toBeVisible()
    await subject.fill('Invoice for {custmer_name}')

    // The badge counts what is wrong and the tooltip names the tag; either
    // way Save is out of reach until it is fixed.
    await expect(page.getByText(/problem/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

    // Spelled correctly, it is a tag again and the mail fills it in.
    await subject.fill('Invoice for {customer_name}')
    await expect(page.getByText(/problem/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  })

  test('an invalid colour blocks the save and says why', async ({ page }) => {
    await openPreset(page, 'invoice_sent')

    const hex = page.getByLabel('Primary as hex')
    await hex.fill('#zzz')
    await expect(page.getByText('A colour is not a valid hex value')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

    await hex.fill('#1d4ed8')
    await expect(page.getByText('A colour is not a valid hex value')).toHaveCount(0)
  })
})

test.describe('saving a design', () => {
  test('the first save asks for a name and takes over the kind', async ({ page }) => {
    await openPreset(page, 'invoice_sent')

    // A sentence of the workshop's own, so the saved template is recognisable
    // in the gallery and in the mail that goes out later.
    await expect(async () => {
      await railBlock(page, 'intro').click()
      await expect(page.getByLabel('Text', { exact: true })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByLabel('Text', { exact: true }).fill(SENTENCE)
    // In the block it was typed into. It is also in the mail's preheader, the
    // hidden line an inbox shows beside the subject, which is drawn from the
    // first paragraph.
    await expect(preview(page).locator('[data-block="intro"]').getByText(SENTENCE)).toBeVisible()

    await saveDesign(page, TEMPLATE)

    // The tab is now on the saved template rather than the preset it started
    // from: saving again updates it instead of making a second one.
    await expect(page).toHaveURL(/[?&]template=/)
    // The button is named for what it would do, so "Saved" is also the check
    // that there is nothing left unsaved.
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
    expect(await emailTemplateNames('invoice_sent')).toContain(TEMPLATE)
  })

  test('the gallery shows it in use, and offers the way back', async ({ page }) => {
    await page.goto('/settings/email-templates')
    await settle(page)

    const card = page
      .locator('div')
      .filter({ has: page.getByText(TEMPLATE, { exact: true }) })
      .last()
    await expect(card.getByText('In use', { exact: true })).toBeVisible()
    // The built-in card is no longer the one sending, so it offers itself.
    await expect(page.getByRole('button', { name: 'Use built-in' }).first()).toBeVisible()
  })

  test('a second template cannot take the first one’s name', async ({ page }) => {
    await openPreset(page, 'invoice_sent')
    await subjectField(page).fill(`Second ${stamp}`)

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Save this template' })
    await dialog.getByPlaceholder('Template name').fill(TEMPLATE)

    // Refused on the spot, before the save is even attempted: a workshop with
    // two templates called the same thing cannot tell them apart afterwards.
    await expect(dialog.getByRole('alert')).toHaveText(/already exists/)
    await expect(dialog.getByRole('button', { name: 'Save template', exact: true })).toBeDisabled()

    // Under its own name it saves.
    await dialog.getByPlaceholder('Template name').fill(SECOND)
    await dialog.getByRole('button', { name: 'Save template', exact: true }).click()
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Saved' }).first()
    ).toBeVisible({ timeout: 30_000 })
    expect(await emailTemplateNames('invoice_sent')).toEqual(
      expect.arrayContaining([TEMPLATE, SECOND])
    )
  })

  test('deleting the one in use puts the kind back on its preset', async ({ page }) => {
    await page.goto('/settings/email-templates')
    await settle(page)

    // The second save took the kind over, so this is the one in use.
    const card = page
      .locator('div')
      .filter({ has: page.getByText(SECOND, { exact: true }) })
      .last()
    await expect(async () => {
      await card.getByRole('button', { name: 'Delete' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByText(SECOND, { exact: true })).toHaveCount(0, { timeout: 30_000 })
    expect(await emailTemplateNames('invoice_sent')).not.toContain(SECOND)
  })
})
