/**
 * The workshop's own caption for its registration number.
 *
 * Every country calls the number something else: an ABN in Australia, a
 * company number in the UK, a CVR in Denmark, "Org. nr." in Norway. The
 * translations carry one caption per language, which cannot be right for
 * everyone, so a workshop may name it. Applied wherever the printed labels
 * are resolved, so the sheet, the shared copy, the PDF and the designer's
 * preview all say the same thing.
 */
export function withOrgNumberLabel<T extends Record<string, string>>(
  labels: T,
  custom: string | null | undefined
): T {
  const caption = custom?.trim()
  if (!caption) return labels
  return { ...labels, orgNumberLabel: caption, org: `${caption}: {org}` }
}
