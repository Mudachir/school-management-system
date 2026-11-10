export function summarizeClasses(classes) {
  const totals = classes.reduce((summary, item) => ({
    ...summary,
    totalSeats: summary.totalSeats + item.totalSeats,
    heldSeats: summary.heldSeats + item.heldSeats,
    confirmedSeats: summary.confirmedSeats + item.confirmedSeats,
    availableSeats: summary.availableSeats + item.availableSeats,
  }), { classCount: classes.length, totalSeats: 0, heldSeats: 0, confirmedSeats: 0, availableSeats: 0 })

  return {
    ...totals,
    occupiedPercentage: totals.totalSeats > 0
      ? Math.round((totals.confirmedSeats + totals.heldSeats) / totals.totalSeats * 100)
      : 0,
  }
}

export function getSeatDistribution(summary) {
  // Keep reported counts intact. Normalize bar widths only when their sum exceeds capacity.
  const seatSum = summary.confirmedSeats + summary.heldSeats + summary.availableSeats
  const denominator = summary.totalSeats > 0 ? Math.max(summary.totalSeats, seatSum) : 0

  return {
    confirmed: denominator ? summary.confirmedSeats / denominator * 100 : 0,
    held: denominator ? summary.heldSeats / denominator * 100 : 0,
    available: denominator ? summary.availableSeats / denominator * 100 : 0,
  }
}
