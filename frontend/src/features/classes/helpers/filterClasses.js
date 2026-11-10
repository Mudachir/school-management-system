export function filterClasses(classes, query) {
  const search = query.trim().toLocaleLowerCase()
  return classes.filter((item) => item.name.toLocaleLowerCase().includes(search))
}
