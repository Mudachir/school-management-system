const formatter = new Intl.NumberFormat('en')

export function formatCount(value) {
  return formatter.format(value)
}
