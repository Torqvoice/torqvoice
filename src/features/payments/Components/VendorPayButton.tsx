'use client'

import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The pay buttons on a shared invoice, drawn the way each vendor's own
 * checkout button looks: its colour, its mark, the amount in a segment of
 * its own, and the cards it takes underneath. A customer recognises a
 * PayPal button faster than a sentence that says PayPal.
 *
 * The marks are the vendors' real glyphs (Simple Icons for Stripe, PayPal,
 * Visa and American Express; Mastercard's two circles in its colours; the
 * Paystack bars and the Vipps smile as the integration logos draw them).
 * The vendor name next to the glyph is typeset, not a wordmark.
 */

export type PayVendor = 'stripe' | 'vipps' | 'paypal' | 'paystack'

interface Props {
  vendor: PayVendor
  /**
   * The caption around the vendor's mark, in the page language. Given the
   * mark, so a language that names the vendor first can put it first.
   */
  caption: (mark: ReactNode) => ReactNode
  /** The amount as the invoice shows it. */
  amount: string
  /** The whole sentence for screen readers and tests: "Pay 1,000.00 with PayPal". */
  label: string
  loading: boolean
  disabled: boolean
  onClick: () => void
}

function StripeGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z" />
    </svg>
  )
}

function PayPalGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#003087"
        d="M7.016 19.198h-4.2a.562.562 0 0 1-.555-.65L5.093.584A.692.692 0 0 1 5.776 0h7.222c3.417 0 5.904 2.488 5.846 5.5-.006.25-.027.5-.066.747A6.794 6.794 0 0 1 12.071 12H8.743a.69.69 0 0 0-.682.583l-.325 2.056-.013.083-.692 4.39-.015.087zM19.79 6.142c-.01.087-.01.175-.023.261a7.76 7.76 0 0 1-7.695 6.598H9.007l-.283 1.795-.013.083-.692 4.39-.134.843-.014.088H6.86l-.497 3.15a.562.562 0 0 0 .555.65h3.612c.34 0 .63-.249.683-.585l.952-6.031a.692.692 0 0 1 .683-.584h2.126a6.793 6.793 0 0 0 6.707-5.752c.306-1.95-.466-3.744-1.89-4.906z"
      />
    </svg>
  )
}

function PaystackGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <g fill="#00C3F7">
        <rect x="1" y="1" width="14" height="2.6" rx="0.7" />
        <rect x="1" y="5" width="14" height="2.6" rx="0.7" />
        <rect x="1" y="9" width="14" height="2.6" rx="0.7" />
        <rect x="1" y="13" width="7.5" height="2.6" rx="0.7" />
      </g>
    </svg>
  )
}

function VippsGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <circle cx="28" cy="15.5" r="4" fill="#fff" />
      <path
        d="M10.5 24.5Q23.5 43.5 36.5 25.5"
        fill="none"
        stroke="#fff"
        strokeWidth="5.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A card mark on the white chip card networks are shown on. */
function Chip({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-5 w-8 items-center justify-center rounded-[3px] border border-gray-200 bg-white"
    >
      {children}
    </span>
  )
}

function Visa() {
  return (
    <Chip title="Visa">
      <svg viewBox="0 0 24 24" className="h-4 w-6" aria-hidden>
        <path
          fill="#1A1F71"
          d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"
        />
      </svg>
    </Chip>
  )
}

function Mastercard() {
  return (
    <Chip title="Mastercard">
      <svg viewBox="0 0 24 16" className="h-3.5 w-5" aria-hidden>
        <circle cx="8.5" cy="8" r="7" fill="#EB001B" />
        <circle cx="15.5" cy="8" r="7" fill="#F79E1B" />
        <path d="M12 2.2a7 7 0 0 1 0 11.6 7 7 0 0 1 0-11.6z" fill="#FF5F00" />
      </svg>
    </Chip>
  )
}

