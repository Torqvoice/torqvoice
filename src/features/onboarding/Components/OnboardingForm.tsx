'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useGlassModal } from '@/components/glass-modal'
import { Gauge, Loader2 } from 'lucide-react'
import { createOnboardingOrg } from '../Actions/createOnboardingOrg'

export function OnboardingForm({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations('onboarding.form')
  const [workshopName, setWorkshopName] = useState('')
  const [loadSampleData, setLoadSampleData] = useState(true)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const modal = useGlassModal()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await createOnboardingOrg({ workshopName, loadSampleData })
      if (!result.success) {
        modal.open('error', t('setupFailed'), result.error || t('couldNotCreate'))
      } else {
        router.push(redirectTo || '/')
        router.refresh()
      }
    } catch {
      modal.open('error', t('setupFailed'), t('unexpectedError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
          <Gauge className="h-5 w-5 text-primary" />
          <span className="gradient-text text-sm font-bold tracking-wider uppercase">
            Torqvoice
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workshopName">{t('workshopName')}</Label>
          <Input
            id="workshopName"
            type="text"
            placeholder={t('workshopNamePlaceholder')}
            value={workshopName}
            onChange={(e) => setWorkshopName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            className="h-11 bg-background/50"
          />
        </div>

        <label
          htmlFor="loadSampleData"
          className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-background/50 p-3"
        >
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{t('sampleDataLabel')}</span>
            <p className="text-xs text-muted-foreground">{t('sampleDataDescription')}</p>
          </div>
          <Switch
            id="loadSampleData"
            checked={loadSampleData}
            onCheckedChange={setLoadSampleData}
            className="mt-0.5"
          />
        </label>

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t('submit')}
        </Button>
      </form>
    </div>
  )
}
