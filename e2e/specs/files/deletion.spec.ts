import { expect, type Page, test } from '@playwright/test'
import { settle } from '../../support/hydration'
import {
  ownerOrganizationId,
  type PlantedVehicle,
  plantVehicleWithFiles,
  removePlantedVehicle,
  userIdFor,
} from '../../support/db'
import {
  onDisk,
  type PlantedFile,
  plantFile,
  removePlanted,
  sharesDiskWithServer,
} from '../../support/files'
import { useModernLayout } from '../../support/work-order'

/**
 * What deleting something does to the files on disk. Every delete goes
 * through the file manager (src/lib/files/manager.ts), which removes a file
 * only once no row points at it, only inside the workshop's own folder, and
 * only after the rows are gone. These specs plant real files and the rows
 * that use them, delete through the page the way a workshop does, and read
 * the disk:
 *
 * - what went with the deleted rows is gone;
 * - what something else still uses stays: a tire set's photo copied onto a
 *   job (the set outlives the job and the vehicle), a quote's document (a
 *   quote outlives its vehicle);
 * - another workshop's file stays, whatever URL a row holds.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
let organizationId = ''
let userId = ''
const foreignOrg = `e2e-foreign-${stamp}`
const planted: PlantedVehicle[] = []
const files: PlantedFile[] = []

async function plantAll(label: string, withInspection = true) {
  const f = {
    vehicleImage: await plantFile(organizationId, 'vehicles'),
    jobPhoto: await plantFile(organizationId, 'services'),
    tireSetPhoto: await plantFile(organizationId, 'tire-hotel'),
    statusVideo: await plantFile(organizationId, 'services', 'mp4'),
    inspectionPhoto: await plantFile(organizationId, 'services'),
    quoteDocument: await plantFile(organizationId, 'quotes', 'pdf'),
    foreignPhoto: await plantFile(foreignOrg, 'services'),
  }
  files.push(...Object.values(f))
  const vehicle = await plantVehicleWithFiles(
    organizationId,
    userId,
    {
      vehicleImage: f.vehicleImage.url,
      jobPhoto: f.jobPhoto.url,
      tireSetPhoto: f.tireSetPhoto.url,
      statusVideo: f.statusVideo.url,
      inspectionPhoto: withInspection ? f.inspectionPhoto.url : undefined,
      quoteDocument: f.quoteDocument.url,
      foreignPhoto: f.foreignPhoto.url,
    },
    `${label} ${stamp}`
  )
  planted.push(vehicle)
  return { f, vehicle }
}

async function expectGone(file: PlantedFile, what: string) {
  await expect.poll(() => onDisk(file), { message: `${what} is deleted` }).toBe(false)
}

function expectKept(file: PlantedFile, what: string) {
  expect(onDisk(file), `${what} is kept`).toBe(true)
}

async function confirmIn(page: Page, dialogTitle: RegExp) {
  const dialog = page.getByRole('alertdialog', { name: dialogTitle })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
}

test.beforeAll(async () => {
  organizationId = await ownerOrganizationId()
  userId = await userIdFor('demo@torqvoice.com')
})

test.beforeEach(() => {
  test.skip(!sharesDiskWithServer(), 'the suite does not share a disk with the app server')
})

test.afterAll(async () => {
  for (const vehicle of planted) await removePlantedVehicle(vehicle).catch(() => undefined)
  await removePlanted(files)
})

test('deleting a vehicle removes its files and keeps what outlives it', async ({ page }) => {
  const { f, vehicle } = await plantAll('E2E files vehicle')
  for (const file of Object.values(f)) expect(onDisk(file)).toBe(true)

  await page.goto(`/vehicles/${vehicle.vehicleId}`)
  await settle(page)
  await expect(async () => {
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await confirmIn(page, /Delete vehicle/)
  await page.waitForURL((url) => !url.pathname.includes(vehicle.vehicleId))

  // Went with the vehicle.
  await expectGone(f.vehicleImage, "the vehicle's image")
  await expectGone(f.jobPhoto, "its job's photo")
  await expectGone(f.statusVideo, "its job's status report video")
  if (vehicle.inspected) await expectGone(f.inspectionPhoto, "its inspection's photo")

  // Still used: the tire set and the quote are not deleted with the vehicle.
  expectKept(f.tireSetPhoto, "the tire set's photo, which was also on the job")
  expectKept(f.quoteDocument, "the quote's document")
  // Not this workshop's to delete, whatever the job's row said.
  expectKept(f.foreignPhoto, "another workshop's file")
})

test("deleting a work order keeps the tire set's photo that was on it", async ({ page }) => {
  const { f, vehicle } = await plantAll('E2E files job', false)

  await page.goto(`/vehicles/${vehicle.vehicleId}/service/${vehicle.serviceRecordId}`)
  await settle(page)
  await expect(async () => {
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await confirmIn(page, /Delete Service Record/)
  await page.waitForURL((url) => !url.pathname.includes(vehicle.serviceRecordId))

  await expectGone(f.jobPhoto, "the job's own photo")
  await expectGone(f.statusVideo, "the job's status report video")
  // This is the file the old delete took from the tire set.
  expectKept(f.tireSetPhoto, "the tire set's photo")
  expectKept(f.vehicleImage, "the vehicle's image")
  expectKept(f.foreignPhoto, "another workshop's file")
})

test("deleting a photo on the work order removes its file, and a tire set's copy leaves it", async ({
  page,
  context,
  baseURL,
}) => {
  await useModernLayout(context, baseURL ?? 'http://127.0.0.1:3100')
  const { f, vehicle } = await plantAll('E2E files photo', false)

  await page.goto(`/vehicles/${vehicle.vehicleId}/service/${vehicle.serviceRecordId}`)
  await settle(page)
  const tiles = page.getByTestId('files-media').getByTestId('media-tile')
  const tileOf = (file: PlantedFile) =>
    tiles.filter({ has: page.locator(`img[src="${file.url}"]`) })

  await expect(tileOf(f.jobPhoto)).toHaveCount(1)
  await tileOf(f.jobPhoto).getByRole('button', { name: 'Delete' }).click()
  await expect(tileOf(f.jobPhoto)).toHaveCount(0)
  await expectGone(f.jobPhoto, 'the deleted photo')

  // The tire set's photo is on the job as a copy; deleting the copy leaves
  // the set its file.
  await expect(tileOf(f.tireSetPhoto)).toHaveCount(1)
  await tileOf(f.tireSetPhoto).getByRole('button', { name: 'Delete' }).click()
  await expect(tileOf(f.tireSetPhoto)).toHaveCount(0)
  expectKept(f.tireSetPhoto, "the tire set's photo")
})
