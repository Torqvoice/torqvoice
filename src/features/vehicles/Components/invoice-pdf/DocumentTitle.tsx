import { Text, View } from '@react-pdf/renderer'
import { dark, getFontBold, inkColors } from './styles'
import type { Style } from '@react-pdf/types'

/**
 * The document's own name, set large on the left, with the numbers a customer
 * has to quote back boxed off on the right.
 *
 * Kept apart from the header so a layout can put the letterhead at the top of
 * the sheet and the title further down, below the addresses. Headers that print
 * their own title suppress it when this section is on.
 */
export function DocumentTitle({
  title,
  invoiceNum,
  customerNumber,
  invoiceDate,
  dueDate,
  fontFamily,
  styles,
  labels,
}: {
  title: string
  invoiceNum: string
  customerNumber?: string | null
  invoiceDate: string
  dueDate: string | null
  fontFamily: string
  styles?: Record<string, Style>
  labels: Record<string, string>
}) {
  const fontBold = getFontBold(fontFamily)
  // The section's own colors when the layout sets them, the document's when it
  // does not: this block used to be the one that ignored its section entirely.
  const { ink, muted } = inkColors(styles ?? {})
  const rule = (styles?.infoBox as { borderColor?: string } | undefined)?.borderColor || dark
  const fill = (styles?.infoBox as { backgroundColor?: string } | undefined)?.backgroundColor

  const cells = [
    { label: labels.invoiceNumberLabel || 'Invoice No.', value: invoiceNum },
    customerNumber
      ? { label: labels.customerNumberLabel || 'Customer No.', value: customerNumber }
      : null,
    { label: labels.dateLabel || 'Date', value: invoiceDate },
    dueDate ? { label: labels.dueDateLabel || 'Due Date', value: dueDate } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 16,
      }}
    >
      <Text style={{ fontSize: 24, fontFamily: fontBold, color: ink }}>{title}</Text>
      <View
        style={{
          flexDirection: 'row',
          borderWidth: 1,
          borderColor: rule,
          ...(fill ? { backgroundColor: fill } : {}),
        }}
      >
        {cells.map((cell, i) => (
          <View
            key={cell.label}
            style={{
              paddingHorizontal: 8,
              paddingTop: 2,
              paddingBottom: 3,
              alignItems: 'center',
              ...(i < cells.length - 1 ? { borderRightWidth: 1, borderRightColor: rule } : {}),
            }}
          >
            <Text style={{ fontSize: 6.5, color: muted }}>{cell.label}</Text>
            <Text style={{ fontSize: 10, fontFamily: fontBold, color: ink }}>{cell.value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
