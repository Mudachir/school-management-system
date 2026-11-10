import assert from 'node:assert/strict'
import test from 'node:test'
import { getDashboardAnnouncement } from './dashboardAnnouncement.js'

test('loading, success, empty and error have distinct actionable announcements', () => {
  const loading = getDashboardAnnouncement('loading', 0)
  const success = getDashboardAnnouncement('success', 1)
  const empty = getDashboardAnnouncement('success', 0)
  const error = getDashboardAnnouncement('error', 0)
  assert.match(loading, /Loading admission classes/)
  assert.match(success, /Dashboard updated/)
  assert.match(empty, /No admission classes yet/)
  assert.match(error, /Unable to load admission classes.*Retry/)
  assert.equal(new Set([loading, success, empty, error]).size, 4)
})

test('ordinary success rerenders keep the same message rather than repeating counts', () => {
  assert.equal(getDashboardAnnouncement('success', 1), getDashboardAnnouncement('success', 5))
  assert.equal(getDashboardAnnouncement('idle', 0), '')
})
