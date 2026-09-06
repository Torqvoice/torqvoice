import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { isDemoMode } from '@/lib/demo'
import { db } from '@/lib/db'
import { getAiConfig } from '@/lib/ai'
import { getFeatures } from '@/lib/features'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { normalizeCountryCode } from '@/lib/portal-phone'
import type { ImportEntity } from '@/features/import/Lib/fields'
import { fieldsFor } from '@/features/import/Lib/fields'
import {
  ImportParseError,
  MAX_IMPORT_FILE_BYTES,
  parseImportFile,
} from '@/features/import/Lib/parse'
import { IMPORT_PRESETS, presetById } from '@/features/import/Lib/presets'
import { stageImport } from '@/features/import/Lib/staging'
import { suggestMapping } from '@/features/import/Lib/suggest'

export const maxDuration = 120

const ENTITIES: ImportEntity[] = ['customers', 'vehicles', 'services']
const SAMPLE_ROWS = 5

/**
 * Step one of the spreadsheet importer: take the file, parse it, guess the
 * mapping, and park the rows for the later steps. Nothing is written to the
 * database here.
 */
export async function POST(request: NextRequest) {
  if (isDemoMode) {
    return NextResponse.json({ error: 'Data import is disabled on the demo.' }, { status: 403 })
  }
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { organizationId } = ctx

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload.' }, { status: 400 })
  }
  const file = form.get('file')
  const entity = String(form.get('entity') ?? '') as ImportEntity
  const presetId = form.get('preset') ? String(form.get('preset')) : null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 })
  }
  if (!ENTITIES.includes(entity)) {
    return NextResponse.json({ error: 'Unknown import type.' }, { status: 400 })
  }
  if (presetId && !presetById(presetId)) {
    return NextResponse.json({ error: 'Unknown preset.' }, { status: 400 })
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json(
      { error: `The file is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    )
  }

  let sheet: Awaited<ReturnType<typeof parseImportFile>>
  try {
    sheet = await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name)
  } catch (err) {
    if (err instanceof ImportParseError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 })
    }
    console.error('[import] parse failed:', err)
    return NextResponse.json({ error: 'The file could not be read.' }, { status: 400 })
  }

  const staged = await stageImport({
    organizationId,
    fileName: file.name,
    entity,
    presetId,
    sheet,
  })

  const suggestion = suggestMapping(sheet.columns, sheet.rows, entity, presetId)

  const [countrySetting, features, aiConfigured] = await Promise.all([
    db.appSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE },
      },
      select: { value: true },
    }),
    getFeatures(organizationId),
    getAiConfig(organizationId).then(
      () => true,
      () => false
    ),
  ])

  return NextResponse.json({
    token: staged.token,
    fileName: file.name,
    format: sheet.format,
    sheetName: sheet.sheetName ?? null,
    delimiter: sheet.delimiter ?? null,
    encoding: sheet.encoding ?? null,
    columns: sheet.columns,
    sampleRows: sheet.rows.slice(0, SAMPLE_ROWS),
    totalRows: sheet.rows.length,
    suggestion,
    fields: fieldsFor(entity).map((f) => ({ key: f.key, group: f.group, type: f.type })),
    presets: IMPORT_PRESETS.map((p) => ({ id: p.id, name: p.name })),
    defaults: {
      countryCode: normalizeCountryCode(countrySetting?.value ?? null),
    },
    aiAvailable: features.ai && aiConfigured,
  })
}
