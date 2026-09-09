import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { getLayoutData } from '@/lib/get-layout-data'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  getActiveEmailTemplates,
  listEmailTemplates,
} from '@/features/email/Actions/emailTemplateActions'
import { EmailDesigner } from '@/features/email/Components/EmailDesigner'
import { sampleSummaryRows, sampleValuesFor } from '@/features/email/Lib/emailContext'
import { isEmailKind } from '@/features/email/Lib/emailKinds'
import { loadEmailMessages } from '@/features/email/Lib/emailMessages.server'
import { presetTemplate } from '@/features/email/Lib/emailPresets'

const SETTINGS_PAGE = '/settings/email-templates'

/**
 * The email designer, on one kind of mail at a time.
 *
 * Arrives with ?kind= and either ?template=<id> for a saved template or
 * ?preset=1 for the built-in one. A link that names nothing usable goes back
 * to the gallery, which is where every link here comes from anyway.
 */
export default async function EmailDesignerPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; template?: string; preset?: string }>
}) {
  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)
  if (!features.customTemplates) redirect(SETTINGS_PAGE)

  const { kind, template: templateId } = await searchParams
  if (!kind || !isEmailKind(kind)) redirect(SETTINGS_PAGE)

  const [settingsResult, organization, user, templatesResult, activeResult, messages] =
    await Promise.all([
      getSettings([
        SETTING_KEYS.WORKSHOP_PHONE,
        SETTING_KEYS.WORKSHOP_EMAIL,
        SETTING_KEYS.WORKSHOP_ADDRESS,
      ]),
      db.organization.findUnique({
        where: { id: data.organizationId },
        select: { name: true },
      }),
      db.user.findUnique({ where: { id: data.userId }, select: { email: true } }),
      listEmailTemplates(),
      getActiveEmailTemplates(),
      loadEmailMessages(await getLocale()),
    ])

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const workshop = {
    name: organization?.name,
    phone: settings[SETTING_KEYS.WORKSHOP_PHONE],
    email: settings[SETTING_KEYS.WORKSHOP_EMAIL],
    address: settings[SETTING_KEYS.WORKSHOP_ADDRESS],
  }

  const saved = (
    templatesResult.success && templatesResult.data ? templatesResult.data : []
  ).filter((template) => template.kind === kind)
  const initial = templateId ? saved.find((template) => template.id === templateId) : undefined
  // A stale link to a template that has since been deleted lands on the
  // gallery rather than silently opening the preset under the wrong name.
  if (templateId && !initial) redirect(SETTINGS_PAGE)

  const active = activeResult.success && activeResult.data ? activeResult.data[kind] : null

  // The designer layout paints the document designer's own grey; this tool
  // is dressed in the app's theme, so it brings its own ground.
  return (
    <div className="h-screen bg-background text-foreground">
      <EmailDesigner
        kind={kind}
        preset={presetTemplate(kind, messages)}
        initialSaved={initial ?? null}
        savedNames={saved.map((template) => ({ id: template.id, name: template.name }))}
        activeId={active}
        sample={{
          values: sampleValuesFor(kind, workshop),
          summary: sampleSummaryRows(kind, messages.summary),
        }}
        userEmail={user?.email ?? ''}
      />
    </div>
  )
}