function Amex() {
  return (
    <Chip title="American Express">
      <svg viewBox="2 2 20 20" className="h-[18px] w-[18px]" aria-hidden>
        <path
          fill="#2E77BC"
          d="M16.015 14.378c0-.32-.135-.496-.344-.622-.21-.12-.464-.135-.81-.135h-1.543v2.82h.675v-1.027h.72c.24 0 .39.024.478.125.12.13.104.38.104.55v.35h.66v-.555c-.002-.25-.017-.376-.108-.516-.06-.08-.18-.18-.33-.234l.02-.008c.18-.072.48-.297.48-.747zm-.87.407l-.028-.002c-.09.053-.195.058-.33.058h-.81v-.63h.824c.12 0 .24 0 .33.05.098.048.156.147.15.255 0 .12-.045.215-.134.27zM20.297 15.837H19v.6h1.304c.676 0 1.05-.278 1.05-.884 0-.28-.066-.448-.187-.582-.153-.133-.392-.193-.73-.207l-.376-.015c-.104 0-.18 0-.255-.03-.09-.03-.15-.105-.15-.21 0-.09.017-.166.09-.21.083-.046.177-.066.272-.06h1.23v-.602h-1.35c-.704 0-.958.437-.958.84 0 .9.776.855 1.407.87.104 0 .18.015.225.06.046.03.082.106.082.18 0 .077-.035.15-.08.18-.06.053-.15.07-.277.07zM0 0v10.096L.81 8.22h1.75l.225.464V8.22h2.043l.45 1.02.437-1.013h6.502c.295 0 .56.057.756.236v-.23h1.787v.23c.307-.17.686-.23 1.12-.23h2.606l.24.466v-.466h1.918l.254.465v-.466h1.858v3.948H20.87l-.36-.6v.585h-2.353l-.256-.63h-.583l-.27.614h-1.213c-.48 0-.84-.104-1.08-.24v.24h-2.89v-.884c0-.12-.03-.12-.105-.135h-.105v1.036H6.067v-.48l-.21.48H4.69l-.202-.48v.465H2.235l-.256-.624H1.4l-.256.624H0V24h23.786v-7.108c-.27.135-.613.18-.973.18H21.09v-.255c-.21.165-.57.255-.914.255H14.71v-.9c0-.12-.018-.12-.12-.12h-.075v1.022h-1.8v-1.066c-.298.136-.643.15-.928.136h-.214v.915h-2.18l-.54-.617-.57.6H4.742v-3.93h3.61l.518.602.554-.6h2.412c.28 0 .74.03.942.225v-.24h2.177c.202 0 .644.045.903.225v-.24h3.265v.24c.163-.164.508-.24.803-.24h1.89v.24c.194-.15.464-.24.84-.24h1.176V0H0zM21.156 14.955c.004.005.006.012.01.016.01.01.024.01.032.02l-.042-.035zM23.828 13.082h.065v.555h-.065zM23.865 15.03v-.005c-.03-.025-.046-.048-.075-.07-.15-.153-.39-.215-.764-.225l-.36-.012c-.12 0-.194-.007-.27-.03-.09-.03-.15-.105-.15-.21 0-.09.03-.16.09-.204.076-.045.15-.05.27-.05h1.223v-.588h-1.283c-.69 0-.96.437-.96.84 0 .9.78.855 1.41.87.104 0 .18.015.224.06.046.03.076.106.076.18 0 .07-.034.138-.09.18-.045.056-.136.07-.27.07h-1.288v.605h1.287c.42 0 .734-.118.9-.36h.03c.09-.134.135-.3.135-.523 0-.24-.045-.39-.135-.526zM18.597 14.208v-.583h-2.235V16.458h2.235v-.585h-1.57v-.57h1.533v-.584h-1.532v-.51M13.51 8.787h.685V11.6h-.684zM13.126 9.543l-.007.006c0-.314-.13-.5-.34-.624-.217-.125-.47-.135-.81-.135H10.43v2.82h.674v-1.034h.72c.24 0 .39.03.487.12.122.136.107.378.107.548v.354h.677v-.553c0-.25-.016-.375-.11-.516-.09-.107-.202-.19-.33-.237.172-.07.472-.3.472-.75zm-.855.396h-.015c-.09.054-.195.056-.33.056H11.1v-.623h.825c.12 0 .24.004.33.05.09.04.15.128.15.25s-.047.22-.134.266zM15.92 9.373h.632v-.6h-.644c-.464 0-.804.105-1.02.33-.286.3-.362.69-.362 1.11 0 .512.123.833.36 1.074.232.238.645.31.97.31h.78l.255-.627h1.39l.262.627h1.36v-2.11l1.272 2.11h.95l.002.002V8.786h-.684v1.963l-1.18-1.96h-1.02V11.4L18.11 8.744h-1.004l-.943 2.22h-.3c-.177 0-.362-.03-.468-.134-.125-.15-.186-.36-.186-.662 0-.285.08-.51.194-.63.133-.135.272-.165.516-.165zm1.668-.108l.464 1.118v.002h-.93l.466-1.12zM2.38 10.97l.254.628H4V9.393l.972 2.205h.584l.973-2.202.015 2.202h.69v-2.81H6.118l-.807 1.904-.876-1.905H3.343v2.663L2.205 8.787h-.997L.01 11.597h.72l.26-.626h1.39zm-.688-1.705l.46 1.118-.003.002h-.915l.457-1.12zM11.856 13.62H9.714l-.85.923-.825-.922H5.346v2.82H8l.855-.932.824.93h1.302v-.94h.838c.6 0 1.17-.164 1.17-.945l-.006-.003c0-.78-.598-.93-1.128-.93zM7.67 15.853l-.014-.002H6.02v-.557h1.47v-.574H6.02v-.51H7.7l.733.82-.764.824zm2.642.33l-1.03-1.147 1.03-1.108v2.253zm1.553-1.258h-.885v-.717h.885c.24 0 .42.098.42.344 0 .243-.15.372-.42.372zM9.967 9.373v-.586H7.73V11.6h2.237v-.58H8.4v-.564h1.527V9.88H8.4v-.507"
        />
      </svg>
    </Chip>
  )
}

