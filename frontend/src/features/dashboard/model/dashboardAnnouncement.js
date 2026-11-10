export function getDashboardAnnouncement(status, classCount) {
  if (status === 'loading') return 'Loading admission classes.'
  if (status === 'error') return 'Unable to load admission classes. Use Retry to try again.'
  if (status === 'success') {
    return classCount === 0
      ? 'Dashboard loaded. No admission classes yet.'
      : 'Dashboard updated from the admission service.'
  }
  return ''
}
