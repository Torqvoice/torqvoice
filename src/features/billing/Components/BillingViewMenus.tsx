'use client'

import { Columns3, Group } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BILLING_COLUMNS,
  BILLING_GROUPS,
  type BillingColumn,
  type BillingGroupBy,
  DEFAULT_BILLING_COLUMNS,
} from '@/features/billing/Schema/billingListSchema'

/** The message key of each column's name, shared by the menu and the table head. */
export const BILLING_COLUMN_KEYS: Record<BillingColumn, string> = {
  invoice: 'report.columns.invoice',
  title: 'report.columns.title',
  vehicle: 'report.columns.vehicle',
  plate: 'report.columns.plate',
  customer: 'report.columns.customer',
  date: 'report.columns.date',
  age: 'report.columns.age',
  status: 'report.columns.status',
  delivery: 'report.columns.delivery',
  total: 'report.columns.total',
  paid: 'report.columns.paid',
  balance: 'report.columns.balance',
}

/**
 * Which columns the list shows and a report prints. The menu stays open
 * while ticking, and the last column cannot be taken away.
 */
export function BillingColumnsMenu({
  columns,
  onChange,
  disabled,
}: {
  columns: BillingColumn[]
  onChange: (columns: BillingColumn[]) => void
  disabled?: boolean
}) {
  const t = useTranslations('billing')
  const shown = new Set(columns)
  const toggle = (column: BillingColumn, on: boolean) => {
    const next = BILLING_COLUMNS.filter((c) => (c === column ? on : shown.has(c)))
    if (next.length > 0) onChange(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0 px-2.5 sm:h-8"
          disabled={disabled}
          aria-label={t('history.columns')}
          title={t('history.columns')}
        >
          <Columns3 className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{t('history.columns')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t('history.columns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {BILLING_COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column}
            checked={shown.has(column)}
            disabled={shown.has(column) && columns.length === 1}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(on) => toggle(column, on === true)}
          >
            {t(BILLING_COLUMN_KEYS[column])}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-muted-foreground"
          onSelect={() => onChange(DEFAULT_BILLING_COLUMNS)}
        >
          {t('history.columnsReset')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Groups the list (and the report) by customer, month or payment status, with a subtotal each. */
export function BillingGroupMenu({
  groupBy,
  onChange,
  disabled,
}: {
  groupBy: BillingGroupBy | ''
  onChange: (groupBy: BillingGroupBy | '') => void
  disabled?: boolean
}) {
  const t = useTranslations('billing')
  const current = groupBy ? t(`report.groupBy.${groupBy}`) : t('history.groupNone')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={groupBy ? 'secondary' : 'outline'}
          size="sm"
          className="h-9 shrink-0 px-2.5 sm:h-8"
          disabled={disabled}
          aria-label={`${t('history.groupBy')}: ${current}`}
          title={`${t('history.groupBy')}: ${current}`}
        >
          <Group className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">
            {groupBy ? `${t('history.groupBy')}: ${current}` : t('history.groupBy')}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('history.groupBy')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={groupBy || 'none'}
          onValueChange={(value) => onChange(value === 'none' ? '' : (value as BillingGroupBy))}
        >
          <DropdownMenuRadioItem value="none">{t('history.groupNone')}</DropdownMenuRadioItem>
          {BILLING_GROUPS.map((group) => (
            <DropdownMenuRadioItem key={group} value={group}>
              {t(`report.groupBy.${group}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
