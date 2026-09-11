'use client'

import { createContext, useContext } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Car, Check, FileCheck2, Link2 } from 'lucide-react'
import { AuthLogo } from '@/components/auth-logo'
import { DOCS_URL, MARKETING_URL, TERMS_URL } from '@/lib/marketing-urls'
import { LocaleSwitcher } from './locale-switcher'

/** True inside the full-height form panel, where the card needs no frame of its own. */
const PanelContext = createContext(false)

/**
 * Frame around the sign-in and sign-up cards.
 *
 * In cloud mode a visitor arriving from an ad or the marketing site gets a
 * split screen: the product pitch on the left, and the form in a full-height
 * panel on the right. What Torqvoice does, that the plan is free, and what
 * the app looks like all sit beside the form. Four in ten people who reached
 * the bare form left without touching it, and a form with no reason attached
 * is the most likely cause.
 *
 * Self-hosted instances keep the plain centred card. Their users already know
 * what they are signing in to, and the pitch would be about somebody else's
 * product. That decision is made from the mode alone: the app-level logo
 * setting is per organisation, so it says nothing about who runs the server.
 */
export function AuthShell({ pitch, children }: { pitch: boolean; children: React.ReactNode }) {
  if (!pitch) {
    return (
      <div className="grid-bg relative flex min-h-screen items-center justify-center p-4">
        <Backdrop />
        <div className="relative z-10 w-full max-w-md">
          {children}
          <ShellFooter links={false} />
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen lg:grid lg:h-screen lg:grid-cols-[minmax(0,1fr)_minmax(26rem,32rem)]">
      {/*
        Both columns are pinned to the viewport on desktop. The pitch is the
        taller of the two and scrolls inside its own column; the form panel
        never moves. Centring is done with my-auto on the inner block rather
        than justify-center on the column, because a centred flex column clips
        its top once the content is taller than the container.
      */}
      <aside className="grid-bg relative hidden lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto lg:px-14 lg:py-16 xl:px-20">
        <Backdrop />
        <div className="relative z-10 mx-auto w-full max-w-2xl lg:my-auto">
          <Pitch />
        </div>
      </aside>

      {/*
        Below desktop width the pitch is gone and this is the whole page: the
        same centred card as the plain layout, on the grid background. Phones
        are where first-time visitors bounce most, and a screen of marketing
        above the form is the opposite of what they need there.
      */}
      <main className="relative flex min-h-screen flex-col px-4 py-8 sm:px-8 lg:h-screen lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-border/60 lg:bg-card/90 lg:px-12 lg:py-10 lg:shadow-[-32px_0_64px_-48px_rgb(0_0_0/0.35)] lg:backdrop-blur-xl">
        <div aria-hidden className="grid-bg absolute inset-0 lg:hidden" />
        <div className="lg:hidden">
          <Backdrop />
        </div>
        <div className="relative z-10 mx-auto my-auto w-full max-w-md lg:max-w-sm">
          <PanelContext value={true}>{children}</PanelContext>
          <ShellFooter links />
        </div>
      </main>
    </div>
  )
}

/**
 * The surface an auth form sits on: a translucent card on the plain layout,
 * nothing extra inside the split-screen panel, which is the card already.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  const inPanel = useContext(PanelContext)
  if (inPanel) {
    // A framed card on phones, where the panel is the page; no frame from
    // desktop width up, where the panel itself is the card.
    return (
      <div className="relative rounded-2xl border border-border/60 bg-card/70 p-6 shadow-2xl backdrop-blur-lg sm:p-8 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
        {children}
      </div>
    )
  }
  return <div className="glass relative rounded-2xl p-6 shadow-2xl sm:p-8">{children}</div>
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
    </div>
  )
}

function Pitch() {
  const t = useTranslations('auth.pitch')
  const tc = useTranslations('common')

  const benefits = [
    { icon: FileCheck2, title: t('benefits.flow.title'), text: t('benefits.flow.description') },
    { icon: Car, title: t('benefits.history.title'), text: t('benefits.history.description') },
    { icon: Link2, title: t('benefits.pay.title'), text: t('benefits.pay.description') },
  ]
  const proofs = [t('proof.free'), t('proof.minute'), t('proof.languages'), t('proof.openSource')]

  return (
    <div className="flex flex-col">
      <a
        href={MARKETING_URL}
        className="mb-6 inline-flex items-center gap-3 self-start lg:mb-10"
        aria-label={tc('brandName')}
      >
        <AuthLogo alt={tc('brandName')} />
        <span className="text-lg font-semibold tracking-tight">{tc('brandName')}</span>
      </a>

      <p className="mb-3 inline-flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        {t('badge')}
      </p>

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-[2.75rem] lg:leading-[1.08]">
        {t('headline')} <span className="gradient-text">{t('headlineHighlight')}</span>
      </h1>

      <p className="mt-3 max-w-lg text-sm text-muted-foreground sm:text-base lg:mt-4 lg:text-lg">
        {t('subheadline')}
      </p>

      <ul className="mt-8 hidden space-y-5 lg:block">
        {benefits.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="font-medium leading-snug">{title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground sm:text-sm lg:mt-8">
        {proofs.map((proof) => (
          <li key={proof} className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-primary" />
            {proof}
          </li>
        ))}
      </ul>

      <div className="relative mt-10 hidden lg:block">
        <div
          aria-hidden
          className="absolute -inset-x-6 -bottom-6 top-1/3 rounded-[2rem] bg-primary/10 blur-2xl"
        />
        <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl">
          <Image
            src="/images/auth/dashboard.webp"
            width={1280}
            height={686}
            alt={t('screenshotAlt')}
            priority
            sizes="(min-width: 1024px) 672px, 0px"
            className="h-auto w-full"
          />
        </div>
      </div>
    </div>
  )
}

function ShellFooter({ links }: { links: boolean }) {
  const t = useTranslations('auth.shell')

  return (
    <div className="mt-4 flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
      <LocaleSwitcher className="-ml-2" />
      <nav className="flex items-center gap-4">
        {links && (
          <>
            <a href={MARKETING_URL} className="hover:text-foreground hover:underline">
              {t('about')}
            </a>
            <a href={DOCS_URL} className="hover:text-foreground hover:underline">
              {t('docs')}
            </a>
          </>
        )}
        <a
          href={TERMS_URL}
          target="_blank"
          rel="noopener"
          className="hover:text-foreground hover:underline"
        >
          {t('terms')}
        </a>
      </nav>
    </div>
  )
}
