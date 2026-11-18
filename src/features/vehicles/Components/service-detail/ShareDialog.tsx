'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { generatePublicLink, revokePublicLink } from '@/features/vehicles/Actions/serviceActions'

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string
  organizationId: string
  initialToken: string | null
  /** Called once the invoice has actually gone to the customer. */
  onSent?: () => void
}

export function ShareDialog({
  open,
  onOpenChange,
  recordId,
  organizationId,
  initialToken,
  onSent,
}: ShareDialogProps) {
  const t = useTranslations('service.share')
  const tc = useTranslations('common')
  const [publicToken, setPublicToken] = useState<string | null>(initialToken)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)

  const publicUrl =
    publicToken && organizationId
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/invoice/${organizationId}/${publicToken}`
      : null

  // An action that cannot reach the server throws instead of answering, so
  // both of these catch it and say the same thing a refusal does.
  const handleGenerate = async () => {
    setGeneratingLink(true)
    const result = await generatePublicLink(recordId).catch(() => null)
    if (result?.success && result.data) {
      setPublicToken(result.data.token)
      // Handing over a link is a way of sending the invoice.
      onSent?.()
    } else {
      toast.error(tc('shareLink.generateFailed'))
    }
    setGeneratingLink(false)
  }

  // The link stays on screen until the server has revoked it: clearing it on
  // a refusal would tell the workshop it is gone while the customer's copy
  // still opens the invoice.
  const handleRevoke = async () => {
    if (revoking) return
    setRevoking(true)
    const result = await revokePublicLink(recordId).catch(() => null)
    if (result?.success) {
      setPublicToken(null)
    } else {
      toast.error(tc('shareLink.revokeFailed'))
    }
    setRevoking(false)
  }

  const handleCopy = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('description')}</p>
          {publicUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={publicUrl} readOnly className="text-xs font-mono" />
                <Button
                  variant="outline"
                  size="icon"
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
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleRevoke}
                disabled={revoking}
              >
                {revoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('revokeLink')}
              </Button>
            </>
          ) : (
            <Button onClick={handleGenerate} disabled={generatingLink}>
              {generatingLink && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('generateLink')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
