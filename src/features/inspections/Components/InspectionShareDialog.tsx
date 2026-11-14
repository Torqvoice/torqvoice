'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Copy, Link2, Loader2, Unlink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  generateInspectionPublicLink,
  revokeInspectionPublicLink,
} from '../Actions/inspectionShareActions'

interface InspectionShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inspectionId: string
  organizationId: string
  publicToken: string | null
}

export function InspectionShareDialog({
  open,
  onOpenChange,
  inspectionId,
  organizationId,
  publicToken,
}: InspectionShareDialogProps) {
  const t = useTranslations('inspections.shareDialog')
  const tc = useTranslations('common')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [token, setToken] = useState(publicToken)

  const shareUrl = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/inspection/${organizationId}/${token}`
    : null

  // An action that cannot reach the server throws instead of answering.
  // Inside a transition that would replace the page with the error page, so
  // each call is caught and reported the way a refusal is.
  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateInspectionPublicLink(inspectionId).catch(() => null)
      if (result?.success && result.data) {
        setToken(result.data.token)
        toast.success(t('generated'))
        router.refresh()
      } else {
        toast.error(tc('shareLink.generateFailed'))
      }
    })
  }

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeInspectionPublicLink(inspectionId).catch(() => null)
      if (result?.success) {
        setToken(null)
        toast.success(t('revoked'))
        router.refresh()
      } else {
        toast.error(tc('shareLink.revokeFailed'))
      }
    })
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    toast.success(t('copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {shareUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={shareUrl} readOnly className="font-mono text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopy}
                  aria-label={t('copyLink')}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={handleRevoke}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="mr-2 h-4 w-4" />
                )}
                {t('revokeLink')}
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={handleGenerate} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              {t('generateLink')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
