/**
 * How a piece of equipment is named in a picker, a meter's label and the
 * audit log: its type, then make and model, then the serial number, the one
 * thing that tells two identical cranes apart. "Crane, HIAB X-HiPro 192
 * (SN 4471)".
 */
export function equipmentLabel(item: {
  typeName: string
  make?: string | null
  model?: string | null
  serialNumber?: string | null
}): string {
  const name = [item.make, item.model].filter(Boolean).join(' ')
  const head = name ? `${item.typeName}, ${name}` : item.typeName
  return item.serialNumber ? `${head} (${item.serialNumber})` : head
}
