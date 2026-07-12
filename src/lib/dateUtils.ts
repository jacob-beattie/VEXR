// Canonical Monday-start week boundaries — the app treats every week as Monday through Sunday
// (calendar week view, weekly load, analytics weekly buckets). Previously reimplemented with the
// same `day === 0 ? -6 : 1 - day` idiom independently in ~8 places; consolidated here so a future
// change to week-start convention only needs one edit.

/** Returns the Monday 00:00:00.000 of the week containing `date` (local time). */
export function getWeekStart(date: Date): Date {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(date)
  start.setDate(date.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return start
}

/** Returns the Sunday 23:59:59.999 of the week containing `date` (local time). */
export function getWeekEnd(date: Date): Date {
  const end = getWeekStart(date)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}
