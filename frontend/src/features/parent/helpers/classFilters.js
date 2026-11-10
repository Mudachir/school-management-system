import { CLASS_LEVELS } from '../../classes/helpers/className.js'

export function classMetadata(name) {
  const match = /^(Play|Nursery|KG|Class (?:10|[1-9]))\s*-\s*(Morning|Day) Shift$/i.exec(name.trim())
  return match ? {
    level: CLASS_LEVELS.find((level) => level.toLowerCase() === match[1].toLowerCase()),
    shift: match[2].toLowerCase() === 'morning' ? 'Morning' : 'Day',
  } : { level: 'Other', shift: 'Other' }
}

export function filterParentClasses(classes, level, shift) {
  return classes.filter((item) => {
    const metadata = classMetadata(item.name)
    return (!level || metadata.level === level) && (!shift || metadata.shift === shift)
  })
}
