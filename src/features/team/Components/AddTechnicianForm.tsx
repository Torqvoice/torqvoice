'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Plus, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTechnicianAccount } from '@/features/team/Actions/createTechnicianAccount'

/**
 * Adding a mechanic, at the counter, while they stand there.
 *
 * Sits inside the members card under the email invite, because both answer the
 * same question and putting them in separate cards made them look like
 * separate decisions. They are two doors into one room: the invite for the
 * office, this for somebody holding a spanner.
 *
 * The invite form above this one is for the office: it sends an email, waits
 * for someone to accept, and only then can they be made a technician. That is
 * three steps across two days, and it assumes an email address plenty of
 * mechanics do not have at work.
 *
 * This is the other door. A name and a mobile number is everything a workshop
 * knows about somebody on their first morning, and it is enough. The account
 * exists immediately, and the code to put it on their phone comes up the
 * moment it does, because the person it is for is standing right there.
 */
export function AddTechnicianForm({
  onCreated,
}: {
  /** Hands the new technician straight to the setup-code dialog. */
  onCreated: (technician: { userId: string; name: string }) => void
}) {
  const t = useTranslations('settings')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !name.trim() || !phone.trim()) return
    setBusy(true)
    const result = await createTechnicianAccount({ name: name.trim(), phone: phone.trim() })
    setBusy(false)

    if (!result.success) {
      toast.error(result.error || t('team.addTechnicianFailed'))
      return
    }

    const created = result.data as { userId: string; name: string }
    setName('')
    setPhone('')
    toast.success(t('team.addTechnicianDone', { name: created.name }))
    // Straight into the handoff. Making the account and getting it onto the
    // phone is one job, and splitting it in two is how the second half gets
    // forgotten until the mechanic is back under a car.
    onCreated(created)
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <p className="flex items-center gap-2 font-medium text-sm">
          <Wrench className="h-4 w-4" />
          {t('team.addTechnician')}
        </p>
        <p className="text-muted-foreground text-xs">{t('team.addTechnicianHint')}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="tech-name">{t('team.technicianName')}</Label>
          <Input
            id="tech-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('team.technicianNamePlaceholder')}
            autoComplete="off"
            required
          />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="tech-phone">{t('team.technicianPhone')}</Label>
          <Input
            id="tech-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('team.technicianPhonePlaceholder')}
            autoComplete="off"
            required
          />
        </div>
        <Button type="submit" disabled={busy || !name.trim() || !phone.trim()}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1 h-4 w-4" />
          )}
          {t('team.addTechnicianSubmit')}
        </Button>
      </form>

      <p className="text-muted-foreground text-xs">{t('team.addTechnicianNote')}</p>
    </div>
  )
}
