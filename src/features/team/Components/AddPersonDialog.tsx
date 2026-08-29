'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRightLeft, Check, Loader2, Mail, UserCheck, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createAppSetupCode, revokeAppSetupCode } from '@/features/team/Actions/createAppSetupCode'
import { createTechnicianAccount } from '@/features/team/Actions/createTechnicianAccount'
import { sendInvitation } from '@/features/team/Actions/sendInvitation'
import { inviteMember } from '@/features/team/Actions/teamActions'
import { countriesFor } from '@/features/team/Lib/dialCodes'
import { TECHNICIAN_ROLE_NAME } from '@/features/team/Lib/technicianRole'
import { CountryPicker } from './CountryPicker'
import { useTechnicianConnected } from '@/features/team/hooks/useTechnicianConnected'
import { type IssuedCode, SetupCodeHandoff } from './SetupCodeHandoff'

/**
 * Adding somebody to the workshop, whoever they are.
 *
 * There used to be two forms on the page, side by side, both permanently open.
 * A desk operator had to work out which one applied before they could do
 * anything, and the answer depended on facts about the person that the form
 * never asked about.
 *
 * So it asks. One button, one question, and the steps after it follow from the
 * answer. The two people being added are genuinely different: one works in the
 * office, has an email address and a password, and needs a role. The other
 * works in the bay, has a phone in their pocket, and needs a code. Pretending
 * those are the same shape is what made the old page confusing.
 */

type Kind = 'member' | 'technician'
type Step = 'who' | 'details' | 'clash' | 'handoff' | 'done'

interface RoleOption {
  id: string
  name: string
}

