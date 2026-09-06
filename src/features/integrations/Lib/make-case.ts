/**
 * Make names as registries send them: "PEUGEOT", "alfa romeo", "BMW",
 * "Kia". A word written all in one case is recased, keeping initials of
 * three letters or fewer as initials (BMW, VW, MG, DS); a word already in
 * mixed case is the registry's own spelling and is kept.
 */
export function makeCase(value: string): string {
  return value
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part.trim() || part === '-') return part
      const upper = part.toUpperCase()
      const lower = part.toLowerCase()
      if (part !== upper && part !== lower) return part
      if (part.length <= 3 && part === upper) return upper
      return upper[0] + lower.slice(1)
    })
    .join('')
}
