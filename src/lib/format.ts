/** Locale-stable thousands separators — "17508" → "17,508". */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}