export function AddPersonDialog({
  open,
  onOpenChange,
  workshopUrl,
  dialCode,
  roles,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workshopUrl: string
  /** The workshop's country code. Empty until somebody has supplied one. */
  dialCode: string
  roles: RoleOption[]
  onChanged: () => void
}) {
  const t = useTranslations('settings')
  const locale = useLocale()
  /**
   * The country, held as a region code rather than a dial code.
   *
   * They are not interchangeable: the United States and Canada are both +1,
   * so a list keyed on the dial code has two entries claiming to be the same
   * option. The region is what identifies a row; the dial code is what gets
   * stored.
   *
   * Asked once per workshop and then never again, because the answer is saved
   * the first time somebody gives it.
   */
  const [region, setRegion] = useState('')
  const countries = useMemo(() => countriesFor(locale), [locale])
  const country = dialCode || countries.find((c) => c.region === region)?.dial || ''

  const [kind, setKind] = useState<Kind | null>(null)
  const [step, setStep] = useState<Step>('who')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Technician
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [created, setCreated] = useState<{ userId: string; name: string } | null>(null)
  const [issued, setIssued] = useState<IssuedCode | null>(null)
  /** Somebody here already holds that number. Their name, for the question. */
  const [clash, setClash] = useState<string | null>(null)
  /** True when we watched the phone come through rather than being told. */
  const [scanned, setScanned] = useState(false)

  // Team member
  const [email, setEmail] = useState('')
  const [roleValue, setRoleValue] = useState('member')

  const reset = useCallback(() => {
    setKind(null)
    setStep('who')
    setError(null)
    setName('')
    setPhone('')
    setCreated(null)
    setIssued(null)
    setClash(null)
    setScanned(false)
    setEmail('')
    setRoleValue('member')
  }, [])

  const close = useCallback(() => {
    // A code left on an unattended screen stops working when the desk walks
    // away from it.
    if (created && step === 'handoff') void revokeAppSetupCode({ userId: created.userId })
    onOpenChange(false)
    // After the animation, so it does not visibly rewind on the way out.
    setTimeout(reset, 200)
  }, [created, step, onOpenChange, reset])

  const choose = useCallback((next: Kind) => {
    setKind(next)
    setStep('details')
    setError(null)
  }, [])

  const addTechnician = useCallback(
    async (resolve?: 'reuse' | 'takeover') => {
      if (busy || !name.trim() || !phone.trim()) return
      setBusy(true)
      setError(null)

      const result = await createTechnicianAccount({
        name: name.trim(),
        phone: phone.trim(),
        resolve,
        dialCode: country || undefined,
      })
      if (!result.success) {
        setError(result.error || t('team.addTechnicianFailed'))
        setBusy(false)
        return
      }

      const data = result.data as {
        conflict: { name: string } | null
        userId: string | null
        name: string
      }

      // Somebody here already has that number. Ask rather than refuse: a
      // recycled number or a name typed differently must not be a dead end.
      if (data.conflict) {
        setClash(data.conflict.name)
        setStep('clash')
        setBusy(false)
        return
      }

      const technician = { userId: data.userId as string, name: data.name }
      setCreated(technician)
      onChanged()
      setStep('handoff')

      const code = await createAppSetupCode({ userId: technician.userId })
      if (code.success) setIssued(code.data as IssuedCode)
      else setError(code.error || t('team.setupAppFailed'))
      setBusy(false)
    },
    [busy, name, phone, country, onChanged, t]
  )

  const addMember = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (busy || !email.trim()) return
      setBusy(true)
      setError(null)

      const custom = roles.find((r) => r.id === roleValue)
      const payload = {
        email: email.trim(),
        role: (roleValue === 'admin' ? 'admin' : 'member') as 'admin' | 'member',
        roleId: custom?.id,
      }

      // Already has an account, so they join immediately. Otherwise an
      // invitation goes out and they turn up once they accept.
      const joined = await inviteMember(payload)
      if (joined.success && !(joined.data as { userNotFound?: boolean })?.userNotFound) {
        onChanged()
        setStep('done')
        setBusy(false)
        return
      }

      const invited = await sendInvitation(payload)
      if (!invited.success) {
        setError(invited.error || t('team.failedSendInvitation'))
        setBusy(false)
        return
      }
      onChanged()
      setStep('done')
      setBusy(false)
    },
    [busy, email, roleValue, roles, onChanged, t]
  )

  /**
   * The number as it will be stored, shown while they type it.
   *
   * Nothing is normalised properly until the server sees it, so this only has
   * to be honest about the shape: local digits get the country code in front,
   * anything already international is left alone.
   */
  const preview = (() => {
    const digits = phone.replace(/[\s()-]/g, '')
    if (!digits) return ''
    if (/^(\+|00)/.test(digits)) return digits.replace(/^00/, '+')
    return country ? `${country}${digits.replace(/^0+/, '')}` : ''
  })()

  // The scan ends the step, so the desk never has to decide whether it worked.
  useTechnicianConnected(step === 'handoff' ? (created?.userId ?? null) : null, () => {
    setScanned(true)
    setStep('done')
  })

  const steps: Step[] = kind === 'technician' ? ['who', 'details', 'handoff'] : ['who', 'details']
  const position = steps.indexOf(step === 'done' ? steps[steps.length - 1] : step)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind === 'technician' ? (
              <Wrench className="h-4 w-4" />
            ) : kind === 'member' ? (
              <Mail className="h-4 w-4" />
            ) : null}
            {t('team.addPersonTitle')}
          </DialogTitle>
          <DialogDescription>
            {step === 'who'
              ? t('team.addPersonWho')
              : kind === 'technician'
                ? t('team.addTechnicianHint')
                : t('team.inviteMemberHint')}
          </DialogDescription>
        </DialogHeader>

        {/* Named steps, not dots.
            The person doing this may never have added anybody before, and
            "where am I and how much is left" is the first thing they want to
            know. A row of anonymous dots answers half of that. */}
        {kind && (
          <ol className="flex items-center gap-3 text-xs">
            {steps.map((s, i) => {
              const done = step === 'done' || i < position
              const current = i === position && step !== 'done'
              return (
                <li key={s} className="flex flex-1 flex-col gap-1.5">
                  <span
                    className={`h-1 rounded-full ${done || current ? 'bg-primary' : 'bg-muted'}`}
                  />
                  <span className={current ? 'font-medium' : 'text-muted-foreground'}>
                    {t(
                      s === 'who'
                        ? 'team.stepLabelWho'
                        : s === 'details'
                          ? 'team.stepLabelDetails'
                          : 'team.stepLabelPhone'
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        )}

        {step === 'who' && (
          <div className="space-y-3">
            <ChoiceButton
              icon={<Wrench className="h-5 w-5" />}
              title={t('team.choiceTechnician')}
              hint={t('team.choiceTechnicianHint')}
              onClick={() => choose('technician')}
            />
            <ChoiceButton
              icon={<Mail className="h-5 w-5" />}
              title={t('team.choiceMember')}
              hint={t('team.choiceMemberHint')}
              onClick={() => choose('member')}
            />
          </div>
        )}

        {step === 'details' && kind === 'technician' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void addTechnician()
            }}
            className="space-y-4"
          >
            <StepIntro title={t('team.techDetailsTitle')} blurb={t('team.techDetailsBlurb')} />
            <div className="space-y-2">
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
            {!dialCode && (
              <div className="space-y-2">
                <Label>{t('team.workshopCountry')}</Label>
                <CountryPicker value={region} onChange={setRegion} disabled={busy} />
                <p className="text-muted-foreground text-xs">
                  {/* Where the answer lives afterwards, so a desk operator who
                      picks the wrong one knows it is not permanent. */}
                  {t.rich('team.workshopCountryHint', {
                    link: (chunks) => (
                      <Link href="/settings/localization" className="underline underline-offset-2">
                        {chunks}
                      </Link>
                    ),
                  })}
                </p>
              </div>
            )}

            <div className="space-y-2">
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
              {preview ? (
                // Confirms the country code was applied the way they meant,
                // before it becomes the thing they sign in with.
                <p className="text-xs">
                  {t('team.phonePreview')}{' '}
                  <span className="font-medium tabular-nums">{preview}</span>
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">{t('team.addTechnicianNote')}</p>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Footer
              backLabel={t('team.stepBack')}
              onBack={() => {
                setKind(null)
                setStep('who')
              }}
              submitLabel={t('team.addTechnicianSubmit')}
              busy={busy}
              disabled={!name.trim() || !phone.trim()}
            />
          </form>
        )}

        {step === 'details' && kind === 'member' && (
          <form onSubmit={addMember} className="space-y-4">
            <StepIntro title={t('team.memberDetailsTitle')} blurb={t('team.memberDetailsBlurb')} />
            <div className="space-y-2">
              <Label htmlFor="member-email">{t('team.inviteByEmail')}</Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('team.inviteEmailPlaceholder')}
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('team.role')}</Label>
              <Select value={roleValue} onValueChange={setRoleValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t('team.admin')}</SelectItem>
                  <SelectItem value="member">{t('team.member')}</SelectItem>
                  {roles.length > 0 && (
                    <>
                      <SelectSeparator />
                      {roles
                        // Technicians are added through the other door, so
                        // offering their role here is a path to an account
                        // with app permissions and no phone to use them on.
                        .filter((r) => r.name !== TECHNICIAN_ROLE_NAME)
                        .map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {/* Which of the two they should pick, in one line, without the
                  word "permissions". */}
              <p className="text-muted-foreground text-xs">{t('team.roleHint')}</p>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Footer
              backLabel={t('team.stepBack')}
              onBack={() => {
                setKind(null)
                setStep('who')
              }}
              submitLabel={t('team.invite')}
              busy={busy}
              disabled={!email.trim()}
            />
          </form>
        )}

        {step === 'clash' && (
          <div className="space-y-4">
            <StepIntro
              title={t('team.clashTitle', { name: clash ?? '' })}
              blurb={t('team.clashBlurb')}
            />

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="space-y-3">
              <ChoiceButton
                icon={<UserCheck className="h-5 w-5" />}
                title={t('team.clashSamePerson', { name: clash ?? '' })}
                hint={t('team.clashSamePersonHint')}
                onClick={() => void addTechnician('reuse')}
              />
              <ChoiceButton
                icon={<ArrowRightLeft className="h-5 w-5" />}
                title={t('team.clashTakeover', { name: name.trim() })}
                hint={t('team.clashTakeoverHint', { name: clash ?? '' })}
                onClick={() => void addTechnician('takeover')}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setClash(null)
                setStep('details')
              }}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t('team.clashDifferentNumber')}
            </Button>
          </div>
        )}

        {step === 'handoff' && (
          <>
            <StepIntro title={t('team.techHandoffTitle')} blurb={t('team.techHandoffBlurb')} />
            <SetupCodeHandoff
              issued={issued}
              error={error}
              workshopUrl={workshopUrl}
              memberName={created?.name ?? ''}
            />
            <Button className="w-full" onClick={() => setStep('done')} disabled={!issued}>
              {t('team.stepHandoffDone')}
            </Button>
          </>
        )}

        {step === 'done' && (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">
                {kind === 'technician'
                  ? t(scanned ? 'team.stepScannedTitle' : 'team.stepDoneTitle', {
                      name: created?.name ?? '',
                    })
                  : t('team.stepInvitedTitle', { email })}
              </p>
              <p className="text-muted-foreground text-sm">
                {kind === 'technician' ? t('team.stepDoneBody') : t('team.stepInvitedBody')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>
                {t('team.stepDoneAnother')}
              </Button>
              <Button className="flex-1" onClick={close}>
                {t('team.setupAppDone')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** What this step is, and why it exists, before anything asks for input. */
function StepIntro({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-sm">{title}</p>
      <p className="text-muted-foreground text-xs">{blurb}</p>
    </div>
  )
}

/** One of the two answers to "who are you adding". Big, because it is the
 * only decision on the screen and the rest of the flow depends on it. */
function ChoiceButton({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <span className="mt-0.5 text-primary">{icon}</span>
      <span className="space-y-0.5">
        <span className="block font-medium text-sm">{title}</span>
        <span className="block text-muted-foreground text-xs">{hint}</span>
      </span>
    </button>
  )
}

function Footer({
  backLabel,
  onBack,
  submitLabel,
  busy,
  disabled,
}: {
  backLabel: string
  onBack: () => void
  submitLabel: string
  busy: boolean
  disabled: boolean
}) {
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        {backLabel}
      </Button>
      <Button type="submit" className="flex-1" disabled={busy || disabled}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  )
}
