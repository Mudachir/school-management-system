export function getUtilization({ totalSeats, heldSeats, confirmedSeats }) {
  const percentage = totalSeats > 0 ? (heldSeats + confirmedSeats) / totalSeats * 100 : 0
  return { percentage: Math.round(percentage), progress: Math.min(100, Math.max(0, percentage)) }
}
