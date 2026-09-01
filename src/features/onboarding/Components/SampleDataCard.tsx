'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/confirm-dialog'
import { Loader2, Sparkles, Trash2 } from 'lucide-react'
import { removeSampleData } from '../Actions/checklistActions'

/**
 * Settings → Data card offering exact removal of the onboarding sample
 * dataset. Only rendered while the recorded sample ids still exist, so the
 * checklist card's dismissal can never orphan the sample rows.
 */
export function SampleDataCard() {
  const t = useTranslations('onboarding.sampleData')
  const router = useRouter()
  const confirm = useConfirm()
  const [removing, setRemoving] = useState(false)

  const handleRemove = async () => {
    const ok = await confirm({
      title: t('removeConfirmTitle'),
      description: t('removeConfirmDescription'),
      confirmLabel: t('remove'),
      destructive: true,
    })
    if (!ok) return
    setRemoving(true)
    const result = await removeSampleData()
    setRemoving(false)
    if (result.success) {
      toast.success(t('removed'))
      router.refresh()
    } else {
      toast.error(result.error || t('removeFailed'))
    }
  }

  return (
    <AppCard icon={Sparkles} title={t('title')} contentClassName="space-y-4">
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <Button variant="outline" onClick={handleRemove} disabled={removing}>
        {removing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="mr-2 h-4 w-4" />
        )}
        {t('remove')}
      </Button>
    </AppCard>
  )
}
