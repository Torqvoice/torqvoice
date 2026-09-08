'use client'

import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Slider as UiSlider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/**
 * The inspector's vocabulary, in the app's own visual language: hairline
 * groups, one label per row, the shared switch and slider. Kept local rather
 * than shared with the invoice inspector so the two tools can drift apart on
 * purpose without one breaking the other.
 */

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-border pt-2 first:border-t-0 first:pt-0">
      <div className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      {children}
    </div>
  )
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (on: boolean) => void
  label: string
}) {
  return <Switch checked={on} onCheckedChange={onChange} aria-label={label} />
}

export function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-[13px] font-medium text-foreground">
        <span>{label}</span>
        <span className="font-normal text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <UiSlider
        min={min}
        max={max}
        value={[value]}
        aria-label={label}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next)
        }}
      />
    </div>
  )
}

export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-[5px] px-2 py-1.5 text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-background font-semibold text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * A colour as a swatch and as the hex beside it. The hex is editable because
 * a brand colour arrives as text, not as something to eyeball in a picker.
 * The swatch shows the last valid colour while the text is half typed.
 */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const valid = HEX_COLOR.test(value)
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="color"
        value={valid ? value : '#000000'}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] w-[34px] cursor-pointer rounded-md border border-input bg-background p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="flex-1 text-[13px] font-medium text-foreground">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        maxLength={7}
        spellCheck={false}
        aria-label={`${label} hex`}
        aria-invalid={!valid}
        className="h-7 w-[76px] px-1.5 font-mono text-[11.5px] md:text-[11.5px]"
      />
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
}
