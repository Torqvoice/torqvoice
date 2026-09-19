'use client'

import { useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Mic, Square } from 'lucide-react'
import { toast } from 'sonner'
import { appendDictation, useDictation } from '@/hooks/use-dictation'
import { cn } from '@/lib/utils'

/**
 * The desk's microphone for the Condition step: the customer tells their
 * story and it is written down as they speak. It writes after whatever is
 * already in the box, so it can be started, stopped and started again, and
 * what was typed by hand stays. Nothing is recorded or kept; the button is
 * simply not drawn in a browser that cannot do this.
 */
export function DictateButton({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const t = useTranslations('service.concerns.dictate')
  const locale = useLocale()
  // What the box held when listening began; each result replaces what has
  // been said since, it does not add to it.
  const baseRef = useRef('')

  const { supported, listening, start, stop } = useDictation({
    locale,
    onText: (spoken) => onChange(appendDictation(baseRef.current, spoken)),
    onError: (error) =>
      toast.error(
        error === 'not-allowed'
          ? t('notAllowed')
          : error === 'no-microphone'
            ? t('noMicrophone')
            : t('failed')
      ),
  })

  if (!supported) return null

  return (
    <button
      type="button"
      data-testid="dictate-condition"
      aria-pressed={listening}
      title={listening ? t('stopHint') : t('startHint')}
      onClick={() => {
        if (listening) {
          stop()
        } else {
          baseRef.current = value
          start()
        }
      }}
      className={cn(
        'flex h-5 cursor-pointer items-center gap-1 rounded px-1 text-[11px] font-medium leading-none normal-case tracking-normal transition-colors disabled:cursor-default disabled:opacity-60',
        listening
          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {listening ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          {t('listening')}
          <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
        </>
      ) : (
        <>
          <Mic className="h-3 w-3" aria-hidden="true" />
          {t('start')}
        </>
      )}
    </button>
  )
}