const VENDORS: Record<
  PayVendor,
  {
    name: string
    glyph: () => ReactNode
    /** Button face, amount segment, hover, text. */
    classes: string
    segment: string
    cards: ReactNode
  }
> = {
  stripe: {
    name: 'Stripe',
    glyph: StripeGlyph,
    classes: 'bg-[#635BFF] text-white hover:bg-[#5249f0]',
    segment: 'bg-black/15',
    cards: (
      <>
        <Visa />
        <Mastercard />
        <Amex />
      </>
    ),
  },
  paystack: {
    name: 'Paystack',
    glyph: PaystackGlyph,
    classes: 'bg-[#011B33] text-white hover:bg-[#0a2c4d]',
    segment: 'bg-white/10',
    cards: (
      <>
        <Visa />
        <Mastercard />
      </>
    ),
  },
  paypal: {
    name: 'PayPal',
    glyph: PayPalGlyph,
    classes: 'bg-[#FFC439] text-[#003087] hover:bg-[#f2ba30]',
    segment: 'bg-black/5',
    cards: (
      <>
        <Visa />
        <Mastercard />
      </>
    ),
  },
  vipps: {
    name: 'Vipps',
    glyph: VippsGlyph,
    classes: 'bg-[#FF5B24] text-white hover:bg-[#e54e1c]',
    segment: 'bg-black/10',
    cards: null,
  },
}

export function VendorPayButton({
  vendor,
  caption,
  amount,
  label,
  loading,
  disabled,
  onClick,
}: Props) {
  const v = VENDORS[vendor]
  const Glyph = v.glyph
  return (
    <div className="min-w-0 flex-1 basis-64">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`flex h-12 w-full items-stretch overflow-hidden rounded-lg text-sm font-medium transition-colors disabled:opacity-60 ${v.classes}`}
      >
        <span className="flex flex-1 items-center justify-center gap-1.5 px-3">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <span className="flex items-center gap-1.5 font-normal">
              {caption(
                <span className="inline-flex items-center gap-1">
                  <Glyph />
                  <span className="text-base font-bold tracking-tight">{v.name}</span>
                </span>
              )}
            </span>
          )}
        </span>
        <span
          className={`flex items-center px-4 font-semibold tabular-nums whitespace-nowrap ${v.segment}`}
        >
          {amount}
        </span>
      </button>
      {v.cards && <div className="mt-1.5 flex justify-center gap-1">{v.cards}</div>}
    </div>
  )
}
