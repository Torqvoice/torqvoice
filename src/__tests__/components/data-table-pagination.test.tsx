import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataTablePagination } from '@/components/data-table-pagination'

/**
 * The rows-per-page choice shows the size the list is using. The customer,
 * vehicle, work order, quote, inspection, inventory and labor preset lists all
 * open at 20 rows, which the choices did not include, so the box was empty.
 */
describe('rows per page', () => {
  const footer = (pageSize: number) =>
    render(
      <DataTablePagination
        total={57}
        page={1}
        pageSize={pageSize}
        totalPages={Math.ceil(57 / pageSize)}
        onNavigate={vi.fn()}
      />
    )

  it('shows a size that is not one of the usual choices', () => {
    footer(20)
    expect(screen.getByRole('combobox')).toHaveTextContent('20')
  })

  it('shows one of the usual choices as it is', () => {
    footer(25)
    expect(screen.getByRole('combobox')).toHaveTextContent('25')
  })
})
