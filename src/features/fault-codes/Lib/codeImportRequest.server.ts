import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { locales } from '@/i18n/config'
import { isRestoring, RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { assertContentLength } from '@/lib/backup/zip-guard'
import { getCachedMembership } from '@/lib/cached-session'
import { getAuthContext } from '@/lib/get-auth-context'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  type CodeFile,
  CodeFileError,
  type CodeFileProblem,
  MAX_CODE_IMPORT_BYTES,
  readCodeFile,
} from './codeImportFile.server'
import { isMakeKey } from './makes'

/** Why an import did not go through, as a code the dialog turns into words. */
export type CodeImportError =
  | 'unauthorized'
  | 'forbidden'
  | 'demo'
  | 'restoring'
  | 'invalid'
  | 'file'
  | 'rights'
  | 'paused'
  | 'too_large'
  | 'nothing'
  | 'unavailable'

export function fail(status: number, error: CodeImportError, problem?: CodeFileProblem) {
  return NextResponse.json({ success: false, error, problem }, { status })
}

const fieldsSchema = z.object({
  make: z.string().refine(isMakeKey),
  lang: z.enum(locales),
  source: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || undefined),
})

export type ReadImport =
  | { ok: false; response: NextResponse }
  | {
      ok: true
      organizationId: string
      form: FormData
      fields: z.infer<typeof fieldsSchema>
      file: CodeFile
      fileName: string
    }

/**
 * An import request read and checked: who sends it, its make and language, and the codes in
 * its file. Shared by the check and the send, which read the same form.
 */
export async function readImportRequest(request: NextRequest): Promise<ReadImport> {
  const ctx = await getAuthContext()
  if (!ctx) return { ok: false, response: fail(401, 'unauthorized') }
  const membership = ctx.isAdmin ? null : await getCachedMembership(ctx.userId)
  const allowed =
    ctx.isAdmin ||
    hasPermission(membership?.customRole?.permissions ?? [], {
      action: PermissionAction.UPDATE,
      subject: PermissionSubject.VEHICLES,
    })
  if (!allowed) return { ok: false, response: fail(403, 'forbidden') }
  if (isRestoring(ctx.organizationId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'restoring', message: RESTORE_IN_PROGRESS_MESSAGE },
        { status: 409 }
      ),
    }
  }
  try {
    assertContentLength(request, MAX_CODE_IMPORT_BYTES + 64 * 1024)
  } catch {
    return { ok: false, response: fail(413, 'too_large') }
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return { ok: false, response: fail(400, 'invalid') }
  }
  const text = (name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : undefined
  }
  const fields = fieldsSchema.safeParse({
    make: text('make'),
    lang: text('lang'),
    source: text('source'),
  })
  const upload = form.get('file')
  if (!fields.success || !(upload instanceof File) || upload.size === 0) {
    return { ok: false, response: fail(400, 'invalid') }
  }
  if (upload.size > MAX_CODE_IMPORT_BYTES) {
    return { ok: false, response: fail(413, 'file', 'too_many') }
  }
  try {
    const file = await readCodeFile(Buffer.from(await upload.arrayBuffer()), upload.name)
    return {
      ok: true,
      organizationId: ctx.organizationId,
      form,
      fields: fields.data,
      file,
      fileName: upload.name.slice(0, 200),
    }
  } catch (error) {
    const problem = error instanceof CodeFileError ? error.problem : 'unreadable'
    return { ok: false, response: fail(400, 'file', problem) }
  }
}
