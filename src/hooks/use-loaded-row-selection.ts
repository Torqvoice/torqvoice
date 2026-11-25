'use client'

import { useCallback, useMemo, useState } from 'react'

const NONE: ReadonlySet<string> = new Set()

/**
 * Ticked rows in a list that loads more as it scrolls.
 *
 * Only rows on screen can be ticked, and only those are handed to a bulk
 * action: the header box selects the rows loaded so far, never the ones below
 * that have not arrived, and a row that left the list (deleted elsewhere, no
 * longer matching after a refresh) drops out of the selection with it. Ticks
 * stay put while more rows load. Another search, filter or sort is another
 * list (`listKey`), and starts with nothing selected.
 */
export function useLoadedRowSelection<Row extends { id: string }>(rows: Row[], listKey: string) {
  const [state, setState] = useState<{ key: string; ids: ReadonlySet<string> }>({
    key: listKey,
    ids: NONE,
  })
  const ids = state.key === listKey ? state.ids : NONE

  const selectedRows = useMemo(() => rows.filter((row) => ids.has(row.id)), [rows, ids])
  const selectedIds = useMemo(() => selectedRows.map((row) => row.id), [selectedRows])
  const shown = useMemo(() => new Set(selectedIds), [selectedIds])
  const count = selectedRows.length
  const allSelected = rows.length > 0 && count === rows.length

  const toggle = useCallback(
    (id: string) => {
      setState((current) => {
        const next = new Set(current.key === listKey ? current.ids : NONE)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { key: listKey, ids: next }
      })
    },
    [listKey]
  )

  const clear = useCallback(() => setState({ key: listKey, ids: NONE }), [listKey])

  const toggleAll = useCallback(() => {
    setState({ key: listKey, ids: allSelected ? NONE : new Set(rows.map((row) => row.id)) })
  }, [listKey, allSelected, rows])

  return {
    /** The ticked rows, all of them loaded, in list order. */
    selectedRows,
    /** Their ids, for the bulk action. */
    selectedIds,
    count,
    isSelected: (id: string) => shown.has(id),
    toggle,
    toggleAll,
    clear,
    /** The header box: ticked when every loaded row is, a dash when some are. */
    headerState: (allSelected ? true : count > 0 ? 'indeterminate' : false) as
      | boolean
      | 'indeterminate',
  }
}
