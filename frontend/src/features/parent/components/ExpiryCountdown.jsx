import { countdownLabel } from '../helpers/countdown.js'
export default function ExpiryCountdown({ seconds, exhausted }) {
  return <div className="parent-countdown"><span>{seconds > 0 ? 'Time remaining to confirm your seat' : exhausted ? 'The server still reports a held seat. Use Refresh status to check again.' : 'Hold time elapsed. Checking the server status.'}</span><strong aria-label={`${seconds} seconds remaining`} aria-live="off">{countdownLabel(seconds)}</strong></div>
}
